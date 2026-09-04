import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DomainError } from "../../kernel/errors.ts";
import { type Cents, cents } from "../../kernel/money.ts";
import { competence } from "../../time/competence.ts";
import { localDate } from "../../time/local-date.ts";
import {
  CONSUMPTION,
  accountBalance,
  availableLimit,
  cardDebt,
  cardDebtAsOf,
  committedLimit,
  flow,
  invoiceTotals,
  overdueCompetences,
  projectedAccountBalance,
} from "./balance.ts";
import { effectOn, postTransaction } from "./posting.ts";
import { type LedgerEntry, type Transaction, accountParty, cardParty } from "./types.ts";

const CONTA = "conta-nubank";
const POUPANCA = "conta-poupanca";
const CARTAO = "cartao-nubank";

function lancamento(overrides: Partial<Transaction> & Pick<Transaction, "kind" | "amount">): Transaction {
  return {
    id: "tx-1",
    userId: "user-1",
    state: "confirmed",
    source: "manual",
    description: "Lançamento",
    categoryId: "cat-1",
    currency: "BRL",
    occurredOn: localDate("2026-08-10"),
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

/** Posta um conjunto de lançamentos e devolve o razão resultante. */
function razao(...transactions: Transaction[]): LedgerEntry[] {
  return transactions.flatMap((transaction, txIndex) =>
    postTransaction(transaction).map((draft, entryIndex) => ({
      ...draft,
      id: `entry-${txIndex}-${entryIndex}`,
    })),
  );
}

describe("postagem", () => {
  it("despesa em conta reduz a conta", () => {
    const entries = postTransaction(lancamento({ kind: "expense", amount: cents(12000) }));
    assert.equal(entries.length, 1);
    assert.deepEqual(entries[0].party, accountParty(CONTA));
    assert.equal(entries[0].amount, -12000);
  });

  it("receita aumenta a conta", () => {
    const entries = postTransaction(lancamento({ kind: "income", amount: cents(500000) }));
    assert.equal(entries.length, 1);
    assert.equal(entries[0].amount, 500000);
  });

  it("compra no crédito não toca conta nenhuma", () => {
    const compra = lancamento({
      kind: "expense",
      amount: cents(12000),
      origin: cardParty(CARTAO),
      competence: competence("2026-09"),
    });
    const entries = postTransaction(compra);

    assert.equal(entries.length, 1);
    assert.deepEqual(entries[0].party, cardParty(CARTAO));
    assert.equal(entries[0].amount, -12000, "aumenta a dívida do cartão");
    assert.equal(entries[0].competence, "2026-09", "cai na competência da fatura");
    assert.equal(effectOn(compra, accountParty(CONTA)), 0, "o saldo da conta não muda");
  });

  it("transferência move de uma conta para outra e se anula no total", () => {
    const entries = postTransaction(
      lancamento({
        kind: "transfer",
        amount: cents(20000),
        origin: accountParty(CONTA),
        destination: accountParty(POUPANCA),
      }),
    );

    assert.equal(entries.length, 2);
    assert.equal(entries[0].amount, -20000);
    assert.equal(entries[1].amount, 20000);
    assert.equal(entries[0].amount + entries[1].amount, 0);
  });

  it("pagamento de fatura sai da conta e abate a dívida do cartão", () => {
    const pagamento = lancamento({
      kind: "invoice_payment",
      amount: cents(419600),
      occurredOn: localDate("2026-09-20"),
      origin: accountParty(CONTA),
      destination: cardParty(CARTAO),
      competence: competence("2026-08"),
    });
    const entries = postTransaction(pagamento);

    assert.equal(entries.length, 2);
    assert.equal(entries[0].amount, -419600, "sai da conta");
    assert.equal(entries[1].amount, 419600, "reduz a dívida");
    assert.equal(
      entries[1].competence,
      "2026-08",
      "a perna do cartão pertence à fatura quitada, não ao mês do pagamento",
    );
  });

  it("as duas pernas da transferência ficam na mesma competência", () => {
    // A data ajustada pode cair fora do mês civil da competência (recorrência
    // no dia 1 com ajuste para o dia útil anterior). Se as pernas divergirem,
    // a transferência aparece como saída num mês e entrada em outro.
    const entries = postTransaction(
      lancamento({
        kind: "transfer",
        amount: cents(20000),
        occurredOn: localDate("2026-07-31"),
        competence: competence("2026-08"),
        origin: accountParty(CONTA),
        destination: accountParty(POUPANCA),
      }),
    );

    assert.equal(entries[0].competence, "2026-08");
    assert.equal(entries[1].competence, "2026-08");
  });

  it("o pagamento de fatura sai no mês em que o dinheiro saiu", () => {
    const entries = postTransaction(
      lancamento({
        kind: "invoice_payment",
        amount: cents(200000),
        occurredOn: localDate("2026-09-05"),
        origin: accountParty(CONTA),
        destination: cardParty(CARTAO),
        competence: competence("2026-07"),
      }),
    );

    assert.equal(entries[0].competence, "2026-09", "a saída de caixa é de setembro");
    assert.equal(entries[1].competence, "2026-07", "mas abate a fatura de julho");
  });

  it("carrega a natureza do fato em cada movimentação", () => {
    const [despesa] = postTransaction(lancamento({ kind: "expense", amount: cents(100) }));
    assert.equal(despesa.kind, "expense");

    const transferencia = postTransaction(
      lancamento({
        kind: "transfer",
        amount: cents(100),
        origin: accountParty(CONTA),
        destination: accountParty(POUPANCA),
      }),
    );
    assert.ok(transferencia.every((entry) => entry.kind === "transfer"));
  });

  it("lançamento em revisão não move dinheiro", () => {
    const entries = postTransaction(lancamento({ kind: "expense", amount: cents(5000), state: "review" }));
    assert.deepEqual(entries, []);
  });

  describe("regras estruturais", () => {
    it("recusa valor zero ou negativo", () => {
      assert.throws(() => postTransaction(lancamento({ kind: "expense", amount: cents(0) })), DomainError);
      assert.throws(() => postTransaction(lancamento({ kind: "expense", amount: cents(-100) })), DomainError);
    });

    it("recusa receita entrando num cartão", () => {
      assert.throws(
        () => postTransaction(lancamento({ kind: "income", amount: cents(100), origin: cardParty(CARTAO) })),
        DomainError,
      );
    });

    it("recusa transferência para a mesma conta", () => {
      assert.throws(
        () =>
          postTransaction(
            lancamento({
              kind: "transfer",
              amount: cents(100),
              origin: accountParty(CONTA),
              destination: accountParty(CONTA),
            }),
          ),
        DomainError,
      );
    });

    it("recusa transferência sem destino", () => {
      assert.throws(
        () => postTransaction(lancamento({ kind: "transfer", amount: cents(100), destination: null })),
        DomainError,
      );
    });

    it("recusa pagamento de fatura cujo destino não é cartão", () => {
      assert.throws(
        () =>
          postTransaction(
            lancamento({
              kind: "invoice_payment",
              amount: cents(100),
              destination: accountParty(POUPANCA),
            }),
          ),
        DomainError,
      );
    });
  });
});

describe("saldo", () => {
  const hoje = localDate("2026-08-31");

  it("parte do saldo inicial e soma as movimentações", () => {
    const entries = razao(
      lancamento({ id: "t1", kind: "income", amount: cents(500000), occurredOn: localDate("2026-08-05") }),
      lancamento({ id: "t2", kind: "expense", amount: cents(12000), occurredOn: localDate("2026-08-10") }),
    );

    assert.equal(accountBalance(entries, CONTA, hoje, cents(100000)), 588000);
  });

  it("ignora o que ainda não aconteceu na data de corte", () => {
    const entries = razao(
      lancamento({ id: "t1", kind: "expense", amount: cents(10000), occurredOn: localDate("2026-08-10") }),
      lancamento({ id: "t2", kind: "expense", amount: cents(90000), occurredOn: localDate("2026-09-10") }),
    );

    assert.equal(accountBalance(entries, CONTA, hoje), -10000);
    assert.equal(accountBalance(entries, CONTA, localDate("2026-09-30")), -100000);
  });

  it("separa dinheiro atual de dinheiro futuro", () => {
    const entries = razao(
      lancamento({ id: "t1", kind: "income", amount: cents(300000), occurredOn: localDate("2026-08-05") }),
      lancamento({
        id: "t2",
        kind: "income",
        amount: cents(200000),
        occurredOn: localDate("2026-08-25"),
        state: "planned",
      }),
    );

    assert.equal(accountBalance(entries, CONTA, hoje), 300000, "previsto não conta como saldo atual");
    assert.equal(projectedAccountBalance(entries, CONTA, hoje), 500000, "mas conta na projeção");
  });

  it("compra no crédito não altera o saldo da conta", () => {
    const entries = razao(
      lancamento({ id: "t1", kind: "income", amount: cents(500000), occurredOn: localDate("2026-08-05") }),
      lancamento({
        id: "t2",
        kind: "expense",
        amount: cents(120000),
        origin: cardParty(CARTAO),
        occurredOn: localDate("2026-08-10"),
      }),
    );

    assert.equal(accountBalance(entries, CONTA, hoje), 500000);
    assert.equal(cardDebt(entries, CARTAO), 120000);
  });

  it("transferência não cria nem destrói dinheiro", () => {
    const entries = razao(
      lancamento({
        id: "t1",
        kind: "transfer",
        amount: cents(20000),
        origin: accountParty(CONTA),
        destination: accountParty(POUPANCA),
      }),
    );

    assert.equal(accountBalance(entries, CONTA, hoje), -20000);
    assert.equal(accountBalance(entries, POUPANCA, hoje), 20000);
    assert.equal(flow(entries, {}).net, 0);
  });
});

describe("fatura", () => {
  const compras = [
    lancamento({
      id: "c1",
      kind: "expense",
      amount: cents(120000),
      origin: cardParty(CARTAO),
      occurredOn: localDate("2026-07-20"),
      competence: competence("2026-08"),
    }),
    lancamento({
      id: "c2",
      kind: "expense",
      amount: cents(80000),
      origin: cardParty(CARTAO),
      occurredOn: localDate("2026-08-02"),
      competence: competence("2026-08"),
    }),
    lancamento({
      id: "c3",
      kind: "expense",
      amount: cents(50000),
      origin: cardParty(CARTAO),
      occurredOn: localDate("2026-08-20"),
      competence: competence("2026-09"),
    }),
  ];

  it("soma as compras da competência", () => {
    const totals = invoiceTotals(razao(...compras), CARTAO, competence("2026-08"));
    assert.equal(totals.charges, 200000);
    assert.equal(totals.payments, 0);
    assert.equal(totals.outstanding, 200000);
    assert.equal(totals.isSettled, false);
  });

  it("não mistura competências", () => {
    const entries = razao(...compras);
    assert.equal(invoiceTotals(entries, CARTAO, competence("2026-09")).charges, 50000);
  });

  it("abate o pagamento e fecha a fatura", () => {
    const entries = razao(
      ...compras,
      lancamento({
        id: "p1",
        kind: "invoice_payment",
        amount: cents(200000),
        occurredOn: localDate("2026-08-20"),
        origin: accountParty(CONTA),
        destination: cardParty(CARTAO),
        competence: competence("2026-08"),
      }),
    );

    const agosto = invoiceTotals(entries, CARTAO, competence("2026-08"));
    assert.equal(agosto.payments, 200000);
    assert.equal(agosto.outstanding, 0);
    assert.ok(agosto.isSettled);
    assert.equal(cardDebt(entries, CARTAO), 50000, "resta só a fatura de setembro");
  });

  it("aceita pagamento parcial", () => {
    const entries = razao(
      ...compras,
      lancamento({
        id: "p1",
        kind: "invoice_payment",
        amount: cents(50000),
        origin: accountParty(CONTA),
        destination: cardParty(CARTAO),
        competence: competence("2026-08"),
      }),
    );

    const agosto = invoiceTotals(entries, CARTAO, competence("2026-08"));
    assert.equal(agosto.outstanding, 150000);
    assert.equal(agosto.isSettled, false);
  });

  it("aponta as faturas anteriores em atraso", () => {
    const entries = razao(
      ...compras,
      lancamento({
        id: "p1",
        kind: "invoice_payment",
        amount: cents(200000),
        origin: accountParty(CONTA),
        destination: cardParty(CARTAO),
        competence: competence("2026-08"),
      }),
    );

    // Com a fatura de agosto quitada, nada está em atraso em setembro.
    assert.deepEqual(overdueCompetences(entries, CARTAO, competence("2026-09")), []);
    // Sem o pagamento, agosto aparece em atraso.
    assert.deepEqual(overdueCompetences(razao(...compras), CARTAO, competence("2026-09")), ["2026-08"]);
  });

  describe("limite", () => {
    it("conta parcelas futuras como limite já comprometido", () => {
      const entries = razao(...compras);
      assert.equal(committedLimit(entries, CARTAO, competence("2026-08")), 250000);
      assert.equal(availableLimit(entries, CARTAO, cents(1000000), competence("2026-08")), 750000);
    });

    it("libera limite conforme as faturas são pagas", () => {
      const entries = razao(
        ...compras,
        lancamento({
          id: "p1",
          kind: "invoice_payment",
          amount: cents(200000),
          origin: accountParty(CONTA),
          destination: cardParty(CARTAO),
          competence: competence("2026-08"),
        }),
      );
      assert.equal(committedLimit(entries, CARTAO, competence("2026-08")), 50000);
    });

    it("não deixa fatura paga a mais abater o limite de outra", () => {
      const entries = razao(
        ...compras,
        lancamento({
          id: "p1",
          kind: "invoice_payment",
          amount: cents(300000),
          origin: accountParty(CONTA),
          destination: cardParty(CARTAO),
          competence: competence("2026-08"),
        }),
      );
      // Agosto ficou com crédito de 100.000, mas setembro segue devendo 50.000.
      assert.equal(committedLimit(entries, CARTAO, competence("2026-08")), 50000);
    });
  });
});

describe("fluxo do período", () => {
  it("separa entradas de saídas", () => {
    const entries = razao(
      lancamento({ id: "t1", kind: "income", amount: cents(500000), occurredOn: localDate("2026-08-05") }),
      lancamento({ id: "t2", kind: "expense", amount: cents(120000), occurredOn: localDate("2026-08-10") }),
      lancamento({ id: "t3", kind: "expense", amount: cents(30000), occurredOn: localDate("2026-08-12") }),
    );

    const totais = flow(entries, { accountIds: new Set([CONTA]) });
    assert.equal(totais.inflow, 500000);
    assert.equal(totais.outflow, 150000);
    assert.equal(totais.net, 350000);
  });

  it("não conta transferência como despesa ao recortar por conta", () => {
    const entries = razao(
      lancamento({ id: "t1", kind: "expense", amount: cents(30000), occurredOn: localDate("2026-08-10") }),
      lancamento({
        id: "t2",
        kind: "transfer",
        amount: cents(200000),
        occurredOn: localDate("2026-08-12"),
        origin: accountParty(CONTA),
        destination: accountParty(POUPANCA),
      }),
    );

    // Só a conta corrente no recorte: a perna que sobra da transferência
    // apareceria como saída de R$2.000 que nunca foi gasto.
    const soConta = { accountIds: new Set([CONTA]) };
    assert.equal(flow(entries, soConta).outflow, 230000, "sem filtro de natureza, infla");
    assert.equal(flow(entries, { ...soConta, kinds: CONSUMPTION }).outflow, 30000);
    assert.equal(flow(entries, { ...soConta, kinds: CONSUMPTION }).net, -30000);
  });

  it("recorta por janela de datas", () => {
    const entries = razao(
      lancamento({ id: "t1", kind: "expense", amount: cents(10000), occurredOn: localDate("2026-07-20") }),
      lancamento({ id: "t2", kind: "expense", amount: cents(20000), occurredOn: localDate("2026-08-05") }),
    );

    const ciclo = flow(entries, { from: localDate("2026-07-14"), upTo: localDate("2026-08-13") });
    assert.equal(ciclo.outflow, 30000);

    const soAgosto = flow(entries, { from: localDate("2026-08-01"), upTo: localDate("2026-08-31") });
    assert.equal(soAgosto.outflow, 20000);
  });
});

// Garante que o tipo `Cents` não vaze como `number` cru nas somas.
const _tipoPreservado: Cents = accountBalance([], CONTA, localDate("2026-08-31"), cents(1));
void _tipoPreservado;

describe("dívida do cartão numa data passada", () => {
  it("ignora o que ainda não aconteceu", () => {
    const entries = [
      ...razao(lancamento({ id: "compra", kind: "expense", amount: cents(20000), origin: cardParty(CARTAO) })),
      ...razao(
        lancamento({
          id: "futura",
          kind: "expense",
          amount: cents(50000),
          origin: cardParty(CARTAO),
          state: "planned",
          occurredOn: localDate("2026-09-10"),
          competence: competence("2026-09"),
        }),
      ),
    ];

    // `cardDebt` conta o compromisso inteiro; a versão datada conta só o fato.
    assert.equal(cardDebt(entries, CARTAO), 70000);
    assert.equal(cardDebtAsOf(entries, CARTAO, localDate("2026-08-31")), 20000);
  });

  it("o pagamento abate a partir da data em que saiu", () => {
    const entries = [
      ...razao(lancamento({ id: "compra", kind: "expense", amount: cents(20000), origin: cardParty(CARTAO) })),
      ...razao(
        lancamento({
          id: "pagamento",
          kind: "invoice_payment",
          amount: cents(20000),
          origin: accountParty(CONTA),
          destination: cardParty(CARTAO),
          occurredOn: localDate("2026-09-20"),
        }),
      ),
    ];

    assert.equal(cardDebtAsOf(entries, CARTAO, localDate("2026-09-19")), 20000, "véspera do pagamento");
    assert.equal(cardDebtAsOf(entries, CARTAO, localDate("2026-09-20")), 0, "no dia do pagamento");
  });
});
