/**
 * Estorno no cartão.
 *
 * Nasceu de uma importação real. A loja devolveu duas compras do Mercado Livre
 * num mês em que a compra original tinha caído na fatura **anterior**, já paga
 * pelo valor cheio. Não havia como registrar isso: `income` exige conta —
 * "receita precisa entrar numa conta, não num cartão" —, `expense` não aceita
 * valor negativo, e abater a compra original mudaria uma fatura já quitada,
 * fazendo o pagamento virar sobra.
 *
 * O que faltava era um lançamento que some no cartão sem passar por conta
 * nenhuma. É o que `refund` faz.
 */

import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { cents } from "../../core/kernel/money.ts";
import { competence } from "../../core/time/competence.ts";
import { localDate } from "../../core/time/local-date.ts";
import { ambiente, zerar } from "../testing/cenario.ts";

describe("estorno no cartão", () => {
  beforeEach(() => zerar());

  it("abate a fatura sem entrar em conta nenhuma", async () => {
    const { recordTransaction } = await import("./transactions.ts");
    const { loadLedger } = await import("../repositories/ledger.ts");
    const { accountBalance, cardDebt } = await import("../../core/domain/ledger/balance.ts");
    const alvo = await ambiente();

    await recordTransaction(alvo.userId, {
      kind: "expense",
      description: "Mercado Livre",
      amount: cents(20_000),
      occurredOn: localDate("2026-08-05"),
      cardId: alvo.cartaoId,
      categoryId: alvo.categoriaId,
      state: "confirmed",
    });

    const razaoAntes = await loadLedger(alvo.userId);
    const contaAntes = accountBalance(razaoAntes, alvo.contaId, localDate("2026-08-31"), cents(500_000));

    await recordTransaction(alvo.userId, {
      kind: "refund",
      description: 'Estorno de "Mercado Livre"',
      amount: cents(8_000),
      occurredOn: localDate("2026-08-10"),
      cardId: alvo.cartaoId,
      state: "confirmed",
    });

    const razao = await loadLedger(alvo.userId);
    assert.equal(cardDebt(razao, alvo.cartaoId), cents(12_000), "a dívida cai pelo estorno");
    assert.equal(
      accountBalance(razao, alvo.contaId, localDate("2026-08-31"), cents(500_000)),
      contaAntes,
      "e nenhuma conta é tocada",
    );
  });

  it("fica na fatura em que caiu, não na da compra que devolveu", async () => {
    // O caso real: compra em agosto, devolução em setembro. A fatura de agosto
    // já foi paga pelo valor cheio e não pode mudar.
    const { recordTransaction } = await import("./transactions.ts");
    const { loadLedger } = await import("../repositories/ledger.ts");
    const { invoiceTotals } = await import("../../core/domain/ledger/balance.ts");
    const alvo = await ambiente();

    await recordTransaction(alvo.userId, {
      kind: "expense",
      description: "Mercado Livre",
      amount: cents(10_004),
      occurredOn: localDate("2026-08-01"),
      cardId: alvo.cartaoId,
      categoryId: alvo.categoriaId,
      state: "confirmed",
    });
    await recordTransaction(alvo.userId, {
      kind: "refund",
      description: 'Estorno de "Mercado Livre"',
      amount: cents(10_004),
      occurredOn: localDate("2026-09-01"),
      cardId: alvo.cartaoId,
      state: "confirmed",
    });

    const razao = await loadLedger(alvo.userId);
    assert.equal(invoiceTotals(razao, alvo.cartaoId, competence("2026-08")).charges, cents(10_004));
    assert.equal(invoiceTotals(razao, alvo.cartaoId, competence("2026-09")).payments, cents(10_004));
  });

  it("recusa receita no cartão, que continua sendo erro", async () => {
    const { recordTransaction } = await import("./transactions.ts");
    const { DomainError } = await import("../../core/kernel/errors.ts");
    const alvo = await ambiente();

    await assert.rejects(
      () =>
        recordTransaction(alvo.userId, {
          kind: "income",
          description: "Salário",
          amount: cents(100),
          occurredOn: localDate("2026-08-10"),
          cardId: alvo.cartaoId,
          state: "confirmed",
        }),
      DomainError,
    );
  });
});
