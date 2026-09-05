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
import importacao from "./migrations/0003_import-pipeline.sql?raw";
import planejamento from "./migrations/0004_planning-modules.sql?raw";
import recompensas from "./migrations/0005_rewards.sql?raw";
import usoDaIa from "./migrations/0006_ai-usage.sql?raw";
import captura from "./migrations/0007_capture.sql?raw";
import sincronizacao from "./migrations/0008_sync.sql?raw";
import pareamento from "./migrations/0009_pairing.sql?raw";
import categoriaDaCaptura from "./migrations/0010_capture-category.sql?raw";
import areaDeTrabalho from "./migrations/0011_dev-area.sql?raw";
import fichaDoProjeto from "./migrations/0012_project-info.sql?raw";
import conciliacao from "./migrations/0013_receipt-rules.sql?raw";
import classificacoes from "./migrations/0014_subscription-labels.sql?raw";
import cobrancaDeAssinatura from "./migrations/0015_subscription-charges.sql?raw";
import valorRecebido from "./migrations/0016_received-amount.sql?raw";
import categoriaDeTempo from "./migrations/0017_time-activity-and-documents.sql?raw";

type Migration = {
  readonly id: number;
  readonly name: string;
  readonly run: (database: Database) => Promise<void>;
};

/** Separador que o drizzle-kit emite entre statements. */
const STATEMENT_SEPARATOR = "--> statement-breakpoint";

/**
 * Fatia o arquivo em statements executáveis.
 *
 * A intenção do filtro é descartar o pedaço que é **só** comentário. A versão
 * anterior descartava o pedaço que *começava* com comentário — e uma migration
 * escrita à mão, que abre explicando o porquê, virava zero statements em
 * silêncio: ela era registrada como aplicada sem ter tocado no banco, e a falha
 * só aparecia depois, como coluna inexistente numa inserção.
 *
 * Agora as linhas de comentário são removidas e o que sobra decide.
 */
function statementsOf(text: string): string[] {
  return text
    .split(STATEMENT_SEPARATOR)
    .map((bloco) =>
      bloco
        .split(/\r?\n/)
        .filter((linha) => !linha.trim().startsWith("--"))
        .join("\n")
        .trim(),
    )
    .filter((statement) => statement.length > 0);
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
 * Todo SQL que este migrator aplica, na ordem.
 *
 * Serve para saber, na primeira execução, **tudo** que vai ser criado daqui
 * para a frente — e não só o que a inicial cria.
 */
const TODO_O_SQL: readonly string[] = [
  inicial,
  vinculoRecorrencia,
  naturezaMovimentacao,
  importacao,
  planejamento,
  recompensas,
  usoDaIa,
  captura,
  sincronizacao,
  pareamento,
  categoriaDaCaptura,
  areaDeTrabalho,
  fichaDoProjeto,
  conciliacao,
  classificacoes,
  cobrancaDeAssinatura,
  valorRecebido,
  categoriaDeTempo,
];

/**
 * Os nomes de tabela que cada migration cria, na ordem das migrations.
 *
 * Exportado porque é o contrato do afastamento: se um nome que o produto vai
 * criar não estiver aqui, um banco vindo da implementação original trava na
 * migration que o cria — que foi exatamente o que aconteceu com
 * `reward_redemptions`.
 */
export const TABELAS_POR_MIGRATION: readonly (readonly string[])[] =
  TODO_O_SQL.map(tablesCreatedBy);

/** Todas elas, achatadas. */
export const TABELAS_DO_SCHEMA: readonly string[] = TABELAS_POR_MIGRATION.flat();

/**
 * Afasta as tabelas da primeira implementação que colidem em nome com as novas.
 *
 * Elas são renomeadas, não apagadas: são a origem da migração de dados e a
 * última linha de defesa se algo der errado. As tabelas antigas sem colisão
 * ficam onde estão até a limpeza final.
 *
 * Olha o que **todas** as migrations criam, não só a inicial. Considerar
 * apenas a primeira parecia bastar e não bastava: `reward_redemptions` nasce
 * na quinta e `sync_mutations` na oitava, e as duas já existiam com esse nome
 * na implementação original. O banco de produção subiu com as quatro primeiras
 * aplicadas e travou na quinta, com "table already exists" — a cada
 * requisição, para sempre, porque o migrator não avança sem completar a
 * migration da vez.
 */
async function renameLegacyTables(database: Database, pendentes: readonly number[]): Promise<void> {
  const rows = await database.all<{ name: string }>(
    sql`SELECT name FROM sqlite_master WHERE type = 'table'`,
  );
  const present = new Set(rows.map((row) => row.name));

  /*
   * Só o que as migrations **pendentes** vão criar.
   *
   * Considerar o schema inteiro parece mais seguro e é o oposto: uma tabela
   * criada por migration já aplicada é do schema novo, está em uso, e afastá-la
   * a renomeia para `legacy_` — foi assim que `recurrences` sumiu de produção
   * entre um deploy e o seguinte, e a migration seguinte morreu com "no such
   * table: recurrences". O que já foi criado por este migrator é dele.
   */
  const vaoSerCriadas = pendentes.flatMap((id) => TABELAS_POR_MIGRATION[id] ?? []);

  for (const table of vaoSerCriadas) {
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
    // O afastamento do legado acontece em `run()`, antes de qualquer
    // migration: ele é pré-condição de todas, e não só desta.
    run: fromSql(inicial),
  },
  { id: 1, name: "vincula-lancamento-a-recorrencia", run: fromSql(vinculoRecorrencia) },
  { id: 2, name: "natureza-da-movimentacao", run: fromSql(naturezaMovimentacao) },
  { id: 3, name: "pipeline-de-importacao", run: fromSql(importacao) },
  { id: 4, name: "orcamentos-metas-investimentos", run: fromSql(planejamento) },
  { id: 5, name: "recompensas-e-cambio", run: fromSql(recompensas) },
  { id: 6, name: "uso-da-ia", run: fromSql(usoDaIa) },
  { id: 7, name: "captura-por-notificacao", run: fromSql(captura) },
  { id: 8, name: "recibos-de-sincronizacao", run: fromSql(sincronizacao) },
  { id: 9, name: "pareamento-de-aparelho", run: fromSql(pareamento) },
  { id: 10, name: "categoria-adivinhada-na-captura", run: fromSql(categoriaDaCaptura) },
  { id: 11, name: "area-de-trabalho", run: fromSql(areaDeTrabalho) },
  { id: 12, name: "ficha-do-projeto", run: fromSql(fichaDoProjeto) },
  { id: 13, name: "conciliacao-de-recebimento", run: fromSql(conciliacao) },
  { id: 14, name: "classificacoes-de-assinatura", run: fromSql(classificacoes) },
  { id: 15, name: "cobranca-de-assinatura-fora-da-fila", run: fromSql(cobrancaDeAssinatura) },
  { id: 16, name: "valor-efetivamente-recebido", run: fromSql(valorRecebido) },
  { id: 17, name: "categoria-de-tempo-e-documentos", run: fromSql(categoriaDeTempo) },
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

  /*
   * Afastar o legado é pré-condição de qualquer migration, não passo da
   * primeira.
   *
   * Estava dentro da migration 0, e por isso só protegia o que a 0 cria. Um
   * banco vindo da implementação original passou pelas quatro primeiras e
   * travou na quinta com "table already exists": `reward_redemptions` nasce lá
   * e já existia com outro esquema. O migrator não avança sem completar a
   * migration da vez, então toda requisição repetia a mesma falha.
   *
   * Aqui em cima, roda antes de qualquer tentativa — inclusive num banco que
   * já travou no meio, que se conserta sozinho no deploy seguinte. É
   * idempotente e barato: uma consulta a `sqlite_master`, e só renomeia o que
   * existe e ainda não foi renomeado.
   */
  const pendentes = MIGRATIONS.filter((migration) => !done.has(migration.id)).map((m) => m.id);
  if (pendentes.length) await renameLegacyTables(database, pendentes);

  for (const migration of MIGRATIONS) {
    if (done.has(migration.id)) continue;

    try {
      await migration.run(database);
    } catch (error) {
      /*
       * Diz qual migration e qual erro, e só então propaga.
       *
       * Sem isto, uma migration quebrada em produção aparece como "erro no
       * render de Server Components, mensagem omitida" — a mesma tela para
       * qualquer causa. Foram necessários três deploys para descobrir que a
       * décima quarta era a culpada, e o que sai daqui é nome de tabela e
       * mensagem do SQLite, não dado de usuário.
       */
      console.error(
        `[migrator] falhou na migration ${migration.id} (${migration.name}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw error;
    }

    await database.run(
      sql`INSERT INTO _migrations (id, name) VALUES (${migration.id}, ${migration.name})`,
    );
  }
}

/** Só para diagnóstico. */
export function migrationCount(): number {
  return MIGRATIONS.length;
}
