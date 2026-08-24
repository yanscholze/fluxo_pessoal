import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { cents } from "../../kernel/money.ts";
import { competence } from "../../time/competence.ts";
import { localDate } from "../../time/local-date.ts";
import type { Account } from "../account/types.ts";
import { postTransaction } from "../ledger/posting.ts";
import { type LedgerEntry, type Transaction, accountParty, cardParty } from "../ledger/types.ts";
import {
  type PositionCard,
  computeFinancialPosition,
  computeFreeToSpend,
  primaryCard,
  projectCashflow,
  referenceWindow,
} from "./financial-position.ts";

const CONTA = "conta-corrente";
const RESERVA = "conta-reserva";
const CARTAO = "cartao-principal";

function conta(overrides: Partial<Account> & Pick<Account, "id" | "kind">): Account {
  return {
    userId: "user-1",
    name: "Conta",
    institution: "Banco",
    currency: "BRL",
    openingBalance: cents(0),
    openedOn: localDate("2026-01-01"),
    goalAmount: null,
    monthlyYieldBasisPoints: 0,
    includeInTotals: true,
    isProtected: false,
    color: "#000",
    sortOrder: 0,
    archivedAt: null,
    ...overrides,
  };
}

const cartaoFecha13: PositionCard = {
  id: CARTAO,
  kind: "credit",
  isPrimary: true,
  sortOrder: 0,
  closingDay: 13,
  dueDay: 20,
  dueAdjustment: "next",
};

function lancamento(overrides: Partial<Transaction> & Pick<Transaction, "kind" | "amount" | "id">): Transaction {
  return {
    userId: "user-1",
    state: "confirmed",
    source: "manual",
    description: "Lançamento",
    categoryId: "cat-1",
    currency: "BRL",
    occurredOn: localDate("2026-08-05"),
    origin: accountParty(CONTA),
    destination: null,
    competence: competence("2026-08"),
    tripId: null,
    installmentPlanId: null,
    installmentNumber: null,
    recurrenceId: null,
    notes: null,
    ...overrides,
  };
}

function razao(...transactions: Transaction[]): LedgerEntry[] {
  return transactions.flatMap((transaction, txIndex) =>
    postTransaction(transaction).map((draft, entryIndex) => ({ ...draft, id: `e-${txIndex}-${entryIndex}` })),
  );
}

describe("cartão de referência", () => {
  it("usa o cartão marcado como principal", () => {
    const outro: PositionCard = { ...cartaoFecha13, id: "outro", isPrimary: false, sortOrder: 1, closingDay: 5 };
    assert.equal(primaryCard([outro, cartaoFecha13])?.id, CARTAO);
  });

  it("sem marcação, usa o primeiro cartão de crédito pela ordem", () => {
    const a: PositionCard = { ...cartaoFecha13, id: "a", isPrimary: false, sortOrder: 2 };
    const b: PositionCard = { ...cartaoFecha13, id: "b", isPrimary: false, sortOrder: 1 };
    assert.equal(primaryCard([a, b])?.id, "b");
  });

  it("ignora cartões de débito", () => {
    const debito: PositionCard = { ...cartaoFecha13, id: "debito", kind: "debit" };
    assert.equal(primaryCard([debito]), null);
  });

  it("a janela é o ciclo do cartão, não o mês civil", () => {
    const janela = referenceWindow([cartaoFecha13], localDate("2026-08-05"));
    assert.equal(janela?.start, "2026-07-14");
    assert.equal(janela?.end, "2026-08-13");
  });

  it("cai no mês civil quando não há cartão de crédito", () => {
    const livre = computeFreeToSpend({
      accounts: [conta({ id: CONTA, kind: "checking" })],
      cards: [],
      entries: [],
      today: localDate("2026-08-05"),
    });
    assert.equal(livre.windowStart, "2026-08-01");
    assert.equal(livre.windowEnd, "2026-08-31");
  });
});

describe("livre para gastar", () => {
  const contas = [
    conta({ id: CONTA, kind: "checking", openingBalance: cents(300000) }),
    conta({ id: RESERVA, kind: "investment", openingBalance: cents(1000000) }),
  ];
  const hoje = localDate("2026-08-05");

  it("parte do saldo real e desconta a fatura em aberto", () => {
    const entries = razao(
      lancamento({
        id: "compra",
        kind: "expense",
        amount: cents(120000),
        origin: cardParty(CARTAO),
        occurredOn: localDate("2026-07-20"),
        competence: competence("2026-08"),
      }),
    );

    const livre = computeFreeToSpend({ accounts: contas, cards: [cartaoFecha13], entries, today: hoje });

    assert.equal(livre.liquidBalance, 300000, "investimento não entra");
    assert.equal(livre.openInvoices, 120000);
    assert.equal(livre.amount, 180000);
  });

  it("soma receitas previstas da janela e desconta compromissos previstos", () => {
    const entries = razao(
      lancamento({
        id: "salario",
        kind: "income",
        amount: cents(500000),
        state: "planned",
        occurredOn: localDate("2026-08-07"),
      }),
      lancamento({
        id: "aluguel",
        kind: "expense",
        amount: cents(200000),
        state: "planned",
        occurredOn: localDate("2026-08-10"),
      }),
    );

    const livre = computeFreeToSpend({ accounts: contas, cards: [cartaoFecha13], entries, today: hoje });

    assert.equal(livre.pendingIncome, 500000);
    assert.equal(livre.otherCommitments, 200000);
    assert.equal(livre.amount, 600000);
  });

  it("ignora previstos fora da janela do ciclo", () => {
    const entries = razao(
      lancamento({
        id: "depois-do-fechamento",
        kind: "income",
        amount: cents(500000),
        state: "planned",
        // 20/08 já passou do fechamento de 13/08: pertence ao ciclo seguinte.
        occurredOn: localDate("2026-08-20"),
      }),
    );

    const livre = computeFreeToSpend({ accounts: contas, cards: [cartaoFecha13], entries, today: hoje });
    assert.equal(livre.pendingIncome, 0, "renda pós-fechamento é do próximo ciclo");
    assert.equal(livre.amount, 300000);
  });

  it("não conta compra no crédito como compromisso em conta", () => {
    const entries = razao(
      lancamento({
        id: "compra",
        kind: "expense",
        amount: cents(50000),
        origin: cardParty(CARTAO),
        state: "planned",
        occurredOn: localDate("2026-08-05"),
        competence: competence("2026-08"),
      }),
    );

    const livre = computeFreeToSpend({ accounts: contas, cards: [cartaoFecha13], entries, today: hoje });
    // A compra pesa pela fatura, nunca duas vezes.
    assert.equal(livre.otherCommitments, 0);
  });

  it("respeita categorias excluídas da política", () => {
    const entries = razao(
      lancamento({
        id: "emprestimo",
        kind: "expense",
        amount: cents(80000),
        state: "planned",
        categoryId: "cat-emprestimo",
        occurredOn: localDate("2026-08-10"),
      }),
    );

    const livre = computeFreeToSpend({
      accounts: contas,
      cards: [cartaoFecha13],
      entries,
      today: hoje,
      categoryByTransaction: new Map([["emprestimo", "cat-emprestimo"]]),
      policy: { excludedCategoryIds: new Set(["cat-emprestimo"]) },
    });

    assert.equal(livre.otherCommitments, 0);
    assert.equal(livre.amount, 300000);
  });

  it("desconta também as faturas atrasadas", () => {
    const entries = razao(
      lancamento({
        id: "atrasada",
        kind: "expense",
        amount: cents(90000),
        origin: cardParty(CARTAO),
        occurredOn: localDate("2026-06-20"),
        competence: competence("2026-07"),
      }),
      lancamento({
        id: "atual",
        kind: "expense",
        amount: cents(60000),
        origin: cardParty(CARTAO),
        occurredOn: localDate("2026-07-20"),
        competence: competence("2026-08"),
      }),
    );

    const livre = computeFreeToSpend({ accounts: contas, cards: [cartaoFecha13], entries, today: hoje });
    assert.equal(livre.openInvoices, 150000, "a fatura atrasada continua sendo obrigação");
  });

  it("ignora contas marcadas fora dos totais", () => {
    const anotacao = conta({ id: "anotacao", kind: "checking", openingBalance: cents(999999), includeInTotals: false });
    const livre = computeFreeToSpend({
      accounts: [...contas, anotacao],
      cards: [cartaoFecha13],
      entries: [],
      today: hoje,
    });
    assert.equal(livre.liquidBalance, 300000);
  });
});

describe("posição financeira", () => {
  const hoje = localDate("2026-08-05");
  const contas = [
    conta({ id: CONTA, kind: "checking", openingBalance: cents(300000) }),
    conta({ id: RESERVA, kind: "investment", openingBalance: cents(1000000) }),
  ];

  it("separa saldo, investimento, dívida e patrimônio", () => {
    const entries = razao(
      lancamento({
        id: "compra",
        kind: "expense",
        amount: cents(120000),
        origin: cardParty(CARTAO),
        occurredOn: localDate("2026-07-20"),
        competence: competence("2026-08"),
      }),
    );

    const posicao = computeFinancialPosition({
      accounts: contas,
      cards: [cartaoFecha13],
      entries,
      today: hoje,
    });

    assert.equal(posicao.currentBalance, 300000, "só o que é gastável");
    assert.equal(posicao.investments, 1000000);
    assert.equal(posicao.totalAssets, 1300000);
    assert.equal(posicao.cardDebt, 120000);
    assert.equal(posicao.netWorth, 1180000, "ativos menos passivos");
    assert.equal(posicao.committed, 120000);
  });

  it("não soma conta em moeda estrangeira ao patrimônio em reais", () => {
    const emDolar = conta({
      id: "conta-usd",
      kind: "checking",
      currency: "USD",
      openingBalance: cents(100000),
    });

    const posicao = computeFinancialPosition({
      accounts: [...contas, emDolar],
      cards: [cartaoFecha13],
      entries: [],
      today: hoje,
    });

    // Somar centavos de dólar como centavos de real inventaria patrimônio.
    assert.equal(posicao.totalAssets, 1300000);
    assert.equal(posicao.investments, 1000000);
  });

  it("dinheiro futuro não aparece como saldo atual", () => {
    const entries = razao(
      lancamento({
        id: "salario",
        kind: "income",
        amount: cents(500000),
        state: "planned",
        occurredOn: localDate("2026-08-07"),
      }),
    );

    const posicao = computeFinancialPosition({ accounts: contas, cards: [cartaoFecha13], entries, today: hoje });
    assert.equal(posicao.currentBalance, 300000, "o salário previsto não entrou no saldo");
    assert.equal(posicao.freeToSpend.pendingIncome, 500000, "mas conta como entrada certa da janela");
  });
});

describe("fluxo futuro", () => {
  it("projeta o saldo ao fim de cada competência", () => {
    const contas = [conta({ id: CONTA, kind: "checking", openingBalance: cents(100000) })];
    const entries = razao(
      lancamento({
        id: "sal-set",
        kind: "income",
        amount: cents(500000),
        state: "planned",
        occurredOn: localDate("2026-09-05"),
        competence: competence("2026-09"),
      }),
      lancamento({
        id: "aluguel-set",
        kind: "expense",
        amount: cents(200000),
        state: "planned",
        occurredOn: localDate("2026-09-10"),
        competence: competence("2026-09"),
      }),
      lancamento({
        id: "sal-out",
        kind: "income",
        amount: cents(500000),
        state: "planned",
        occurredOn: localDate("2026-10-05"),
        competence: competence("2026-10"),
      }),
    );

    const pontos = projectCashflow({
      accounts: contas,
      cards: [cartaoFecha13],
      entries,
      today: localDate("2026-08-31"),
      competences: [competence("2026-09"), competence("2026-10")],
    });

    assert.equal(pontos[0].inflow, 500000);
    assert.equal(pontos[0].outflow, 200000);
    assert.equal(pontos[0].projectedBalance, 400000);
    assert.equal(pontos[1].projectedBalance, 900000);
  });

  it("projeta o pagamento da fatura como saída de caixa", () => {
    const contas = [conta({ id: CONTA, kind: "checking", openingBalance: cents(1000000) })];
    // Compra na fatura de setembro, que vence em 21/09 (20/09 é domingo).
    const entries = razao(
      lancamento({
        id: "compra",
        kind: "expense",
        amount: cents(300000),
        origin: cardParty(CARTAO),
        occurredOn: localDate("2026-08-20"),
        competence: competence("2026-09"),
      }),
    );

    const pontos = projectCashflow({
      accounts: contas,
      cards: [cartaoFecha13],
      entries,
      today: localDate("2026-08-31"),
      competences: [competence("2026-09"), competence("2026-10")],
    });

    assert.equal(pontos[0].outflow, 300000, "a fatura vira saída no mês em que vence");
    assert.equal(pontos[0].projectedBalance, 700000);
    assert.equal(pontos[1].outflow, 0, "não cobra a mesma fatura duas vezes");
  });

  it("traz para o primeiro mês o previsto de competência anterior à janela", () => {
    const contas = [conta({ id: CONTA, kind: "checking", openingBalance: cents(1000000) })];
    const entries = razao(
      lancamento({
        id: "conta-de-luz",
        kind: "expense",
        amount: cents(30000),
        state: "planned",
        occurredOn: localDate("2026-08-28"),
        competence: competence("2026-08"),
      }),
    );

    const pontos = projectCashflow({
      accounts: contas,
      cards: [cartaoFecha13],
      entries,
      today: localDate("2026-08-24"),
      competences: [competence("2026-09"), competence("2026-10")],
    });

    // Ainda não aconteceu e continua devendo acontecer: sumir da projeção
    // mostraria um saldo mais folgado do que o real.
    assert.equal(pontos[0].outflow, 30000);
    assert.equal(pontos[0].projectedBalance, 970000);
  });

  it("traz a fatura atrasada para o primeiro mês da projeção", () => {
    const contas = [conta({ id: CONTA, kind: "checking", openingBalance: cents(1000000) })];
    // Fatura de julho, vencida em 20/07 e nunca paga.
    const entries = razao(
      lancamento({
        id: "atrasada",
        kind: "expense",
        amount: cents(150000),
        origin: cardParty(CARTAO),
        occurredOn: localDate("2026-06-20"),
        competence: competence("2026-07"),
      }),
    );

    const pontos = projectCashflow({
      accounts: contas,
      cards: [cartaoFecha13],
      entries,
      today: localDate("2026-08-31"),
      competences: [competence("2026-09"), competence("2026-10")],
    });

    // Sem isso a dívida mais urgente simplesmente sumiria do gráfico.
    assert.equal(pontos[0].outflow, 150000);
    assert.equal(pontos[0].projectedBalance, 850000);
  });

  it("não projeta fatura já quitada", () => {
    const contas = [conta({ id: CONTA, kind: "checking", openingBalance: cents(1000000) })];
    const entries = razao(
      lancamento({
        id: "compra",
        kind: "expense",
        amount: cents(300000),
        origin: cardParty(CARTAO),
        occurredOn: localDate("2026-08-20"),
        competence: competence("2026-09"),
      }),
      lancamento({
        id: "pagamento",
        kind: "invoice_payment",
        amount: cents(300000),
        origin: accountParty(CONTA),
        destination: cardParty(CARTAO),
        occurredOn: localDate("2026-09-21"),
        competence: competence("2026-09"),
      }),
    );

    const pontos = projectCashflow({
      accounts: contas,
      cards: [cartaoFecha13],
      entries,
      today: localDate("2026-08-31"),
      competences: [competence("2026-09")],
    });

    // O pagamento já é uma movimentação de conta e entra pelo caminho normal;
    // projetá-lo de novo cobraria a fatura em dobro.
    assert.equal(pontos[0].outflow, 300000);
  });
});
