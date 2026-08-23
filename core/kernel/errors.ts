/**
 * Erros de domínio.
 *
 * O domínio não conhece HTTP. Ele sinaliza o que aconteceu com um `code`
 * estável; traduzir isso em status e corpo de resposta é trabalho da borda
 * (`server/http`). Assim a mesma regra vale para a web, para o Android e para
 * um script de linha de comando.
 */

export type DomainErrorCode =
  /** Entrada malformada ou fora das faixas aceitas. */
  | "validation"
  /** A entidade referenciada não existe ou não pertence ao usuário. */
  | "not_found"
  /** A operação contraria uma regra de negócio (ex.: pagar mais que a fatura). */
  | "conflict"
  /** Já existe um registro com a mesma identidade natural. */
  | "duplicate"
  /** O usuário não tem permissão sobre o recurso. */
  | "forbidden"
  /** Concorrência otimista: a versão base não é mais a atual. */
  | "version_conflict"
  /** Limite de uso atingido (quota de IA, tentativas de login). */
  | "rate_limited";

/** Detalhe de validação apontando o campo que falhou. */
export type FieldIssue = {
  readonly path: string;
  readonly message: string;
};

export class DomainError extends Error {
  readonly code: DomainErrorCode;
  readonly issues: readonly FieldIssue[];
  readonly details?: Readonly<Record<string, unknown>>;

  constructor(
    code: DomainErrorCode,
    message: string,
    options: { issues?: readonly FieldIssue[]; details?: Record<string, unknown>; cause?: unknown } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "DomainError";
    this.code = code;
    this.issues = options.issues ?? [];
    this.details = options.details;
  }
}

export function validationError(message: string, issues: readonly FieldIssue[] = []): DomainError {
  return new DomainError("validation", message, { issues });
}

export function notFound(entity: string, id?: string): DomainError {
  return new DomainError("not_found", `${entity} não encontrado`, { details: id ? { id } : undefined });
}

export function conflict(message: string, details?: Record<string, unknown>): DomainError {
  return new DomainError("conflict", message, { details });
}

export function duplicate(message: string, details?: Record<string, unknown>): DomainError {
  return new DomainError("duplicate", message, { details });
}

export function forbidden(message = "Acesso negado"): DomainError {
  return new DomainError("forbidden", message);
}

export function versionConflict(currentVersion: number, details?: Record<string, unknown>): DomainError {
  return new DomainError("version_conflict", "O registro foi alterado por outro dispositivo", {
    details: { currentVersion, ...details },
  });
}

export function rateLimited(message: string, retryAfterSeconds?: number): DomainError {
  return new DomainError("rate_limited", message, {
    details: retryAfterSeconds === undefined ? undefined : { retryAfterSeconds },
  });
}

export function isDomainError(value: unknown): value is DomainError {
  return value instanceof DomainError;
}
