/**
 * Cliente da API da OpenAI.
 *
 * Sempre com saída estruturada (`json_schema` estrito) e `store: false`. O
 * schema é o que impede a resposta virar texto livre que a interface precisa
 * adivinhar como exibir; o `store` é privacidade: dado financeiro do usuário
 * não fica guardado no provedor.
 */

import { env } from "cloudflare:workers";

import { DomainError, rateLimited } from "../../../core/kernel/errors.ts";

const ENDPOINT = "https://api.openai.com/v1/responses";
const TIMEOUT_MS = 45_000;

/** Modelo padrão. Barato o suficiente para as duas features do produto. */
const MODEL = "gpt-5-mini";

export function isConfigured(): boolean {
  return typeof env.OPENAI_API_KEY === "string" && env.OPENAI_API_KEY.length > 0;
}

/**
 * Recusa a operação quando não há chave.
 *
 * Chame antes de consumir cota: numa instalação sem chave, cada tentativa
 * queimaria uma consulta que nunca chegou a acontecer.
 */
export function assertConfigured(): void {
  if (!isConfigured()) {
    throw new DomainError("conflict", "O assistente não está configurado nesta instalação", {
      details: { missing: "OPENAI_API_KEY" },
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

/**
 * Faz a chamada e devolve o objeto já validado pelo schema.
 *
 * Erros do provedor viram `DomainError` com código estável, para a borda HTTP
 * traduzir sem que a rota precise conhecer a OpenAI.
 */
export async function ask<T>(input: AskInput): Promise<T> {
  assertConfigured();

  let resposta: Response;
  try {
    resposta = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.OPENAI_API_KEY as string}`,
        "content-type": "application/json",
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: JSON.stringify({
        model: MODEL,
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
