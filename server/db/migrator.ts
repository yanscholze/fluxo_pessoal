/**
 * Aplicação de migrations.
 *
 * O Sites não expõe passo de deploy onde rodar `wrangler d1 migrations apply`,
 * então a aplicação acontece na primeira requisição depois de um deploy. Isso
 * **não** é o antipadrão anterior: lá o schema era re-derivado a cada
 * requisição por introspecção `PRAGMA`, sem versão nem ordem, e só sabia
 * adicionar coluna. Aqui existe um diário: cada migration tem número, roda uma
 * única vez, em ordem, e fica registrada.
 */

import { sql } from "drizzle-orm";

import { getDatabase } from "./client.ts";
import inicial from "./migrations/0000_inicial.sql?raw";

type Migration = {
  readonly id: number;
  readonly name: string;
  readonly sql: string;
};

/**
 * O diário. Ordem importa e nunca muda: adicionar migration é acrescentar ao
 * fim, jamais editar uma existente — quem já rodou a antiga não roda de novo.
 */
const MIGRATIONS: readonly Migration[] = [{ id: 0, name: "inicial", sql: inicial }];

/** Separador que o drizzle-kit emite entre statements. */
const STATEMENT_SEPARATOR = "--> statement-breakpoint";

function statementsOf(migration: Migration): string[] {
  return migration.sql
    .split(STATEMENT_SEPARATOR)
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0 && !statement.startsWith("--"));
}

let applied: Promise<void> | null = null;

/**
 * Garante que o banco está na versão do código.
 *
 * Memoizado por isolate: custa uma consulta ao diário na primeira requisição
 * e nada nas seguintes. Em caso de falha o memo é limpo, para que a próxima
 * requisição tente de novo em vez de servir para sempre um banco quebrado.
 */
export function ensureMigrated(): Promise<void> {
  applied ??= run().catch((error) => {
    applied = null;
    throw error;
  });
  return applied;
}

async function run(): Promise<void> {
  const database = getDatabase();

  await database.run(sql`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const rows = await database.all<{ id: number }>(sql`SELECT id FROM _migrations`);
  const done = new Set(rows.map((row) => row.id));

  for (const migration of MIGRATIONS) {
    if (done.has(migration.id)) continue;

    const statements = statementsOf(migration);
    // Um lote por migration: ou toda ela entra, ou nenhuma parte entra.
    await database.batch([
      ...statements.map((statement) => database.run(sql.raw(statement))),
      database.run(
        sql`INSERT INTO _migrations (id, name) VALUES (${migration.id}, ${migration.name})`,
      ),
    ] as never);
  }
}

/** Só para teste e diagnóstico. */
export function migrationCount(): number {
  return MIGRATIONS.length;
}
