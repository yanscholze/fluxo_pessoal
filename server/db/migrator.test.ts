/**
 * O que o migrator afasta antes de migrar.
 *
 * O caso real que este arquivo existe para não repetir: produção subiu sobre o
 * banco da primeira implementação do Fluxo, aplicou as quatro primeiras
 * migrations e travou na quinta com "table already exists" —
 * `reward_redemptions` nasce lá e já existia, com outro esquema, desde a
 * versão original. Como o migrator não avança sem completar a migration da
 * vez, toda requisição repetia a falha e o site respondia 500.
 *
 * A causa era o alcance: o afastamento olhava só o que a migration inicial
 * cria. O que se trava aqui é que ele passou a olhar o schema inteiro.
 */

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { TABELAS_DO_SCHEMA, TABELAS_POR_MIGRATION } from "./migrator.ts";

const PASTA = join(import.meta.dirname, "migrations");

/** Toda tabela que os arquivos de migration criam, lidos do disco. */
function tabelasNosArquivos(): string[] {
  const nomes: string[] = [];
  for (const arquivo of readdirSync(PASTA).filter((nome) => nome.endsWith(".sql"))) {
    const texto = readFileSync(join(PASTA, arquivo), "utf8");
    for (const achado of texto.matchAll(/CREATE TABLE(?:\s+IF NOT EXISTS)?\s+[`"]?([A-Za-z_]\w*)[`"]?/gi)) {
      nomes.push(achado[1]);
    }
  }
  return nomes;
}

describe("afastamento do legado", () => {
  it("cobre toda tabela que alguma migration cria, não só a inicial", () => {
    const reivindicadas = new Set(TABELAS_DO_SCHEMA);
    const faltando = tabelasNosArquivos().filter((nome) => !reivindicadas.has(nome));

    assert.deepEqual(
      faltando,
      [],
      "tabela criada por migration e fora da lista trava um banco vindo da versão antiga",
    );
  });

  it("inclui as duas que quebraram a produção", () => {
    // Nomes reais do incidente. Nascem na quinta e na oitava migration — por
    // isso a lista da inicial não bastava.
    for (const tabela of ["reward_redemptions", "sync_mutations"]) {
      assert.ok(TABELAS_DO_SCHEMA.includes(tabela), `${tabela} precisa ser afastada`);
    }
  });

  it("cada migration responde só pelas tabelas que ela cria", () => {
    /*
     * É o que impede o afastamento de comer tabela do schema novo. Afastar
     * pelo schema inteiro renomeou `recurrences` — criada e em uso desde a
     * migration zero — para `legacy_recurrences` num banco a meio caminho, e a
     * migration seguinte morreu com "no such table: recurrences".
     */
    assert.equal(TABELAS_POR_MIGRATION.length, 18, "uma entrada por migration, na ordem");

    // A quinta cria as recompensas; a zero cria o núcleo. Nenhuma cria as duas.
    assert.ok(TABELAS_POR_MIGRATION[5].includes("reward_redemptions"));
    assert.ok(!TABELAS_POR_MIGRATION[5].includes("recurrences"));
    assert.ok(TABELAS_POR_MIGRATION[0].includes("recurrences"));
    assert.ok(TABELAS_POR_MIGRATION[8].includes("sync_mutations"));

    assert.deepEqual(TABELAS_POR_MIGRATION.flat(), TABELAS_DO_SCHEMA);
  });

  it("a lista não está vazia nem duplica nome à toa", () => {
    assert.ok(TABELAS_DO_SCHEMA.length > 30, `só ${TABELAS_DO_SCHEMA.length} tabelas`);

    // Nome repetido significaria duas migrations criando a mesma tabela — o
    // que só acontece por engano, e produz "already exists" em banco novo.
    const vistos = new Set<string>();
    const repetidos = TABELAS_DO_SCHEMA.filter((nome) => !vistos.add(nome));
    assert.deepEqual(repetidos, []);
  });
});
