/**
 * Fatura: cobrar, pagar, quitar.
 *
 * Este arquivo existe por causa de um defeito que passou por 405 testes de
 * domínio sem ser notado. A regra estava certa em `core/`; o que estava errado
 * era **qual conjunto de movimentações** o serviço entregava para ela. O
 * painel injeta as recorrências do mês como movimentações virtuais, a fatura
 * passou a somá-las como cobrança, e nasceu um saldo devedor sem lançamento
 * para quitar: o pagamento zerava tudo que existia, devolvia "resta zero", e a
 * tela continuava exibindo o resíduo em atraso. Pagar de novo respondia "esta
 * fatura já está quitada".
 *
 * Teste de unidade prova que a regra está certa. Este prova que ela recebe os
 * dados certos.
 */

import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { cents } from "../../core/kernel/money.ts";
import { competence } from "../../core/time/competence.ts";
import { localDate } from "../../core/time/local-date.ts";
import { ambiente, zerar } from "../testing/cenario.ts";

describe("pagamento de fatura", () => {
  beforeEach(() => zerar());

  it("quita a fatura por inteiro e ela some dos atrasos", async () => {
    const { recordTransaction, payInvoice } = await import("./transactions.ts");
    const { buildCardsView } = await import("./cards.ts");
    const alvo = await ambiente();

    await recordTransaction(alvo.userId, {
      kind: "expense",
      description: "Mercado",
      amount: cents(20_000),
      occurredOn: localDate("2026-08-05"),
      cardId: alvo.cartaoId,
      categoryId: alvo.categoriaId,
      state: "confirmed",
    });

    const pagamento = await payInvoice(
      alvo.userId,
      { cardId: alvo.cartaoId, competence: competence("2026-08"), accountId: alvo.contaId, paidOn: localDate("2026-08-20") },
      new Date("2026-09-01T12:00:00Z"),
    );

    assert.equal(pagamento.paidCents, 20_000);
    assert.equal(pagamento.remainingCents, 0);

    const view = await buildCardsView(alvo.userId, new Date("2026-09-01T12:00:00Z"));
    const cartao = view.cards.find((card) => card.id === alvo.cartaoId);
    const agosto = cartao?.invoices.find((invoice) => invoice.competence === "2026-08");

    assert.equal(agosto?.outstandingCents, 0, "a fatura paga não pode manter saldo devedor");
    assert.equal(
      cartao?.invoices.some((invoice) => invoice.competence === "2026-08" && invoice.status === "atrasada"),
      false,
      "fatura quitada não pode aparecer em atraso",
    );
  });

  it("uma assinatura ainda não lançada não cria dívida impagável", async () => {
    const { recordTransaction, payInvoice } = await import("./transactions.ts");
    const { createRecurrence } = await import("./recurrences.ts");
    const { buildDashboard } = await import("./dashboard.ts");
    const alvo = await ambiente();

    await recordTransaction(alvo.userId, {
      kind: "expense",
      description: "Mercado",
      amount: cents(20_000),
      occurredOn: localDate("2026-08-05"),
      cardId: alvo.cartaoId,
      categoryId: alvo.categoriaId,
      state: "confirmed",
    });

    // Assinatura recorrente no cartão: o painel a projeta como movimentação
    // virtual dentro da competência de agosto.
    await createRecurrence(alvo.userId, {
      kind: "expense",
      role: "subscription",
      description: "Streaming",
      amount: cents(5_590),
      scheduleDay: 8,
      cardId: alvo.cartaoId,
      categoryId: alvo.categoriaId,
      startsOn: localDate("2026-01-01"),
    });

    const agora = new Date("2026-09-01T12:00:00Z");

    await payInvoice(
      alvo.userId,
      { cardId: alvo.cartaoId, competence: competence("2026-08"), accountId: alvo.contaId, paidOn: localDate("2026-08-20") },
      agora,
    );

    // O painel é justamente o caminho que injeta as projeções no razão.
    const painel = await buildDashboard(alvo.userId, agora);
    const cartao = painel.cards.find((card) => card.id === alvo.cartaoId);

    assert.equal(
      cartao?.overdueInvoices.length,
      0,
      "a assinatura projetada não pode deixar a fatura paga em atraso",
    );
  });

  it("recusa pagar fatura sem saldo devedor", async () => {
    const { recordTransaction, payInvoice } = await import("./transactions.ts");
    const alvo = await ambiente();

    await recordTransaction(alvo.userId, {
      kind: "expense",
      description: "Mercado",
      amount: cents(20_000),
      occurredOn: localDate("2026-08-05"),
      cardId: alvo.cartaoId,
      categoryId: alvo.categoriaId,
      state: "confirmed",
    });

    const agora = new Date("2026-09-01T12:00:00Z");
    const entrada = {
      cardId: alvo.cartaoId,
      competence: competence("2026-08"),
      accountId: alvo.contaId,
      paidOn: localDate("2026-08-20"),
    };

    await payInvoice(alvo.userId, entrada, agora);
    await assert.rejects(() => payInvoice(alvo.userId, entrada, agora), /quitada/);
  });

  it("compra no crédito não tira dinheiro da conta; o pagamento tira", async () => {
    const { recordTransaction, payInvoice } = await import("./transactions.ts");
    const { buildAccountsView } = await import("./accounts.ts");
    const alvo = await ambiente(500_000);
    const agora = new Date("2026-09-01T12:00:00Z");

    await recordTransaction(alvo.userId, {
      kind: "expense",
      description: "Mercado",
      amount: cents(20_000),
      occurredOn: localDate("2026-08-05"),
      cardId: alvo.cartaoId,
      categoryId: alvo.categoriaId,
      state: "confirmed",
    });

    const antes = await buildAccountsView(alvo.userId, agora);
    const saldoAntes = antes.accounts.find((conta) => conta.id === alvo.contaId)?.balanceCents;
    assert.equal(saldoAntes, 500_000, "a compra no crédito não move a conta");

    await payInvoice(
      alvo.userId,
      { cardId: alvo.cartaoId, competence: competence("2026-08"), accountId: alvo.contaId, paidOn: localDate("2026-08-20") },
      agora,
    );

    const depois = await buildAccountsView(alvo.userId, agora);
    const saldoDepois = depois.accounts.find((conta) => conta.id === alvo.contaId)?.balanceCents;
    assert.equal(saldoDepois, 480_000, "o pagamento da fatura é que sai da conta");
  });

  it("recusa pagamento maior que o saldo da conta", async () => {
    const { recordTransaction, payInvoice } = await import("./transactions.ts");
    const alvo = await ambiente(10_000);

    await recordTransaction(alvo.userId, {
      kind: "expense",
      description: "Compra grande",
      amount: cents(90_000),
      occurredOn: localDate("2026-08-05"),
      cardId: alvo.cartaoId,
      categoryId: alvo.categoriaId,
      state: "confirmed",
    });

    await assert.rejects(
      () =>
        payInvoice(
          alvo.userId,
          { cardId: alvo.cartaoId, competence: competence("2026-08"), accountId: alvo.contaId, paidOn: localDate("2026-08-20") },
          new Date("2026-09-01T12:00:00Z"),
        ),
      /Saldo insuficiente/,
    );
  });
});
