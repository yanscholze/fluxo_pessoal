/**
 * Corrigir e apagar lançamento.
 *
 * Registrar errado é a coisa mais comum que acontece num aplicativo de
 * finanças — data trocada, valor digitado a mais, conta errada. Até agora o
 * Fluxo só sabia criar, e o erro era permanente.
 *
 * O ponto delicado da correção é que o lançamento não é um registro isolado:
 * ele gera movimentações no razão, e a data decide a competência e a fatura.
 * Editar precisa refazer tudo isso junto, atomicamente — regravar o fato e
 * deixar as movimentações antigas para trás produziria um saldo que soma o
 * valor velho e o novo.
 */

import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { cents } from "../../core/kernel/money.ts";
import { localDate } from "../../core/time/local-date.ts";
import { ambiente, zerar } from "../testing/cenario.ts";

const AGORA = new Date("2026-08-20T12:00:00Z");

async function despesaEmConta(userId: string, contaId: string, categoriaId: string, valor = 20_000) {
  const { recordTransaction } = await import("./transactions.ts");
  const { ids } = await recordTransaction(
    userId,
    {
      kind: "expense",
      description: "Mercado",
      amount: cents(valor),
      occurredOn: localDate("2026-08-05"),
      accountId: contaId,
      categoryId: categoriaId,
      state: "confirmed",
    },
    AGORA,
  );
  return ids[0];
}

async function saldo(userId: string, contaId: string) {
  const { buildAccountsView } = await import("./accounts.ts");
  const view = await buildAccountsView(userId, AGORA);
  return view.accounts.find((conta) => conta.id === contaId)?.balanceCents;
}

describe("correção de lançamento", () => {
  beforeEach(() => zerar());

  it("mudar o valor corrige o saldo, não o soma duas vezes", async () => {
    const { recordTransaction } = await import("./transactions.ts");
    const alvo = await ambiente(500_000);
    const id = await despesaEmConta(alvo.userId, alvo.contaId, alvo.categoriaId, 20_000);

    assert.equal(await saldo(alvo.userId, alvo.contaId), 480_000);

    await recordTransaction(
      alvo.userId,
      {
        id,
        kind: "expense",
        description: "Mercado",
        amount: cents(30_000),
        occurredOn: localDate("2026-08-05"),
        accountId: alvo.contaId,
        categoryId: alvo.categoriaId,
        state: "confirmed",
      },
      AGORA,
    );

    assert.equal(
      await saldo(alvo.userId, alvo.contaId),
      470_000,
      "o saldo reflete o valor novo, e só ele",
    );
  });

  it("mudar a data move a competência junto", async () => {
    const { recordTransaction } = await import("./transactions.ts");
    const { findTransaction } = await import("../repositories/ledger.ts");
    const alvo = await ambiente();
    const id = await despesaEmConta(alvo.userId, alvo.contaId, alvo.categoriaId);

    await recordTransaction(
      alvo.userId,
      {
        id,
        kind: "expense",
        description: "Mercado",
        amount: cents(20_000),
        occurredOn: localDate("2026-09-02"),
        accountId: alvo.contaId,
        categoryId: alvo.categoriaId,
        state: "confirmed",
      },
      AGORA,
    );

    const corrigido = await findTransaction(alvo.userId, id);
    assert.equal(corrigido?.competence, "2026-09");
  });

  it("mover a compra do cartão para depois do fechamento troca a fatura", async () => {
    const { recordTransaction } = await import("./transactions.ts");
    const { findTransaction } = await import("../repositories/ledger.ts");
    const alvo = await ambiente();

    const { ids } = await recordTransaction(
      alvo.userId,
      {
        kind: "expense",
        description: "Compra",
        amount: cents(20_000),
        occurredOn: localDate("2026-08-05"),
        cardId: alvo.cartaoId,
        categoryId: alvo.categoriaId,
        state: "confirmed",
      },
      AGORA,
    );

    const antes = await findTransaction(alvo.userId, ids[0]);
    assert.equal(antes?.competence, "2026-08", "05/08 é anterior ao fechamento do dia 13");

    await recordTransaction(
      alvo.userId,
      {
        id: ids[0],
        kind: "expense",
        description: "Compra",
        amount: cents(20_000),
        // Um dia depois do fechamento: a competência tem de virar setembro.
        occurredOn: localDate("2026-08-14"),
        cardId: alvo.cartaoId,
        categoryId: alvo.categoriaId,
        state: "confirmed",
      },
      AGORA,
    );

    const depois = await findTransaction(alvo.userId, ids[0]);
    assert.equal(depois?.competence, "2026-09", "corrigir a data reclassifica a fatura");
  });

  it("apagar devolve o dinheiro ao saldo", async () => {
    const { removeTransaction } = await import("./transactions.ts");
    const alvo = await ambiente(500_000);
    const id = await despesaEmConta(alvo.userId, alvo.contaId, alvo.categoriaId, 20_000);

    assert.equal(await saldo(alvo.userId, alvo.contaId), 480_000);
    assert.equal(await removeTransaction(alvo.userId, id), true);
    assert.equal(await saldo(alvo.userId, alvo.contaId), 500_000, "apagar desfaz a movimentação");
  });

  it("apagar o que não existe devolve falso em vez de estourar", async () => {
    const { removeTransaction } = await import("./transactions.ts");
    const alvo = await ambiente();

    assert.equal(await removeTransaction(alvo.userId, "nao-existe"), false);
  });

  it("apagar lançamento de outra pessoa não apaga nada", async () => {
    const { removeTransaction } = await import("./transactions.ts");
    const { signUp } = await import("./auth.ts");
    const alvo = await ambiente(500_000);
    const id = await despesaEmConta(alvo.userId, alvo.contaId, alvo.categoriaId, 20_000);

    const { user: intruso } = await signUp({
      email: "intruso@fluxo.app",
      password: "senha-do-intruso-123",
      displayName: "Intruso",
    });

    assert.equal(await removeTransaction(intruso.id, id), false);
    assert.equal(await saldo(alvo.userId, alvo.contaId), 480_000, "o lançamento continua de pé");
  });

  it("o lançamento apagado some do extrato", async () => {
    const { removeTransaction } = await import("./transactions.ts");
    const { listTransactions } = await import("../repositories/ledger.ts");
    const alvo = await ambiente();
    const id = await despesaEmConta(alvo.userId, alvo.contaId, alvo.categoriaId);

    await removeTransaction(alvo.userId, id);

    const lancamentos = await listTransactions(alvo.userId, { limit: 100 });
    assert.equal(lancamentos.length, 0, "exclusão lógica também some da listagem");
  });
});

describe("cartão principal", () => {
  beforeEach(() => zerar());

  it("trocar o principal muda a janela do livre para gastar", async () => {
    const { createCard, setPrimaryCard } = await import("./catalog.ts");
    const { buildDashboard } = await import("./dashboard.ts");
    const alvo = await ambiente();

    // Um segundo cartão, com fechamento bem diferente do primeiro.
    const outro = await createCard(alvo.userId, {
      name: "Outro cartão",
      kind: "credit",
      paymentAccountId: alvo.contaId,
      closingDay: 25,
      dueDay: 5,
      limit: cents(300_000),
    });

    const antes = await buildDashboard(alvo.userId, AGORA);
    await setPrimaryCard(alvo.userId, outro);
    const depois = await buildDashboard(alvo.userId, AGORA);

    assert.notEqual(
      antes.freeToSpend.windowEnd,
      depois.freeToSpend.windowEnd,
      "a janela precisa seguir o ciclo do cartão principal",
    );
  });
});
