/**
 * Bindings do Worker.
 *
 * O módulo virtual `cloudflare:workers` é injetado pelo runtime e não tem
 * tipos publicados no projeto. Sem esta declaração, `env` seria `any` e o
 * compilador não avisaria ao acessar um binding que não existe — foi assim
 * que o código anterior conviveu com nove erros de resolução de módulo.
 *
 * Os bindings aqui precisam espelhar `.openai/hosting.json`.
 */
declare module "cloudflare:workers" {
  /** Bindings declarados para este site. */
  export const env: {
    /** Banco D1. Declarado como `"d1": "DB"` em `.openai/hosting.json`. */
    readonly DB: D1Database;
    /** Segredos e variáveis de ambiente chegam como texto. */
    readonly [key: string]: unknown;
  };

  export function waitUntil(promise: Promise<unknown>): void;
}
