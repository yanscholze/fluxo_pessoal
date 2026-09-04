/**
 * Banco local do aparelho.
 *
 * O aplicativo é offline-first: ele lê e escreve daqui, e a sincronização é um
 * processo à parte. Nenhuma tela espera rede para mostrar dado.
 *
 * O esquema local é o **formato do fio** (ver `serialize` em
 * `server/services/sync.ts`), não uma cópia do banco do servidor. Guarda-se o
 * fato do lançamento; as movimentações do razão não são gravadas, e sim
 * derivadas na leitura por `postTransaction` — a **mesma** função que o
 * servidor usa (ver `src/finance/derive.ts`). Gravar razão nos dois lados
 * criaria duas cópias do mesmo número, livres para divergir.
 *
 * As migrações seguem o mesmo princípio do servidor: numeradas, aplicadas uma
 * vez, registradas numa tabela. Um esquema recriado por `DROP IF EXISTS` a
 * cada abertura apagaria a fila de saída de quem estivesse offline.
 */

import * as SQLite from "expo-sqlite";

const DATABASE_NAME = "fluxo.db";

type Migration = { readonly id: number; readonly name: string; readonly sql: string };

const MIGRATIONS: readonly Migration[] = [
  {
    id: 0,
    name: "esquema-inicial",
    sql: `
      CREATE TABLE accounts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        kind TEXT NOT NULL,
        currency TEXT NOT NULL DEFAULT 'BRL',
        -- Saldo é "início + movimentações". Sem o inicial, o número derivado
        -- aqui divergiria do que o site mostra.
        opening_balance_cents INTEGER NOT NULL DEFAULT 0,
        color TEXT,
        archived_at TEXT
      );

      CREATE TABLE categories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        kind TEXT NOT NULL,
        color TEXT,
        archived_at TEXT
      );

      CREATE TABLE cards (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        kind TEXT NOT NULL,
        closing_day INTEGER NOT NULL,
        due_day INTEGER NOT NULL,
        due_adjustment TEXT NOT NULL DEFAULT 'next',
        limit_cents INTEGER NOT NULL DEFAULT 0,
        color TEXT,
        archived_at TEXT
      );

      CREATE TABLE transactions (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        state TEXT NOT NULL,
        description TEXT NOT NULL,
        category_id TEXT,
        amount_cents INTEGER NOT NULL,
        occurred_on TEXT NOT NULL,
        competence TEXT NOT NULL,
        account_id TEXT,
        card_id TEXT,
        destination_account_id TEXT,
        destination_card_id TEXT,
        trip_id TEXT,
        installment_number INTEGER,
        notes TEXT,
        version INTEGER NOT NULL DEFAULT 0,
        deleted_at TEXT,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX transactions_occurred_idx ON transactions (occurred_on DESC, id DESC);
      CREATE INDEX transactions_competence_idx ON transactions (competence);

      -- Fila de saída. Uma linha por intenção do usuário, na ordem em que ele
      -- agiu: a ordem importa porque duas edições do mesmo lançamento
      -- precisam chegar ao servidor na mesma sequência em que aconteceram.
      CREATE TABLE outbox (
        mutation_id TEXT PRIMARY KEY,
        sequence INTEGER NOT NULL,
        entity TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        operation TEXT NOT NULL,
        base_version INTEGER NOT NULL,
        data_json TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        message TEXT,
        -- Versão que o servidor tinha quando recusou por conflito. É a base
        -- correta para reenviar; deduzir da base antiga erraria de novo.
        server_version INTEGER,
        attempts INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );

      CREATE INDEX outbox_status_idx ON outbox (status, sequence);

      -- Notificações capturadas que ainda não foram entregues ao servidor.
      CREATE TABLE capture_queue (
        device_event_id TEXT PRIMARY KEY,
        source_app TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        text TEXT NOT NULL,
        posted_at INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `,
  },
  {
    id: 1,
    name: "campos-do-livre-para-gastar",
    sql: `
      -- Os três campos que faltavam para o aplicativo calcular "livre para
      -- gastar" com a mesma regra do site.
      --
      -- Sem eles o aparelho caía numa aproximação — saldo menos comprometido —
      -- e mostrava um número diferente do que o site mostrava para o mesmo
      -- dinheiro. Uma regra, uma implementação, dois consumidores: para isso
      -- valer, os dois precisam receber as mesmas entradas.

      -- Conta fora dos totais não entra em saldo nem em livre para gastar.
      ALTER TABLE accounts ADD COLUMN include_in_totals INTEGER NOT NULL DEFAULT 1;

      -- Categoria que o usuário marcou para não pesar na folga.
      ALTER TABLE categories ADD COLUMN exclude_from_free_to_spend INTEGER NOT NULL DEFAULT 0;

      -- O cartão principal define a **janela** do cálculo: do fechamento dele
      -- ao seguinte. Sem saber qual é, o aparelho mediria o mesmo dinheiro num
      -- período diferente.
      ALTER TABLE cards ADD COLUMN is_primary INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE cards ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
    `,
  },
];

let handle: SQLite.SQLiteDatabase | null = null;
let opening: Promise<SQLite.SQLiteDatabase> | null = null;

/**
 * Abre o banco e aplica o que falta.
 *
 * A promessa é memoizada porque várias telas montam ao mesmo tempo na
 * abertura do aplicativo: sem isso, duas delas aplicariam as migrações em
 * paralelo.
 */
export function openDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (handle) return Promise.resolve(handle);
  opening ??= (async () => {
    const database = await SQLite.openDatabaseAsync(DATABASE_NAME);
    await database.execAsync("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    await migrate(database);
    handle = database;
    return database;
  })();
  return opening;
}

async function migrate(database: SQLite.SQLiteDatabase): Promise<void> {
  await database.execAsync(
    `CREATE TABLE IF NOT EXISTS _migrations (
       id INTEGER PRIMARY KEY,
       name TEXT NOT NULL,
       applied_at TEXT NOT NULL
     );`,
  );

  const aplicadas = await database.getAllAsync<{ id: number }>("SELECT id FROM _migrations");
  const jaAplicadas = new Set(aplicadas.map((linha) => linha.id));

  for (const migracao of MIGRATIONS) {
    if (jaAplicadas.has(migracao.id)) continue;
    // `execAsync` roda o lote inteiro numa transação implícita: uma migração
    // que falha no meio não deixa metade do esquema de pé.
    await database.execAsync(migracao.sql);
    await database.runAsync("INSERT INTO _migrations (id, name, applied_at) VALUES (?, ?, ?)", [
      migracao.id,
      migracao.name,
      new Date().toISOString(),
    ]);
  }
}

/**
 * Apaga todo o dado do usuário, preservando o esquema.
 *
 * Usado ao desconectar o aparelho: o próximo dono da sessão não pode ver o
 * histórico do anterior.
 */
export async function wipeUserData(): Promise<void> {
  const database = await openDatabase();
  await database.execAsync(`
    DELETE FROM transactions;
    DELETE FROM accounts;
    DELETE FROM categories;
    DELETE FROM cards;
    DELETE FROM outbox;
    DELETE FROM capture_queue;
    DELETE FROM meta;
  `);
}

// --- meta -------------------------------------------------------------------

export async function readMeta(key: string): Promise<string | null> {
  const database = await openDatabase();
  const linha = await database.getFirstAsync<{ value: string }>(
    "SELECT value FROM meta WHERE key = ?",
    [key],
  );
  return linha?.value ?? null;
}

export async function writeMeta(key: string, value: string): Promise<void> {
  const database = await openDatabase();
  await database.runAsync(
    "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [key, value],
  );
}
