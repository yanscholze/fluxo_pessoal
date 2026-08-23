/**
 * Aplicação de migrations.
 *
 * O Sites não expõe passo de deploy onde rodar `wrangler d1 migrations apply`,
 * então a aplicação acontece na primeira requisição depois de um deploy. Isso
 * **não** é o antipadrão anterior: lá o schema era re-derivado a cada
 * requisição por introspecção `PRAGMA`, sem versão nem ordem, e só sabia
 * adicionar coluna. Aqui existe um diário: cada migration tem número, roda uma
 * única vez, em ordem, e fica registrada em `_migrations`.
 */

import { sql } from "drizzle-orm";

import { type Database, getDatabase } from "./client.ts";
import inicial from "./migrations/0000_inicial.sql?raw";

type Migration = {
  readonly id: number;
  readonly name: string;
  readonly run: (database: Database) => Promise<void>;
};

/** Separador que o drizzle-kit emite entre statements. */
const STATEMENT_SEPARATOR = "--> statement-breakpoint";

function statementsOf(text: string): string[] {
  return text
    .split(STATEMENT_SEPARATOR)
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0 && !statement.startsWith("--"));
}

/** Migration a partir de um arquivo `.sql` gerado pelo drizzle-kit. */
function fromSql(text: string): (database: Database) => Promise<void> {
  return async (database) => {
    const statements = statementsOf(text);
    if (!statements.length) return;
    // Um lote por migration: ou toda ela entra, ou nenhuma parte entra.
    await database.batch(statements.map((statement) => database.run(sql.raw(statement))) as never);
  };
}

/**
 * Tabelas da primeira implementação que colidem em nome com as novas.
 *
 * Elas são renomeadas antes de o schema novo ser criado, e não apagadas: são a
 * origem da migração de dados e a última linha de defesa se algo der errado.
 * As demais tabelas antigas ficam onde estão até a limpeza final.
 */
const COLLIDING_LEGACY_TABLES = ["users", "accounts", "categories", "cards", "trips", "transactions"] as const;

async function renameLegacyTables(database: Database): Promise<void> {
  const rows = await database.all<{ name: string }>(
    sql`SELECT name FROM sqlite_master WHERE type = 'table'`,
  );
  const present = new Set(rows.map((row) => row.name));

  for (const table of COLLIDING_LEGACY_TABLES) {
    const legacy = `legacy_${table}`;
    // Só renomeia o que existe e ainda não foi renomeado. Num banco novo
    // (desenvolvimento, teste) nada acontece.
    if (!present.has(table) || present.has(legacy)) continue;
    await database.run(sql.raw(`ALTER TABLE "${table}" RENAME TO "${legacy}"`));
  }
}

/**
 * O diário. Ordem importa e nunca muda: acrescentar migration é adicionar ao
 * fim, jamais editar uma existente — quem já rodou a antiga não roda de novo.
 */
const MIGRATIONS: readonly Migration[] = [
  { id: 0, name: "renomeia-tabelas-legadas", run: renameLegacyTables },
  { id: 1, name: "schema-inicial", run: fromSql(inicial) },
];

let applied: Promise<void> | null = null;

/**
 * Garante que o banco está na versão do código.
 *
 * Memoizado por isolate: custa uma consulta ao diário na primeira requisição e
 * nada nas seguintes. Em caso de falha o memo é limpo, para que a próxima
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
    await migration.run(database);
    await database.run(
      sql`INSERT INTO _migrations (id, name) VALUES (${migration.id}, ${migration.name})`,
    );
  }
}

/** Só para diagnóstico. */
export function migrationCount(): number {
  return MIGRATIONS.length;
}
