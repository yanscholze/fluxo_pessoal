/**
 * D1 de mentira, SQLite de verdade.
 *
 * Os serviços que movem dinheiro só podem ser testados contra um banco real:
 * é onde moram as chaves estrangeiras, o `ON DELETE`, a atomicidade do lote e
 * a diferença entre `NULL` e ausente. Um repositório dublê provaria que o
 * dublê funciona.
 *
 * Este adaptador implementa a interface do D1 sobre o `node:sqlite` que já vem
 * no Node 22. O driver continua sendo o `drizzle-orm/d1` — o mesmo da
 * produção —, então o SQL exercitado no teste é exatamente o SQL que o Worker
 * emite. Trocar para `drizzle-orm/better-sqlite3` testaria outro gerador.
 */

import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = join(AQUI, "..", "db", "migrations");

/** Separador que o drizzle-kit emite entre statements. */
const SEPARADOR = "--> statement-breakpoint";

type Linha = Record<string, unknown>;

/**
 * Resultado no formato que o D1 devolve.
 *
 * O `drizzle-orm/d1` lê `results` e `meta.changes`; o resto existe para o
 * formato ficar honesto com quem inspecionar.
 */
function resultado(results: Linha[], changes = 0, lastRowId: number | null = null) {
  return {
    results,
    success: true as const,
    meta: {
      changes,
      last_row_id: lastRowId,
      duration: 0,
      rows_read: results.length,
      rows_written: changes,
    },
  };
}

class StatementFalso {
  readonly #banco: () => DatabaseSync;
  readonly #sql: string;
  #parametros: unknown[] = [];

  constructor(banco: () => DatabaseSync, sql: string) {
    this.#banco = banco;
    this.#sql = sql;
  }

  bind(...parametros: unknown[]): StatementFalso {
    const proximo = new StatementFalso(this.#banco, this.#sql);
    // `bind` do D1 devolve um statement novo; reaproveitar o mesmo objeto faria
    // duas consultas concorrentes compartilharem parâmetros.
    proximo.#parametros = parametros.map(normalizarParametro);
    return proximo;
  }

  #preparado() {
    return this.#banco().prepare(this.#sql);
  }

  async all() {
    return resultado(this.#preparado().all(...(this.#parametros as never[])) as Linha[]);
  }

  async first(coluna?: string) {
    const linha = this.#preparado().get(...(this.#parametros as never[])) as Linha | undefined;
    if (!linha) return null;
    return coluna === undefined ? linha : (linha[coluna] ?? null);
  }

  async run() {
    const info = this.#preparado().run(...(this.#parametros as never[]));
    return resultado([], Number(info.changes), Number(info.lastInsertRowid));
  }

  async raw() {
    const linhas = this.#preparado().all(...(this.#parametros as never[])) as Linha[];
    return linhas.map((linha) => Object.values(linha));
  }
}

/**
 * `node:sqlite` não aceita `boolean` nem `undefined` como parâmetro.
 *
 * O D1 aceita os dois e converte. Sem esta normalização, toda coluna
 * `{ mode: "boolean" }` do Drizzle quebraria no teste e em lugar nenhum mais —
 * o teste estaria medindo o adaptador, não o serviço.
 */
function normalizarParametro(valor: unknown): unknown {
  if (typeof valor === "boolean") return valor ? 1 : 0;
  if (valor === undefined) return null;
  return valor;
}

/**
 * Conexão com o D1.
 *
 * A identidade deste objeto **não muda** entre testes, e isso é deliberado: o
 * `getDatabase()` de produção guarda a instância do Drizzle num módulo, e não
 * expõe jeito de esquecê-la. Se cada teste criasse um binding novo, o segundo
 * teste continuaria escrevendo no banco do primeiro. Aqui o que é substituído
 * é o SQLite lá dentro; para quem está de fora, é sempre o mesmo banco.
 *
 * A alternativa era abrir um `resetDatabaseCache()` no código de produção —
 * uma porta que só o teste usa, aberta para sempre em todo o resto.
 */
class D1Falso {
  #banco: DatabaseSync;

  constructor(banco: DatabaseSync) {
    this.#banco = banco;
  }

  /** Recria o schema do zero, mantendo a identidade do binding. */
  reiniciar(): void {
    this.#banco.close();
    this.#banco = abrirComMigrations();
  }

  prepare(sql: string): StatementFalso {
    return new StatementFalso(() => this.#banco, sql);
  }

  /**
   * Lote atômico.
   *
   * É a única unidade de atomicidade que o D1 oferece, e o Fluxo depende dela
   * para "apagar as movimentações antigas e gravar as novas" não deixar um
   * saldo pela metade. Aqui a garantia vem de `BEGIN`/`COMMIT` de verdade — um
   * lote que falha no meio precisa desfazer o que já tinha feito, senão o
   * teste passaria num cenário que o Worker não aceita.
   */
  async batch(statements: readonly { run(): Promise<unknown> }[]) {
    this.#banco.exec("BEGIN");
    try {
      const saidas = [];
      for (const statement of statements) saidas.push(await statement.run());
      this.#banco.exec("COMMIT");
      return saidas;
    } catch (erro) {
      this.#banco.exec("ROLLBACK");
      throw erro;
    }
  }

  async exec(sql: string) {
    this.#banco.exec(sql);
    return { count: 0, duration: 0 };
  }

  fechar(): void {
    this.#banco.close();
  }
}

function statementsDe(texto: string): string[] {
  return texto
    .split(SEPARADOR)
    .map((bloco) =>
      bloco
        .split(/\r?\n/)
        .filter((linha) => !linha.trim().startsWith("--"))
        .join("\n")
        .trim(),
    )
    .filter((statement) => statement.length > 0);
}

/**
 * Banco novo, em memória, com todas as migrations aplicadas na ordem.
 *
 * Lê os mesmos arquivos `.sql` que o Worker aplica. Um schema montado à mão
 * para o teste divergiria da produção no primeiro `ALTER TABLE` esquecido, e o
 * teste passaria a garantir o schema errado.
 */
function abrirComMigrations(): DatabaseSync {
  const banco = new DatabaseSync(":memory:");
  banco.exec("PRAGMA foreign_keys = ON");

  const arquivos = readdirSync(MIGRATIONS)
    .filter((nome) => nome.endsWith(".sql"))
    .sort();

  for (const arquivo of arquivos) {
    for (const statement of statementsDe(readFileSync(join(MIGRATIONS, arquivo), "utf8"))) {
      banco.exec(statement);
    }
  }

  return banco;
}

export function bancoDeTeste() {
  return new D1Falso(abrirComMigrations());
}

export type BancoDeTeste = ReturnType<typeof bancoDeTeste>;
