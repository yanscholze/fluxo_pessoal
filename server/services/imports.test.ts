/**
 * Importação: ler, revisar, confirmar.
 *
 * A regra que o pipeline existe para garantir é uma só: **nada entra no razão
 * sem decisão**. Um extrato importado em silêncio é a maneira mais rápida de
 * produzir um saldo em que ninguém confia mais, e a duplicidade é o caminho
 * mais comum para isso — o mesmo arquivo enviado duas vezes, ou dois arquivos
 * com meses sobrepostos.
 *
 * Estes testes exercitam o caminho inteiro contra o banco: o lote nasce em
 * revisão, a segunda importação reconhece o que já entrou, e só o que foi
 * aceito vira lançamento.
 */

import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { ambiente, zerar } from "../testing/cenario.ts";

const AGORA = new Date("2026-08-20T12:00:00Z");

const CSV = [
  "data,descricao,valor",
  "2026-08-03,Mercado do Bairro,-120.50",
  "2026-08-05,Padaria Central,-32.00",
  "2026-08-10,Salario,4500.00",
].join("\n");

describe("importação de extrato", () => {
  beforeEach(() => zerar());

  it("o lote nasce em revisão e não cria lançamento nenhum", async () => {
    const { startImport } = await import("./imports.ts");
    const { listTransactions } = await import("../repositories/ledger.ts");
    const alvo = await ambiente();

    const lote = await startImport(
      alvo.userId,
      { filename: "extrato.csv", content: CSV, accountId: alvo.contaId },
      AGORA,
    );

    assert.equal(lote.status, "review");
    // `found` conta as linhas do arquivo; o cabeçalho entra como descartado.
    assert.equal(lote.counts.found, 4);
    assert.equal(lote.counts.discarded, 1);
    assert.equal(lote.counts.fresh, 3);

    const lancamentos = await listTransactions(alvo.userId, { limit: 100 });
    assert.equal(lancamentos.length, 0, "importar não pode escrever no razão antes da confirmação");
  });

  it("confirmar cria só o que foi aceito", async () => {
    const { startImport, findBatch, decideItem, commitBatch } = await import("./imports.ts");
    const { listTransactions } = await import("../repositories/ledger.ts");
    const alvo = await ambiente();

    const lote = await startImport(
      alvo.userId,
      { filename: "extrato.csv", content: CSV, accountId: alvo.contaId },
      AGORA,
    );

    const revisao = await findBatch(alvo.userId, lote.id);
    assert.ok(revisao);

    // Aceita dois, ignora um: é a decisão que a tela de revisão oferece.
    await decideItem(alvo.userId, revisao.items[0].id, { decision: "aceitar" });
    await decideItem(alvo.userId, revisao.items[1].id, { decision: "aceitar" });
    await decideItem(alvo.userId, revisao.items[2].id, { decision: "ignorar" });

    const resultado = await commitBatch(alvo.userId, lote.id, AGORA);
    assert.equal(resultado.created, 2);

    const lancamentos = await listTransactions(alvo.userId, { limit: 100 });
    assert.equal(lancamentos.length, 2, "o ignorado não pode virar lançamento");
  });

  it("reimportar o mesmo arquivo reconhece as linhas como duplicadas", async () => {
    const { startImport, findBatch, acceptAllPending, commitBatch } = await import("./imports.ts");
    const alvo = await ambiente();

    const primeiro = await startImport(
      alvo.userId,
      { filename: "extrato.csv", content: CSV, accountId: alvo.contaId },
      AGORA,
    );
    await acceptAllPending(alvo.userId, primeiro.id);
    await commitBatch(alvo.userId, primeiro.id, AGORA);

    const segundo = await startImport(
      alvo.userId,
      { filename: "extrato.csv", content: CSV, accountId: alvo.contaId },
      AGORA,
    );

    assert.equal(segundo.counts.duplicates, 3, "todas as linhas já estão no Fluxo");

    const revisao = await findBatch(alvo.userId, segundo.id);
    assert.ok(revisao);
    assert.equal(
      revisao.items.every((item) => item.verdict === "duplicado"),
      true,
      "duplicidade é veredito do item, não decisão automática",
    );
  });

  it("confirmar duas vezes o mesmo lote é conflito, não lançamento em dobro", async () => {
    const { startImport, acceptAllPending, commitBatch } = await import("./imports.ts");
    const { listTransactions } = await import("../repositories/ledger.ts");
    const alvo = await ambiente();

    const lote = await startImport(
      alvo.userId,
      { filename: "extrato.csv", content: CSV, accountId: alvo.contaId },
      AGORA,
    );
    await acceptAllPending(alvo.userId, lote.id);
    await commitBatch(alvo.userId, lote.id, AGORA);

    await assert.rejects(() => commitBatch(alvo.userId, lote.id, AGORA), /finalizado/);

    const lancamentos = await listTransactions(alvo.userId, { limit: 100 });
    assert.equal(lancamentos.length, 3, "o lote confirmado não pode ser aplicado de novo");
  });

  it("descartar o lote não deixa rastro no razão", async () => {
    const { startImport, acceptAllPending, discardBatch } = await import("./imports.ts");
    const { listTransactions } = await import("../repositories/ledger.ts");
    const alvo = await ambiente();

    const lote = await startImport(
      alvo.userId,
      { filename: "extrato.csv", content: CSV, accountId: alvo.contaId },
      AGORA,
    );
    await acceptAllPending(alvo.userId, lote.id);
    await discardBatch(alvo.userId, lote.id);

    const lancamentos = await listTransactions(alvo.userId, { limit: 100 });
    assert.equal(lancamentos.length, 0, "aceitar não é confirmar");
  });

  it("recusa arquivo que não tem lançamento legível", async () => {
    const { startImport } = await import("./imports.ts");
    const alvo = await ambiente();

    await assert.rejects(
      () =>
        startImport(
          alvo.userId,
          { filename: "vazio.csv", content: "isto não é um extrato", accountId: alvo.contaId },
          AGORA,
        ),
      /não foi possível ler/i,
    );
  });
});
