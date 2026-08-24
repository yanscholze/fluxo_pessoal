import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { cents } from "../../kernel/money.ts";
import { competence } from "../../time/competence.ts";
import { localDate } from "../../time/local-date.ts";
import { type Budget, appliesTo, budgetStatus, summarizeBudgets } from "./budget.ts";

function orcamento(overrides: Partial<Budget> = {}): Budget {
  return {
    id: "b1",
    userId: "u1",
    categoryId: "cat-alimentacao",
    amount: cents(120000),
    startsOn: localDate("2026-01-01"),
    endsOn: null,
    ...overrides,
  };
}

describe("orçamento", () => {
  describe("vigência", () => {
    it("não vale antes de começar", () => {
      const b = orcamento({ startsOn: localDate("2026-08-01") });
      assert.equal(appliesTo(b, competence("2026-07")), false);
      assert.ok(appliesTo(b, competence("2026-08")));
    });

    it("não vale depois de encerrar", () => {
      const b = orcamento({ endsOn: localDate("2026-08-31") });
      assert.ok(appliesTo(b, competence("2026-08")));
      assert.equal(appliesTo(b, competence("2026-09")), false);
    });

    it("vale no mês em que começa, mesmo começando no meio", () => {
      // Sem isto, criar o orçamento no dia 15 deixaria o mês corrente sem
      // orçamento nenhum, justo quando o usuário acabou de pedir um.
      const b = orcamento({ startsOn: localDate("2026-08-15") });
      assert.ok(appliesTo(b, competence("2026-08")));
    });
  });

  describe("situação", () => {
    it("calcula disponível e percentual", () => {
      const s = budgetStatus(orcamento(), competence("2026-08"), cents(48000), localDate("2026-08-10"));
      assert.equal(s.spent, 48000);
      assert.equal(s.available, 72000);
      assert.equal(s.percentUsed, 40);
    });

    it("não devolve disponível negativo quando estoura", () => {
      const s = budgetStatus(orcamento(), competence("2026-08"), cents(150000), localDate("2026-08-20"));
      assert.equal(s.available, 0);
      assert.ok(s.percentUsed > 100);
    });

    it("projeta o fim do mês pelo ritmo", () => {
      // 10 dias decorridos de 31, R$ 480 gastos: no mesmo ritmo fecha em
      // 480 / 10 × 31 = R$ 1.488.
      const s = budgetStatus(orcamento(), competence("2026-08"), cents(48000), localDate("2026-08-10"));
      assert.equal(s.daysElapsed, 10);
      assert.equal(s.daysInMonth, 31);
      assert.equal(s.projected, 148800);
      assert.ok(s.willExceed, "gastou 40% em 1/3 do mês: vai estourar");
    });

    it("avisa antes de estourar, não depois", () => {
      // 60% do orçamento no dia 10 ainda não estourou nada, mas já está em
      // rota — é este aviso que o percentual sozinho não dá.
      const s = budgetStatus(orcamento(), competence("2026-08"), cents(72000), localDate("2026-08-10"));
      assert.ok(s.spent < s.amount);
      assert.ok(s.willExceed);
    });

    it("em competência encerrada a projeção é o próprio gasto", () => {
      const s = budgetStatus(orcamento(), competence("2026-07"), cents(90000), localDate("2026-08-24"));
      assert.equal(s.projected, 90000);
      assert.equal(s.willExceed, false);
    });

    it("em competência futura não projeta nada", () => {
      const s = budgetStatus(orcamento(), competence("2026-09"), cents(0), localDate("2026-08-24"));
      assert.equal(s.daysElapsed, 0);
      assert.equal(s.projected, 0);
    });

    it("não extrapola um gasto isolado", () => {
      // Aluguel de R$ 1.800 pago no dia 10: extrapolar pelo ritmo projetaria
      // R$ 5.580 até o fim do mês, e ele não vai acontecer de novo.
      const s = budgetStatus(
        orcamento({ amount: cents(200000) }),
        competence("2026-08"),
        cents(180000),
        localDate("2026-08-10"),
        1,
      );

      assert.equal(s.projected, 180000);
      assert.equal(s.willExceed, false);
    });

    it("extrapola a partir do segundo gasto", () => {
      const s = budgetStatus(orcamento(), competence("2026-08"), cents(48000), localDate("2026-08-10"), 2);
      assert.equal(s.projected, 148800);
    });

    it("ritmo controlado não dispara alerta", () => {
      // R$ 300 em 10 dias fecha em R$ 930, dentro dos R$ 1.200.
      const s = budgetStatus(orcamento(), competence("2026-08"), cents(30000), localDate("2026-08-10"));
      assert.equal(s.projected, 93000);
      assert.equal(s.willExceed, false);
    });
  });

  describe("consolidado", () => {
    it("soma e separa estourados de em risco", () => {
      const hoje = localDate("2026-08-10");
      const statuses = [
        budgetStatus(orcamento({ categoryId: "a" }), competence("2026-08"), cents(150000), hoje),
        budgetStatus(orcamento({ categoryId: "b" }), competence("2026-08"), cents(72000), hoje),
        budgetStatus(orcamento({ categoryId: "c" }), competence("2026-08"), cents(30000), hoje),
      ];

      const totais = summarizeBudgets(statuses);
      assert.equal(totais.amount, 360000);
      assert.equal(totais.spent, 252000);
      assert.equal(totais.exceededCount, 1, "só o que já passou do valor");
      assert.equal(totais.atRiskCount, 1, "o que ainda não passou mas vai");
    });

    it("lista vazia não quebra", () => {
      const totais = summarizeBudgets([]);
      assert.equal(totais.amount, 0);
      assert.equal(totais.percentUsed, 0);
    });
  });
});
