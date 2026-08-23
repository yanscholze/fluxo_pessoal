/**
 * Tipos do runtime Cloudflare.
 *
 * O projeto não instala `@cloudflare/workers-types`, então `D1Database`,
 * `Fetcher` e o módulo virtual `cloudflare:workers` não existiam para o
 * compilador. Com `skipLibCheck` ligado, o erro ficava escondido dentro dos
 * `.d.ts` de dependência e só aparecia em `worker/index.ts` — o resto do
 * código convivia com `any` silencioso onde deveria haver tipo.
 *
 * As declarações abaixo cobrem exatamente a superfície que este projeto usa.
 * Se um dia `@cloudflare/workers-types` entrar como dependência, este arquivo
 * sai inteiro.
 */

interface D1Result<T = Record<string, unknown>> {
  results: T[];
  success: boolean;
  meta: Record<string, unknown>;
  error?: string;
}

interface D1ExecResult {
  count: number;
  duration: number;
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(colName: string): Promise<T | null>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  raw<T = unknown[]>(options?: { columnNames?: boolean }): Promise<T[]>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = Record<string, unknown>>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  exec(query: string): Promise<D1ExecResult>;
  dump(): Promise<ArrayBuffer>;
  withSession(constraintOrBookmark?: string): D1Database;
}

/** Binding de outro Worker ou dos assets estáticos. */
interface Fetcher {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

declare module "cloudflare:workers" {
  /**
   * Bindings declarados para este site.
   *
   * Precisa espelhar `.openai/hosting.json`.
   */
  export const env: {
    /** Banco D1. Declarado como `"d1": "DB"`. */
    readonly DB: D1Database;
    /** Segredos e variáveis de ambiente chegam como texto. */
    readonly [key: string]: unknown;
  };

  export function waitUntil(promise: Promise<unknown>): void;
}
