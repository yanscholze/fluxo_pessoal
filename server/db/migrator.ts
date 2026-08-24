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
import vinculoRecorrencia from "./migrations/0001_recurrence-link.sql?raw";
import naturezaMovimentacao from "./migrations/0002_ledger-kind.sql?raw";

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
 * Nomes de tabela que uma migration cria.
 *
 * Extraído do próprio SQL em vez de mantido numa lista à mão: uma lista
 * manual esquece um nome — foi assim que `user_profiles` passou batido e a
 * migration quebrou com "table already exists" na primeira execução.
 */
function tablesCreatedBy(text: string): string[] {
  const matches = text.matchAll(/CREATE TABLE(?:\s+IF NOT EXISTS)?\s+[`"]?([A-Za-z_][\w]*)[`"]?/gi);
  return [...matches].map((match) => match[1]);
}

/**
 * Afasta as tabelas da primeira implementação que colidem em nome com as novas.
 *
 * Elas são renomeadas, não apagadas: são a origem da migração de dados e a
 * última linha de defesa se algo der errado. As tabelas antigas sem colisão
 * ficam onde estão até a limpeza final.
 */
async function renameLegacyTables(database: Database): Promise<void> {
  const rows = await database.all<{ name: string }>(
    sql`SELECT name FROM sqlite_master WHERE type = 'table'`,
  );
  const present = new Set(rows.map((row) => row.name));

  for (const table of tablesCreatedBy(inicial)) {
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
  {
    id: 0,
    name: "schema-inicial",
    // Afastar o legado e criar o schema são o mesmo passo. Separá-los deixaria
    // o banco num estado onde o primeiro já rodou e o segundo não, e o retry
    // pularia justamente a parte que precisava rodar de novo.
    run: async (database) => {
      await renameLegacyTables(database);
      await fromSql(inicial)(database);
    },
  },
  { id: 1, name: "vincula-lancamento-a-recorrencia", run: fromSql(vinculoRecorrencia) },
  { id: 2, name: "natureza-da-movimentacao", run: fromSql(naturezaMovimentacao) },
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
