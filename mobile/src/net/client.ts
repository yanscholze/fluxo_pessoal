/**
 * Cliente HTTP.
 *
 * Uma única porta de saída para o servidor. Concentrar aqui garante que todo
 * lugar do aplicativo trate erro de rede e erro de negócio da mesma forma — na
 * versão anterior cada tela tinha o seu `fetch` com o seu `catch`, e o
 * comportamento diferia de tela para tela.
 *
 * A distinção que importa: **não deu para falar com o servidor** (offline) é
 * diferente de **o servidor disse não**. A primeira faz a fila de saída
 * esperar; a segunda precisa aparecer para o usuário.
 */

import type { ErrorBody } from "./types.ts";

/** Não foi possível falar com o servidor. O dado local continua válido. */
export class OfflineError extends Error {
  constructor(cause?: unknown) {
    super("Sem conexão com o servidor");
    this.name = "OfflineError";
    this.cause = cause;
  }
}

/** O servidor respondeu recusando. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly issues: readonly { path: string; message: string }[];

  constructor(status: number, body: ErrorBody | null) {
    super(body?.error?.message ?? "Não foi possível concluir a operação.");
    this.name = "ApiError";
    this.status = status;
    this.code = body?.error?.code ?? "internal";
    this.issues = body?.error?.issues ?? [];
  }

  /** O token não vale mais: expirou, foi revogado, ou a senha mudou. */
  get isUnauthenticated(): boolean {
    return this.status === 401;
  }
}

const TIMEOUT_MS = 15_000;

export type RequestOptions = {
  readonly baseUrl: string;
  readonly token?: string | null;
  readonly method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  readonly body?: unknown;
  readonly signal?: AbortSignal;
};

/**
 * Faz a chamada e devolve o `data` da resposta.
 *
 * O tempo limite existe porque `fetch` sem ele espera para sempre num túnel:
 * a sincronização ficaria pendurada e a fila nunca tentaria de novo.
 */
export async function call<T>(path: string, options: RequestOptions): Promise<T> {
  const controlador = new AbortController();
  const prazo = setTimeout(() => controlador.abort(), TIMEOUT_MS);

  const cancelamentoExterno = () => controlador.abort();
  options.signal?.addEventListener("abort", cancelamentoExterno);

  let resposta: Response;
  try {
    resposta = await fetch(`${options.baseUrl}${path}`, {
      method: options.method ?? "GET",
      headers: {
        accept: "application/json",
        ...(options.body === undefined ? {} : { "content-type": "application/json" }),
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controlador.signal,
    });
  } catch (erro) {
    throw new OfflineError(erro);
  } finally {
    clearTimeout(prazo);
    options.signal?.removeEventListener("abort", cancelamentoExterno);
  }

  const corpo = (await resposta.json().catch(() => null)) as { data?: T } | ErrorBody | null;

  if (!resposta.ok) {
    throw new ApiError(resposta.status, (corpo as ErrorBody | null)?.error ? (corpo as ErrorBody) : null);
  }

  // Resposta sem `data` só acontece se o servidor mudar de contrato; tratar
  // como erro aqui evita `undefined` vazando para dentro do aplicativo.
  const dados = (corpo as { data?: T } | null)?.data;
  if (dados === undefined) throw new ApiError(resposta.status, null);
  return dados;
}
