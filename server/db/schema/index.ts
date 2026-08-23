/**
 * Schema do Fluxo.
 *
 * Dividido por domínio para que cada arquivo caiba na cabeça. Convenções:
 *
 * - identificadores são ULID em `text`, sem semântica embutida;
 * - dinheiro é **centavo inteiro** (`*_cents`), nunca decimal;
 * - data civil é `YYYY-MM-DD`, competência é `YYYY-MM`, instante é ISO-8601;
 * - toda referência é **foreign key de verdade**, com `ON DELETE` explícito;
 * - toda tabela de usuário carrega `user_id` e é sempre consultada por ele.
 */

export * from "./identity.ts";
export * from "./catalog.ts";
export * from "./ledger.ts";
export * from "./automation.ts";
