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

    assert.equal(livre.amount, 600000, "saldo + entradas − saídas do ciclo");
  });

  it("fecha a conta do ciclo mesmo quando a entrada cai depois da saída", () => {
    const entries = razao(
      lancamento({
        id: "aluguel",
        kind: "expense",
        amount: cents(250000),
        state: "planned",
        occurredOn: localDate("2026-08-08"),
      }),
      lancamento({
        id: "salario",
        kind: "income",
        amount: cents(500000),
        state: "planned",
        occurredOn: localDate("2026-08-12"),
      }),
    );

    const livre = computeFreeToSpend({ accounts: contas, cards: [cartaoFecha13], entries, today: hoje });

    assert.equal(livre.amount, 550000);
  });

  it("a mesma entrada e a mesma saída fecham igual, independentemente da data", () => {
    const cedo = razao(
      lancamento({ id: "e", kind: "income", amount: cents(400000), state: "planned", occurredOn: localDate("2026-08-06") }),
      lancamento({ id: "s", kind: "expense", amount: cents(400000), state: "planned", occurredOn: localDate("2026-08-12") }),
    );
    const tarde = razao(
      lancamento({ id: "s", kind: "expense", amount: cents(400000), state: "planned", occurredOn: localDate("2026-08-06") }),
      lancamento({ id: "e", kind: "income", amount: cents(400000), state: "planned", occurredOn: localDate("2026-08-12") }),
    );

    const base = { accounts: contas, cards: [cartaoFecha13], today: hoje };

    assert.equal(computeFreeToSpend({ ...base, entries: cedo }).amount, 300000);
    assert.equal(computeFreeToSpend({ ...base, entries: tarde }).amount, 300000);
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

  it("desconta recorrência virtual no cartão sem inventar dívida de fatura", () => {
    const assinatura = lancamento({
      id: "virtual:codex",
      kind: "expense",
      amount: cents(10_324),
      state: "planned",
      origin: cardParty(CARTAO),
      occurredOn: localDate("2026-08-10"),
      competence: competence("2026-08"),
    });

    const livre = computeFreeToSpend({
      accounts: contas,
      cards: [cartaoFecha13],
      entries: razao(assinatura),
      today: hoje,
    });

    assert.equal(livre.openInvoices, 0, "projeção não aparece como dívida quitável");
    assert.equal(livre.otherCommitments, cents(10_324));
    assert.equal(livre.amount, cents(289_676));
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

  it("a categoria espelho de entrada também não infla a folga", () => {
    const pagamento = lancamento({
      id: "pagamento-do-emprestimo",
      kind: "income",
      amount: cents(80000),
      state: "planned",
      categoryId: "cat-pagamento-emprestimo",
      occurredOn: localDate("2026-08-10"),
    });

    const livre = computeFreeToSpend({
      accounts: contas,
      cards: [cartaoFecha13],
      entries: razao(pagamento),
      today: hoje,
      categoryByTransaction: new Map([[pagamento.id, pagamento.categoryId]]),
      policy: { excludedCategoryIds: new Set(["cat-pagamento-emprestimo"]) },
    });

    assert.equal(livre.pendingIncome, 0);
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

describe("bolsos separados: dinheiro e benefício", () => {
  /*
   * Vale-alimentação não é dinheiro fungível: compra comida e nada mais.
   * Somá-lo ao saldo da conta produzia um "livre para gastar" que prometia
   * pagar aluguel e fatura com um saldo que não paga nenhum dos dois.
   */
  const contas = [
    conta({ id: CONTA, kind: "checking", openingBalance: cents(100_000) }),
    conta({ id: "vale", kind: "benefit", openingBalance: cents(70_900) }),
  ];

  it("a visão de dinheiro continua disponível como detalhamento", () => {
    const folga = computeFreeToSpend({ accounts: contas, cards: [], entries: [], today: localDate("2026-09-07") }, "money");

    assert.equal(folga.liquidBalance, cents(100_000));
    assert.equal(folga.amount, cents(100_000));
  });

  it("mede o vale sem somar o dinheiro", () => {
    const folga = computeFreeToSpend({ accounts: contas, cards: [], entries: [], today: localDate("2026-09-07") }, "benefit");

    assert.equal(folga.liquidBalance, cents(70_900));
  });

  it("a fatura do cartão não aperta a folga do vale", () => {
    // O vale não quita fatura; descontá-la dele zeraria um saldo que existe.
    const compra = lancamento({
      id: "tx-1",
      kind: "expense",
      amount: cents(50_000),
      origin: cardParty(CARTAO),
      occurredOn: localDate("2026-09-01"),
      competence: competence("2026-09"),
    });
    const entrada = { accounts: contas, cards: [cartaoFecha13], entries: razao(compra), today: localDate("2026-09-07") };

    assert.equal(computeFreeToSpend(entrada, "benefit").amount, cents(70_900));
    assert.equal(computeFreeToSpend(entrada, "money").amount, cents(50_000), "no dinheiro ela pesa");
  });

  it("a posição consolida vale e dinheiro no livre do ciclo", () => {
    const posicao = computeFinancialPosition({
      accounts: contas,
      cards: [],
      entries: [],
      today: localDate("2026-09-07"),
    });

    assert.equal(posicao.freeToSpend.amount, cents(170_900));
    assert.equal(posicao.benefitFreeToSpend.amount, cents(70_900));
    assert.equal(posicao.currentBalance, cents(170_900));
  });
});

describe("categoria fora do livre para gastar", () => {
  /*
   * A marcação existia mas só alcançava previsto em conta: a fatura entrava
   * sempre pelo total. Quem separa "Empréstimo do Cartão" quer exatamente que
   * aquelas parcelas não apertem a folga do mês.
   */
  const contas = [conta({ id: CONTA, kind: "checking", openingBalance: cents(300_000) })];
  const emprestimo = lancamento({
    id: "tx-emprestimo",
    kind: "expense",
    amount: cents(177_142),
    origin: cardParty(CARTAO),
    categoryId: "cat-emprestimo",
    occurredOn: localDate("2026-09-01"),
    competence: competence("2026-09"),
  });
  const compra = lancamento({
    id: "tx-compra",
    kind: "expense",
    amount: cents(20_000),
    origin: cardParty(CARTAO),
    categoryId: "cat-mercado",
    occurredOn: localDate("2026-09-02"),
    competence: competence("2026-09"),
  });
  const entries = razao(emprestimo, compra);
  const categorias = new Map([
    ["tx-emprestimo", "cat-emprestimo"],
    ["tx-compra", "cat-mercado"],
  ]);

  it("sem a marcação, a parcela pesa na folga", () => {
    const folga = computeFreeToSpend({
      accounts: contas,
      cards: [cartaoFecha13],
      entries,
      categoryByTransaction: categorias,
      today: localDate("2026-09-07"),
    });

    assert.equal(folga.amount, cents(300_000 - 177_142 - 20_000));
  });

  it("com a marcação, só a compra comum pesa", () => {
    const folga = computeFreeToSpend({
      accounts: contas,
      cards: [cartaoFecha13],
      entries,
      categoryByTransaction: categorias,
      policy: { excludedCategoryIds: new Set(["cat-emprestimo"]) },
      today: localDate("2026-09-07"),
    });

    assert.equal(folga.amount, cents(300_000 - 20_000));
    assert.equal(folga.openInvoices, cents(20_000), "a fatura em aberto reflete só o que pesa");
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

describe("parcela futura não é dívida de hoje", () => {
  /*
   * De um extrato real: o dono tinha uma fatura aberta de R$ 4.956,51 e 67
   * parcelas futuras somando R$ 13.319,68. O patrimônio aparecia como
   * -R$ 14.531,00 porque as parcelas ainda não cobradas entravam como passivo.
   *
   * Elas são compromisso, e já contam como tal em `committed`. Somá-las ao
   * passivo é contá-las duas vezes — e a segunda no lugar errado.
   */
  const contas = [conta({ id: CONTA, kind: "checking", openingBalance: cents(393_268) })];

  const cobrada = lancamento({
    id: "tx-cobrada",
    kind: "expense",
    amount: cents(495_651),
    origin: cardParty(CARTAO),
    occurredOn: localDate("2026-09-01"),
    competence: competence("2026-09"),
  });
  const futura = lancamento({
    id: "tx-futura",
    kind: "expense",
    amount: cents(1_331_968),
    state: "planned",
    origin: cardParty(CARTAO),
    occurredOn: localDate("2026-10-12"),
    competence: competence("2026-10"),
  });

  it("o patrimônio conta só o que já foi cobrado", () => {
    const posicao = computeFinancialPosition({
      accounts: contas,
      cards: [cartaoFecha13],
      entries: razao(cobrada, futura),
      today: localDate("2026-09-07"),
    });

    assert.equal(posicao.cardDebt, cents(495_651), "a parcela de outubro não é dívida em setembro");
    assert.equal(posicao.netWorth, cents(393_268 - 495_651));
  });

  it("sem parcela futura o resultado é o mesmo", () => {
    const so = computeFinancialPosition({
      accounts: contas,
      cards: [cartaoFecha13],
      entries: razao(cobrada),
      today: localDate("2026-09-07"),
    });
    const com = computeFinancialPosition({
      accounts: contas,
      cards: [cartaoFecha13],
      entries: razao(cobrada, futura),
      today: localDate("2026-09-07"),
    });

    assert.equal(com.netWorth, so.netWorth);
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
