import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { cents } from "@fluxo/core/kernel/money.ts";
import { competence } from "@fluxo/core/time/competence.ts";
import { localDate } from "@fluxo/core/time/local-date.ts";
import { buildLedger, overview } from "../src/finance/derive.ts";
import type { LocalAccount, LocalCard, LocalTransaction } from "../src/storage/model.ts";

const CONTA: LocalAccount = {
  id: "conta-corrente",
  name: "Corrente",
  kind: "checking",
  currency: "BRL",
  openingBalance: cents(100_000),
  color: null,
  archivedAt: null,
};

/** Fecha dia 13, vence dia 20. É o cartão do enunciado do projeto. */
const CARTAO: LocalCard = {
  id: "cartao-principal",
  name: "Principal",
  kind: "credit",
  closingDay: 13,
  dueDay: 20,
  dueAdjustment: "next",
  limit: cents(500_000),
  color: null,
  archivedAt: null,
};

function lancamento(partial: Partial<LocalTransaction> & { id: string }): LocalTransaction {
  return {
    kind: "expense",
    state: "confirmed",
    description: "Lançamento",
    categoryId: null,
    amount: cents(1000),
    occurredOn: localDate("2026-08-20"),
    competence: competence("2026-08"),
    accountId: null,
    cardId: null,
    destinationAccountId: null,
    destinationCardId: null,
    tripId: null,
    installmentNumber: null,
    notes: null,
    version: 1,
    updatedAt: "2026-08-20T12:00:00.000Z",
    ...partial,
  };
}

describe("razão derivado no aparelho", () => {
  it("uma despesa em conta sai do saldo", () => {
    const numeros = overview({
      rows: [lancamento({ id: "a", accountId: CONTA.id, amount: cents(25_000) })],
      accounts: [CONTA],
      cards: [],
      userId: "usuario",
      today: localDate("2026-08-25"),
      competence: competence("2026-08"),
    });

    assert.equal(numeros.balance, 75_000);
    assert.equal(numeros.expense, 25_000);
    assert.equal(numeros.committed, 0);
  });

  it("compra no crédito não toca o saldo — só o comprometido", () => {
    const numeros = overview({
      rows: [
        lancamento({
          id: "b",
          cardId: CARTAO.id,
          amount: cents(30_000),
          competence: competence("2026-09"),
        }),
      ],
      accounts: [CONTA],
      cards: [CARTAO],
      userId: "usuario",
      today: localDate("2026-08-25"),
      competence: competence("2026-08"),
    });

    // O dinheiro só sai quando a fatura for paga. Descontar agora contaria o
    // mesmo gasto duas vezes.
    assert.equal(numeros.balance, 100_000);
    assert.equal(numeros.committed, 30_000);
    assert.equal(numeros.free, 70_000);
  });

  it("transferência entre contas próprias não vira despesa", () => {
    const outra: LocalAccount = { ...CONTA, id: "poupanca", name: "Poupança", openingBalance: cents(0) };

    const numeros = overview({
      rows: [
        lancamento({
          id: "c",
          kind: "transfer",
          accountId: CONTA.id,
          destinationAccountId: outra.id,
          amount: cents(40_000),
        }),
      ],
      accounts: [CONTA, outra],
      cards: [],
      userId: "usuario",
      today: localDate("2026-08-25"),
      competence: competence("2026-08"),
    });

    assert.equal(numeros.balance, 100_000);
    assert.equal(numeros.expense, 0);
    assert.equal(numeros.income, 0);
  });

  it("pagamento de fatura abate a dívida da competência quitada", () => {
    const numeros = overview({
      rows: [
        lancamento({
          id: "compra",
          cardId: CARTAO.id,
          amount: cents(30_000),
          occurredOn: localDate("2026-07-10"),
          competence: competence("2026-07"),
        }),
        lancamento({
          id: "pagamento",
          kind: "invoice_payment",
          accountId: CONTA.id,
          destinationCardId: CARTAO.id,
          amount: cents(30_000),
          occurredOn: localDate("2026-08-20"),
          // A competência do pagamento é a da fatura, não a do mês em que o
          // dinheiro saiu da conta.
          competence: competence("2026-07"),
        }),
      ],
      accounts: [CONTA],
      cards: [CARTAO],
      userId: "usuario",
      today: localDate("2026-08-25"),
      competence: competence("2026-08"),
    });

    assert.equal(numeros.balance, 70_000);
    assert.equal(numeros.committed, 0);
    // Pagar fatura não é despesa: as compras já foram contadas quando feitas.
    assert.equal(numeros.expense, 0);
  });

  it("lançamento sem origem não derruba o cálculo", () => {
    const { entries, skipped } = buildLedger(
      [
        lancamento({ id: "valida", accountId: CONTA.id }),
        // Lápide de exclusão vinda do servidor: sem conta e sem cartão.
        lancamento({ id: "lapide" }),
        // Transferência sem destino: o domínio recusa, e ela é pulada.
        lancamento({ id: "quebrada", kind: "transfer", accountId: CONTA.id }),
      ],
      "usuario",
    );

    assert.equal(entries.length, 1);
    assert.equal(skipped, 1);
  });

  it("limite não cadastrado não vira zero disponível", () => {
    const semLimite: LocalCard = { ...CARTAO, limit: cents(0) };

    const numeros = overview({
      rows: [],
      accounts: [CONTA],
      cards: [semLimite],
      userId: "usuario",
      today: localDate("2026-08-25"),
      competence: competence("2026-08"),
    });

    assert.equal(numeros.cards[0].available, null);
  });

  it("a fatura ativa segue o fechamento, não o mês civil", () => {
    const numeros = overview({
      rows: [],
      accounts: [CONTA],
      cards: [CARTAO],
      userId: "usuario",
      // Depois do fechamento do dia 13: a fatura corrente já é a de setembro.
      today: localDate("2026-08-25"),
      competence: competence("2026-08"),
    });

    assert.equal(numeros.cards[0].competence, "2026-09");
  });
});
