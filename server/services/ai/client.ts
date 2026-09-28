/**
 * Cliente de IA do Fluxo. Cada usuário escolhe e guarda a própria chave;
 * nenhuma credencial global é compartilhada entre contas.
 *
 * Ambos recebem o mesmo schema de saída e as mesmas regras de domínio. A
 * chamada à OpenAI usa `store: false`; a do Gemini usa JSON estruturado.
 */

import { DomainError, rateLimited } from "../../../core/kernel/errors.ts";
import { integrationStatus, integrationToken } from "../integration-credentials.ts";

const OPENAI_ENDPOINT = "https://api.openai.com/v1/responses";
const GEMINI_MODEL = "gemini-3.6-flash";
const GEMINI_FALLBACK_MODEL = "gemini-3.8-flash";
const TIMEOUT_MS = 45_000;

const OPENAI_MODEL = "gpt-5-mini";

export async function activeProvider(userId: string): Promise<"Gemini" | "OpenAI" | null> {
  const provider = (await integrationStatus(userId)).activeAiProvider;
  return provider === "gemini" ? "Gemini" : provider === "openai" ? "OpenAI" : null;
}

export async function isConfigured(userId: string): Promise<boolean> {
  return (await integrationStatus(userId)).activeAiProvider !== null;
}

/**
 * Recusa a operação quando não há chave.
 *
 * Chame antes de consumir cota: numa instalação sem chave, cada tentativa
 * queimaria uma consulta que nunca chegou a acontecer.
 */
export async function assertConfigured(userId: string): Promise<void> {
  if (!(await isConfigured(userId))) {
    throw new DomainError("conflict", "Configure sua chave de IA em Configurações → Integrações.", {
      details: { missing: "Chave pessoal do Gemini ou da OpenAI" },
    });
  }
}

export type ContentPart =
  | { readonly type: "input_text"; readonly text: string }
  | { readonly type: "input_image"; readonly image_url: string };

export type AskInput = {
  readonly instructions: string;
  readonly content: readonly ContentPart[];
  readonly schemaName: string;
  readonly schema: Record<string, unknown>;
};

type ResponsesBody = {
  output_text?: string;
  output?: { content?: { type?: string; text?: string }[] }[];
  error?: { message?: string };
};

type GeminiBody = {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
};

/**
 * Faz a chamada e devolve o objeto estruturado pelo provedor. Os serviços
 * de cada recurso ainda validam o conteúdo antes de usá-lo.
 *
 * Erros do provedor viram `DomainError` com código estável para a borda HTTP.
 */
export async function ask<T>(userId: string, input: AskInput): Promise<T> {
  const provider = (await integrationStatus(userId)).activeAiProvider;
  if (!provider) {
    throw new DomainError("conflict", "Configure sua chave de IA em Configurações → Integrações.");
  }
  const token = await integrationToken(userId, provider);
  if (!token) throw new DomainError("conflict", "A chave de IA selecionada não está disponível.");
  return provider === "gemini" ? askGemini<T>(input, token) : askOpenAI<T>(input, token);
}

async function askOpenAI<T>(input: AskInput, token: string): Promise<T> {
  let resposta: Response;
  try {
    resposta = await fetch(OPENAI_ENDPOINT, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: JSON.stringify({
        model: OPENAI_MODEL,
        instructions: input.instructions,
        input: [{ role: "user", content: input.content }],
        store: false,
        text: {
          format: {
            type: "json_schema",
            name: input.schemaName,
            strict: true,
            schema: input.schema,
          },
        },
      }),
    });
  } catch (causa) {
    // Tempo esgotado ou rede fora. O usuário não tem o que fazer além de
    // tentar de novo, e é isso que a mensagem diz.
    throw new DomainError("conflict", "O assistente demorou demais para responder. Tente de novo.", {
      cause: causa,
    });
  }

  if (resposta.status === 429) {
    throw rateLimited("O provedor está sobrecarregado. Tente daqui a pouco.", 30);
  }

  if (!resposta.ok) {
    const corpo = (await resposta.json().catch(() => ({}))) as ResponsesBody;
    console.error("Falha na API da OpenAI", resposta.status, corpo.error?.message);
    throw new DomainError("conflict", "Não foi possível falar com o assistente agora.");
  }

  const corpo = (await resposta.json()) as ResponsesBody;
  const texto = corpo.output_text ?? extractText(corpo);
  return parseStructured<T>(texto);
}

async function askGemini<T>(input: AskInput, token: string): Promise<T> {
  let resposta = await requestGemini(GEMINI_MODEL, input, token);
  // O provedor recomenda recuar progressivamente quando retorna 503. A chave
  // pode estar correta e o modelo indisponível; repetir imediatamente a mesma
  // chamada só aumenta a fila. Depois tentamos outro modelo da mesma conta.
  if (resposta.status === 503) {
    await delay(1_000);
    resposta = await requestGemini(GEMINI_MODEL, input, token);
  }
  if (resposta.status === 503) {
    await delay(2_000);
    resposta = await requestGemini(GEMINI_FALLBACK_MODEL, input, token);
  }

  if (resposta.status === 429) {
    throw rateLimited("O provedor está sobrecarregado. Tente daqui a pouco.", 30);
  }
  if (!resposta.ok) {
    const corpo = (await resposta.json().catch(() => ({}))) as { error?: { status?: string } };
    console.error("Falha na API do Gemini", resposta.status, corpo.error?.status);
    if (resposta.status === 503) {
      throw new DomainError("conflict", "O Gemini está temporariamente indisponível. Sua chave está cadastrada; tente novamente em alguns minutos.");
    }
    if (resposta.status === 401 || resposta.status === 403) {
      throw new DomainError("conflict", "A chave Gemini não tem acesso ao modelo. Confira a chave em Configurações → Integrações.");
    }
    throw new DomainError("conflict", "Não foi possível falar com o assistente agora.");
  }

  const corpo = (await resposta.json()) as GeminiBody;
  const texto = corpo.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? null;
  return parseStructured<T>(texto);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestGemini(model: string, input: AskInput, token: string): Promise<Response> {
  let resposta: Response;
  try {
    resposta = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: {
        "x-goog-api-key": token,
        "content-type": "application/json",
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: input.instructions }] },
        contents: [{ role: "user", parts: input.content.map(geminiPart) }],
        generationConfig: {
          responseMimeType: "application/json",
          responseJsonSchema: input.schema,
        },
      }),
    });
  } catch (causa) {
    throw new DomainError("conflict", "O assistente demorou demais para responder. Tente de novo.", {
      cause: causa,
    });
  }

  return resposta;
}

function geminiPart(part: ContentPart) {
  if (part.type === "input_text") return { text: part.text };
  const match = /^data:([^;,]+);base64,([\s\S]+)$/i.exec(part.image_url);
  if (!match) throw new DomainError("conflict", "Formato da imagem não reconhecido pelo assistente.");
  return { inlineData: { mimeType: match[1], data: match[2] } };
}

function parseStructured<T>(texto: string | null): T {
  if (!texto) throw new DomainError("conflict", "O assistente devolveu uma resposta vazia.");

  try {
    return JSON.parse(texto) as T;
  } catch (causa) {
    throw new DomainError("conflict", "O assistente devolveu uma resposta ilegível.", { cause: causa });
  }
}

/** Alguns formatos de resposta trazem o texto aninhado em vez de `output_text`. */
function extractText(body: ResponsesBody): string | null {
  for (const item of body.output ?? []) {
    for (const parte of item.content ?? []) {
      if (parte.type === "output_text" && parte.text) return parte.text;
    }
  }
  return null;
}
