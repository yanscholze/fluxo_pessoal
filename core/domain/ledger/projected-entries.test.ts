/**
 * Movimentação projetada não é dívida.
 *
 * Estes testes fixam a regra que faltava e produziu o defeito: o painel injeta
 * as recorrências do mês como movimentações virtuais, e a fatura passou a
 * somá-las como cobrança. O resultado era uma fatura com saldo devedor sem
 * lançamento correspondente — o pagamento quitava tudo que existia, devolvia
 * "resta zero", e a tela continuava exibindo o resíduo em atraso. Pagar de
 * novo respondia "esta fatura já está quitada". Não havia saída.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { cents } from "../../kernel/money.ts";
import { competence } from "../../time/competence.ts";
import { localDate } from "../../time/local-date.ts";
import {
  availableLimit,
  cardDebt,
  committedLimit,
  invoiceTotals,
  overdueCompetences,
  projectedAccountBalance,
} from "./balance.ts";
import { VIRTUAL_PREFIX, type LedgerEntry, accountParty, cardParty } from "./types.ts";

const CARTAO = "cartao-nubank";
const CONTA = "conta-nubank";
const AGOSTO = competence("2026-08");

function movimentacao(overrides: Partial<LedgerEntry> & Pick<LedgerEntry, "id" | "amount">): LedgerEntry {
  return {
    userId: "user-1",
    transactionId: `tx-${overrides.id}`,
    party: cardParty(CARTAO),
    effectiveOn: localDate("2026-08-10"),
    competence: AGOSTO,
    state: "confirmed",
    kind: "expense",
    ...overrides,
  };
}

/** Como a projeção de recorrência chega: identificador com prefixo virtual. */
function projetada(overrides: Partial<LedgerEntry> & Pick<LedgerEntry, "id" | "amount">): LedgerEntry {
  return movimentacao({
    ...overrides,
    transactionId: `${VIRTUAL_PREFIX}recurrence:regra-1:2026-08`,
    state: "planned",
  });
}

describe("movimentação projetada", () => {
  it("não entra na cobrança da fatura", () => {
    const entries = [
      movimentacao({ id: "compra", amount: cents(-20000) }),
      projetada({ id: "assinatura", amount: cents(-5590) }),
    ];

    const totais = invoiceTotals(entries, CARTAO, AGOSTO);

    assert.equal(totais.charges, 20000);
    assert.equal(totais.outstanding, 20000);
  });

  it("entra quando a pergunta é sobre o futuro e a projeção é pedida", () => {
    const entries = [
      movimentacao({ id: "compra", amount: cents(-20000) }),
      projetada({ id: "assinatura", amount: cents(-5590) }),
    ];

    const totais = invoiceTotals(entries, CARTAO, AGOSTO, undefined, { includeProjected: true });

    assert.equal(totais.charges, 25590);
  });

  it("pagar o que existe quita a fatura por inteiro", () => {
    const entries = [
      movimentacao({ id: "compra", amount: cents(-20000) }),
      projetada({ id: "assinatura", amount: cents(-5590) }),
      movimentacao({ id: "pagamento", amount: cents(20000), kind: "invoice_payment" }),
    ];

    const totais = invoiceTotals(entries, CARTAO, AGOSTO);

    assert.equal(totais.outstanding, 0);
    assert.equal(totais.isSettled, true);
  });

  it("não deixa a fatura quitada aparecer em atraso", () => {
    const entries = [
      movimentacao({ id: "compra", amount: cents(-20000) }),
      projetada({ id: "assinatura", amount: cents(-5590) }),
      movimentacao({ id: "pagamento", amount: cents(20000), kind: "invoice_payment" }),
    ];

    assert.deepEqual(overdueCompetences(entries, CARTAO, competence("2026-09")), []);
  });

  it("não vira dívida do cartão nem ocupa limite", () => {
    const entries = [
      movimentacao({ id: "compra", amount: cents(-20000) }),
      projetada({ id: "assinatura", amount: cents(-5590) }),
    ];

    assert.equal(cardDebt(entries, CARTAO), 20000);
    assert.equal(committedLimit(entries, CARTAO), 20000);
    assert.equal(availableLimit(entries, CARTAO, cents(100000)), 80000);
  });

  it("continua contando no saldo projetado da conta", () => {
    const entries = [
      movimentacao({ id: "salario", party: accountParty(CONTA), amount: cents(620000), kind: "income" }),
      projetada({
        id: "aluguel",
        party: accountParty(CONTA),
        amount: cents(-195000),
        effectiveOn: localDate("2026-08-20"),
      }),
    ];

    // O saldo projetado é justamente a pergunta sobre o futuro: a recorrência
    // ainda não lançada precisa aparecer nele.
    assert.equal(projectedAccountBalance(entries, CONTA, localDate("2026-08-31")), 425000);
  });
});
