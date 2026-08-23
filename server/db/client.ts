/**
 * Acesso ao banco.
 *
 * Único ponto do sistema que conhece o D1. Nada fora de `server/repositories`
 * deve importar isto.
 */

import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";

import * as schema from "./schema/index.ts";

export type Database = ReturnType<typeof drizzle<typeof schema>>;

let cached: Database | null = null;

export function getDatabase(): Database {
  if (cached) return cached;

  if (!env.DB) {
    throw new Error(
      "Binding D1 `DB` indisponível. Defina o campo `d1` em .openai/hosting.json como `DB` " +
        "ou deixe o painel injetar o binding real antes de usar o banco.",
    );
  }

  cached = drizzle(env.DB, { schema });
  return cached;
}

/**
 * Executa várias escritas atomicamente.
 *
 * O D1 não expõe `BEGIN`/`COMMIT` por statement; a unidade atômica é o
 * `batch`. Postar um lançamento é sempre "apaga as movimentações antigas e
 * grava as novas" — precisa ir num lote só, ou um saldo fica pela metade.
 */
export async function runAtomic(
  statements: readonly [D1PreparedStatementLike, ...D1PreparedStatementLike[]],
): Promise<void> {
  const database = getDatabase();
  await database.batch(statements as never);
}

/** O que `drizzle` devolve de um `insert`/`update`/`delete` sem `await`. */
type D1PreparedStatementLike = { toSQL(): unknown };

export { schema };
