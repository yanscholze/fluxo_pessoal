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
  includeInTotals: true,
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
  isPrimary: true,
  sortOrder: 0,
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
      categories: [],
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
      categories: [],
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
    const outra: LocalAccount = { ...CONTA, id: "poupanca", name: "Poupança", includeInTotals: true,
  openingBalance: cents(0) };

    const numeros = overview({
      categories: [],
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
      categories: [],
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
      categories: [],
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
      categories: [],
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

/**
 * O aplicativo e o site precisam responder o mesmo número.
 *
 * Estes casos são os que distinguem a regra de verdade — o menor saldo
 * projetado — da aproximação que existia aqui antes, `saldo − comprometido`.
 * Se alguém trocar de volta, é aqui que quebra.
 */
describe("livre para gastar, igual ao site", () => {
  it("não conta como disponível hoje o salário que só cai depois", () => {
    const numeros = overview({
      categories: [],
      rows: [
        lancamento({
          id: "salario",
          kind: "income",
          state: "planned",
          accountId: CONTA.id,
          amount: cents(500_000),
          // Cai depois de hoje, e dentro da janela do cartão.
          occurredOn: localDate("2026-09-05"),
          competence: competence("2026-09"),
        }),
      ],
      accounts: [CONTA],
      cards: [CARTAO],
      userId: "usuario",
      today: localDate("2026-08-25"),
      competence: competence("2026-08"),
    });

    // A soma do período daria 6.000,00. Gastar isso hoje deixaria a conta
    // negativa até o dia 5 — o dinheiro do dia 5 não está disponível no dia 25.
    assert.equal(numeros.balance, 100_000);
    assert.equal(numeros.free, 100_000);
  });

  it("desconta o compromisso que vence antes da entrada", () => {
    const numeros = overview({
      categories: [],
      rows: [
        lancamento({
          id: "aluguel",
          kind: "expense",
          state: "planned",
          accountId: CONTA.id,
          amount: cents(40_000),
          occurredOn: localDate("2026-08-28"),
          competence: competence("2026-09"),
        }),
        lancamento({
          id: "salario",
          kind: "income",
          state: "planned",
          accountId: CONTA.id,
          amount: cents(500_000),
          occurredOn: localDate("2026-09-05"),
          competence: competence("2026-09"),
        }),
      ],
      accounts: [CONTA],
      cards: [CARTAO],
      userId: "usuario",
      today: localDate("2026-08-25"),
      competence: competence("2026-08"),
    });

    // O fundo do poço é o dia 28, depois do aluguel e antes do salário.
    assert.equal(numeros.free, 60_000);
  });

  it("conta fora dos totais não entra na folga", () => {
    const foraDoTotal: LocalAccount = {
      ...CONTA,
      id: "anotacao",
      name: "Anotação",
      includeInTotals: false,
      openingBalance: cents(900_000),
    };

    const numeros = overview({
      categories: [],
      rows: [],
      accounts: [CONTA, foraDoTotal],
      cards: [CARTAO],
      userId: "usuario",
      today: localDate("2026-08-25"),
      competence: competence("2026-08"),
    });

    assert.equal(numeros.free, 100_000, "os 9.000 da conta marcada ficam de fora");
  });

  it("a decomposição acompanha o número", () => {
    const numeros = overview({
      categories: [],
      rows: [
        lancamento({
          id: "compra",
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

    assert.equal(numeros.freeToSpend.liquidBalance, 100_000);
    assert.equal(numeros.freeToSpend.openInvoices, 30_000);
    assert.equal(numeros.freeToSpend.amount, numeros.free);
  });
});
