/**
 * Relatórios detalhados.
 *
 * O que estes testes fixam é o recorte: o que entra no período, o que fica de
 * fora, e o que **não** é despesa mesmo saindo da conta. Um relatório que conta
 * transferência entre contas próprias como gasto infla o total e faz o usuário
 * procurar um problema que não existe.
 */

import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { cents } from "../../core/kernel/money.ts";
import { localDate } from "../../core/time/local-date.ts";
import { ambiente, zerar } from "../testing/cenario.ts";

const AGORA = new Date("2026-09-20T12:00:00Z");

async function gastar(
  userId: string,
  contaId: string,
  categoriaId: string,
  valor: number,
  data: string,
  descricao = "Compra",
) {
  const { recordTransaction } = await import("./transactions.ts");
  await recordTransaction(
    userId,
    {
      kind: "expense",
      description: descricao,
      amount: cents(valor),
      occurredOn: localDate(data),
      accountId: contaId,
      categoryId: categoriaId,
      state: "confirmed",
    },
    AGORA,
  );
}

describe("relatório de despesas", () => {
  beforeEach(() => zerar());

  it("soma o período e tira a média mensal", async () => {
    const { buildDetailedReport } = await import("./reports.ts");
    const alvo = await ambiente(1_000_000);

    await gastar(alvo.userId, alvo.contaId, alvo.categoriaId, 30_000, "2026-09-05");
    await gastar(alvo.userId, alvo.contaId, alvo.categoriaId, 20_000, "2026-08-05");
    await gastar(alvo.userId, alvo.contaId, alvo.categoriaId, 10_000, "2026-07-05");

    const relatorio = await buildDetailedReport(alvo.userId, "expense", "3m", AGORA);

    assert.equal(relatorio.totalCents, 60_000);
    assert.equal(relatorio.months, 3);
    assert.equal(relatorio.monthlyAverageCents, 20_000);
    assert.equal(relatorio.transactionCount, 3);
  });

  it("o recorte corta o que ficou para trás", async () => {
    const { buildDetailedReport } = await import("./reports.ts");
    const alvo = await ambiente(1_000_000);

    await gastar(alvo.userId, alvo.contaId, alvo.categoriaId, 30_000, "2026-09-05");
    // Fora de uma janela de um mês.
    await gastar(alvo.userId, alvo.contaId, alvo.categoriaId, 99_000, "2026-05-05");

    const relatorio = await buildDetailedReport(alvo.userId, "expense", "mes", AGORA);
    assert.equal(relatorio.totalCents, 30_000);
  });

  it("transferência entre contas próprias não é despesa", async () => {
    const { buildDetailedReport } = await import("./reports.ts");
    const { createAccount } = await import("./catalog.ts");
    const { recordTransaction } = await import("./transactions.ts");
    const alvo = await ambiente(1_000_000);

    const reserva = await createAccount(alvo.userId, {
      name: "Reserva",
      kind: "savings",
      openingBalance: cents(0),
      openedOn: localDate("2026-01-01"),
    });

    await recordTransaction(
      alvo.userId,
      {
        kind: "transfer",
        description: "Guardar",
        amount: cents(50_000),
        occurredOn: localDate("2026-09-05"),
        accountId: alvo.contaId,
        destinationAccountId: reserva,
        state: "confirmed",
      },
      AGORA,
    );

    const relatorio = await buildDetailedReport(alvo.userId, "expense", "mes", AGORA);
    assert.equal(relatorio.totalCents, 0, "o dinheiro só mudou de lugar");
  });

  it("agrupa por categoria e por origem", async () => {
    const { buildDetailedReport } = await import("./reports.ts");
    const alvo = await ambiente(1_000_000);

    await gastar(alvo.userId, alvo.contaId, alvo.categoriaId, 30_000, "2026-09-05", "Mercado");
    await gastar(alvo.userId, alvo.contaId, alvo.categoriaId, 10_000, "2026-09-06", "Padaria");

    const relatorio = await buildDetailedReport(alvo.userId, "expense", "mes", AGORA);

    assert.equal(relatorio.byCategory.length, 1);
    assert.equal(relatorio.byCategory[0].amountCents, 40_000);
    assert.equal(relatorio.byCategory[0].count, 2);
    assert.equal(relatorio.byCategory[0].percent, 100);

    assert.equal(relatorio.byOrigin[0].name, "Conta corrente");
  });

  it("lista os maiores lançamentos primeiro", async () => {
    const { buildDetailedReport } = await import("./reports.ts");
    const alvo = await ambiente(1_000_000);

    await gastar(alvo.userId, alvo.contaId, alvo.categoriaId, 5_000, "2026-09-05", "Pequeno");
    await gastar(alvo.userId, alvo.contaId, alvo.categoriaId, 80_000, "2026-09-06", "Grande");

    const relatorio = await buildDetailedReport(alvo.userId, "expense", "mes", AGORA);
    assert.equal(relatorio.largest[0].description, "Grande");
    assert.equal(relatorio.largest[0].amountCents, 80_000);
  });

  it("previsto não entra: ainda não aconteceu", async () => {
    const { buildDetailedReport } = await import("./reports.ts");
    const { recordTransaction } = await import("./transactions.ts");
    const alvo = await ambiente(1_000_000);

    await recordTransaction(
      alvo.userId,
      {
        kind: "expense",
        description: "Ainda vai sair",
        amount: cents(70_000),
        occurredOn: localDate("2026-09-28"),
        accountId: alvo.contaId,
        categoryId: alvo.categoriaId,
        state: "planned",
      },
      AGORA,
    );

    const relatorio = await buildDetailedReport(alvo.userId, "expense", "mes", AGORA);
    assert.equal(relatorio.totalCents, 0);
  });
});

describe("relatório de renda", () => {
  beforeEach(() => zerar());

  it("conta só o que entrou", async () => {
    const { buildDetailedReport } = await import("./reports.ts");
    const { recordTransaction } = await import("./transactions.ts");
    const alvo = await ambiente(0);

    await recordTransaction(
      alvo.userId,
      {
        kind: "income",
        description: "Salário",
        amount: cents(620_000),
        occurredOn: localDate("2026-09-05"),
        accountId: alvo.contaId,
        state: "confirmed",
      },
      AGORA,
    );
    await gastar(alvo.userId, alvo.contaId, alvo.categoriaId, 30_000, "2026-09-06");

    const relatorio = await buildDetailedReport(alvo.userId, "income", "mes", AGORA);
    assert.equal(relatorio.totalCents, 620_000, "a despesa não entra na renda");
    assert.equal(relatorio.transactionCount, 1);
  });

  it("o relatório de um não enxerga a renda do outro", async () => {
    const { buildDetailedReport } = await import("./reports.ts");
    const { recordTransaction } = await import("./transactions.ts");
    const { signUp } = await import("./auth.ts");
    const alvo = await ambiente(0);

    await recordTransaction(
      alvo.userId,
      {
        kind: "income",
        description: "Salário",
        amount: cents(620_000),
        occurredOn: localDate("2026-09-05"),
        accountId: alvo.contaId,
        state: "confirmed",
      },
      AGORA,
    );

    const { user: outro } = await signUp({
      email: "outro-relatorio@fluxo.app",
      password: "senha-do-outro-123",
      displayName: "Outro",
    });

    const relatorio = await buildDetailedReport(outro.id, "income", "mes", AGORA);
    assert.equal(relatorio.totalCents, 0);
  });
});
