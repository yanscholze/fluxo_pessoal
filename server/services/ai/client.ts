/**
 * Cliente de IA do Fluxo. Cada usuário escolhe e guarda a própria chave;
 * nenhuma credencial global é compartilhada entre contas.
 *
 * Ambos recebem o mesmo schema de saída e as mesmas regras de domínio. A
 * chamada à OpenAI usa `store: false`; a do Gemini usa JSON estruturado.
 */

import { DomainError, rateLimited } from "../../../core/kernel/errors.ts";
import { env } from "cloudflare:workers";
import { integrationStatus, integrationToken } from "../integration-credentials.ts";

const OPENAI_ENDPOINT = "https://api.openai.com/v1/responses";
const GEMINI_MODEL = "gemini-3.8-flash";
const GEMINI_FALLBACK_MODEL = "gemini-3.6-flash";
const TIMEOUT_MS = 30_000;

const OPENAI_MODEL = "gpt-5-mini";

export async function activeProvider(userId: string): Promise<"Gemini" | "OpenAI" | null> {
  const provider = (await integrationStatus(userId)).activeAiProvider;
  return provider === "gemini" ? "Gemini" : provider === "openai" ? "OpenAI" : scopedEnvironmentToken(userId) ? "Gemini" : null;
}

export async function isConfigured(userId: string): Promise<boolean> {
  return (await activeProvider(userId)) !== null;
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
  readonly history?: readonly { readonly role: "user" | "assistant"; readonly content: string }[];
  readonly onMetadata?: (metadata: ProviderMetadata) => void;
};

/** An environment credential belongs to exactly one account; never a tenant-wide fallback. */
function scopedEnvironmentToken(userId: string): string | null {
  return env.GEMINI_USER_ID === userId && typeof env.GEMINI_API_KEY === "string" && env.GEMINI_API_KEY.trim()
    ? env.GEMINI_API_KEY.trim() : null;
}

export type ProviderMetadata = { provider: "gemini" | "openai"; model: string };
export async function askWithMetadata<T>(userId: string, input: AskInput): Promise<{ value: T; metadata: ProviderMetadata }> {
  let metadata: ProviderMetadata | undefined;
  const value = await ask<T>(userId, { ...input, onMetadata: (used) => { metadata = used; } });
  if (!metadata) throw new DomainError("conflict", "A IA não informou o modelo utilizado.");
  return { value, metadata };
}

export interface AIProvider {
  generate<T>(input: AskInput, token: string): Promise<T>;
}
const providers: Record<"gemini" | "openai", AIProvider> = {
  gemini: { generate: askGemini },
  openai: { generate: askOpenAI },
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
  const selected = (await integrationStatus(userId)).activeAiProvider;
  const provider = selected ?? (scopedEnvironmentToken(userId) ? "gemini" : null);
  if (!provider) {
    throw new DomainError("conflict", "Configure sua chave de IA em Configurações → Integrações.");
  }
  const token = selected ? await integrationToken(userId, provider) : scopedEnvironmentToken(userId);
  if (!token) throw new DomainError("conflict", "A chave de IA selecionada não está disponível.");
  return providers[provider].generate<T>(input, token);
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
        input: [...(input.history ?? []).slice(-12).map((message) => ({ role: message.role, content: message.content.slice(0, 6000) })), { role: "user", content: input.content }],
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
    console.error("Falha na API da OpenAI", resposta.status);
    throw new DomainError("conflict", "Não foi possível falar com o assistente agora.");
  }

  const corpo = await providerJson<ResponsesBody>(resposta);
  const texto = corpo.output_text ?? extractText(corpo);
  const result = parseStructured<T>(texto);
  input.onMetadata?.({ provider: "openai", model: OPENAI_MODEL });
  return result;
}

async function askGemini<T>(input: AskInput, token: string): Promise<T> {
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  const configuredModel = typeof env.GEMINI_MODEL === "string" && /^[a-z0-9][a-z0-9._-]{1,80}$/.test(env.GEMINI_MODEL) ? env.GEMINI_MODEL : GEMINI_MODEL;
  let usedModel = configuredModel;
  let resposta = await requestGemini(usedModel, input, token, signal);
  // O provedor recomenda recuar progressivamente quando retorna 503. A chave
  // pode estar correta e o modelo indisponível; repetir imediatamente a mesma
  // chamada só aumenta a fila. Depois tentamos outro modelo da mesma conta.
  if (resposta.status === 503) {
    await delay(1_000);
    resposta = await requestGemini(configuredModel, input, token, signal);
  }
  if (resposta.status === 503) {
    await delay(2_000);
    usedModel = GEMINI_FALLBACK_MODEL;
    resposta = await requestGemini(usedModel, input, token, signal);
  }
  if (resposta.status === 404 && configuredModel !== GEMINI_FALLBACK_MODEL) {
    usedModel = GEMINI_FALLBACK_MODEL;
    resposta = await requestGemini(usedModel, input, token, signal);
  }

  if (resposta.status === 429) {
    throw rateLimited("O provedor está sobrecarregado. Tente daqui a pouco.", 30);
  }
  if (!resposta.ok) {
    console.error("Falha na API do Gemini", resposta.status);
    if (resposta.status === 503) {
      throw new DomainError("conflict", "O Gemini está temporariamente indisponível. Sua chave está cadastrada; tente novamente em alguns minutos.");
    }
    if (resposta.status === 401 || resposta.status === 403) {
      throw new DomainError("conflict", "A chave Gemini não tem acesso ao modelo. Confira a chave em Configurações → Integrações.");
    }
    if (resposta.status === 404) throw new DomainError("conflict", "O modelo Gemini não está disponível para esta chave. Confira a configuração GEMINI_MODEL do servidor.");
    throw new DomainError("conflict", "Não foi possível falar com o assistente agora.");
  }

  const corpo = await providerJson<GeminiBody>(resposta);
  const texto = corpo.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? null;
  const result = parseStructured<T>(texto);
  input.onMetadata?.({ provider: "gemini", model: usedModel });
  return result;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestGemini(model: string, input: AskInput, token: string, signal: AbortSignal): Promise<Response> {
  let resposta: Response;
  try {
    resposta = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: {
        "x-goog-api-key": token,
        "content-type": "application/json",
      },
      signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: input.instructions }] },
        contents: [...(input.history ?? []).slice(-12).map((message) => ({ role: message.role === "assistant" ? "model" : "user", parts: [{ text: message.content.slice(0, 6000) }] })), { role: "user", parts: input.content.map(geminiPart) }],
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

async function providerJson<T>(response: Response): Promise<T> {
  try { return await response.json() as T; }
  catch { throw new DomainError("conflict", "A IA devolveu uma resposta ilegível. Tente novamente."); }
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
