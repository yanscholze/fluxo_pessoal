/**
 * Borda HTTP.
 *
 * O domínio não conhece status code. Ele lança `DomainError` com um `code`
 * estável e é aqui — no único lugar — que isso vira resposta. Uma rota nova
 * ganha tratamento de erro correto de graça, sem copiar `try/catch`.
 */

import { DomainError, type DomainErrorCode, isDomainError } from "../../core/kernel/errors.ts";

const STATUS_BY_CODE: Record<DomainErrorCode, number> = {
  validation: 400,
  not_found: 404,
  conflict: 409,
  duplicate: 409,
  forbidden: 401,
  version_conflict: 412,
  rate_limited: 429,
};

export type ErrorBody = {
  readonly error: {
    readonly code: DomainErrorCode | "internal";
    readonly message: string;
    readonly issues?: readonly { path: string; message: string }[];
    readonly details?: Readonly<Record<string, unknown>>;
  };
};

export function json(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  // Dado financeiro nunca deve ser guardado por intermediário.
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(body), { ...init, headers });
}

export function noContent(init: ResponseInit = {}): Response {
  return new Response(null, { ...init, status: 204 });
}

export function errorResponse(error: unknown): Response {
  if (isDomainError(error)) {
    const status = STATUS_BY_CODE[error.code] ?? 400;
    const body: ErrorBody = {
      error: {
        code: error.code,
        message: error.message,
        ...(error.issues.length ? { issues: error.issues } : {}),
        ...(error.details ? { details: error.details } : {}),
      },
    };
    const headers = new Headers();
    if (error.code === "forbidden") headers.set("www-authenticate", "Bearer");
    if (error.code === "rate_limited") {
      const retry = error.details?.retryAfterSeconds;
      if (typeof retry === "number") headers.set("retry-after", String(Math.ceil(retry)));
    }
    return json(body, { status, headers });
  }

  // Erro não previsto: o cliente recebe uma mensagem genérica; o detalhe fica
  // no log, nunca na resposta.
  console.error("Erro não tratado na borda HTTP", error);
  const body: ErrorBody = {
    error: { code: "internal", message: "Não foi possível concluir a operação. Tente novamente." },
  };
  return json(body, { status: 500 });
}

/**
 * Envolve um handler de rota.
 *
 * Garante que o banco está migrado antes de qualquer consulta e que toda
 * exceção sai como resposta bem formada.
 */
export function handle(handler: (request: Request) => Promise<Response>): (request: Request) => Promise<Response> {
  return async (request: Request) => {
    try {
      const { ensureMigrated } = await import("../db/migrator.ts");
      await ensureMigrated();
      return await handler(request);
    } catch (error) {
      return errorResponse(error);
    }
  };
}

/** Lê o corpo como JSON, recusando o que não for objeto. */
export async function readJson(request: Request): Promise<Record<string, unknown>> {
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    throw new DomainError("validation", "Corpo da requisição não é JSON válido");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new DomainError("validation", "Corpo da requisição precisa ser um objeto");
  }
  return parsed as Record<string, unknown>;
}
