import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DomainError } from "../../kernel/errors.ts";
import { cents } from "../../kernel/money.ts";
import { competence } from "../../time/competence.ts";
import { localDate } from "../../time/local-date.ts";
import {
  type Recurrence,
  appliesTo,
  assertValidSchedule,
  nextOccurrence,
  occurrenceAmount,
  occurrenceDate,
  occurrenceKey,
  occurrencesBetween,
  projectOccurrences,
} from "./schedule.ts";

function regra(overrides: Partial<Recurrence> = {}): Recurrence {
  return {
    id: "rec-1",
    userId: "user-1",
    role: "standard",
    kind: "expense",
    description: "Aluguel",
    categoryId: "cat-1",
    accountId: "conta-1",
    cardId: null,
    destinationAccountId: null,
    amount: cents(180000),
    amountMode: "fixed",
    scheduleMode: "day_of_month",
    scheduleDay: 10,
    dayAdjustment: "next",
    interval: "monthly",
    startsOn: localDate("2026-01-01"),
    endsOn: null,
    isActive: true,
    ...overrides,
  };
}

describe("agendamento de recorrência", () => {
  describe("dia do mês", () => {
    it("usa o dia quando ele é útil", () => {
      assert.equal(occurrenceDate(regra({ scheduleDay: 10 }), competence("2026-08")), "2026-08-10");
    });

    it("avança para o próximo dia útil", () => {
      // 15/08/2026 é sábado.
      assert.equal(occurrenceDate(regra({ scheduleDay: 15 }), competence("2026-08")), "2026-08-17");
    });

    it("recua quando a regra pede o dia útil anterior", () => {
      assert.equal(
        occurrenceDate(regra({ scheduleDay: 15, dayAdjustment: "previous" }), competence("2026-08")),
        "2026-08-14",
      );
    });

    it("grampeia o dia 31 em meses curtos", () => {
      // Fevereiro/2026 termina no sábado 28: o dia útil seguinte é 02/03.
      assert.equal(occurrenceDate(regra({ scheduleDay: 31 }), competence("2026-02")), "2026-03-02");
    });
  });

  describe("N-ésimo dia útil", () => {
    it("resolve o 5º dia útil, base do salário", () => {
      const salario = regra({ scheduleMode: "business_day_of_month", scheduleDay: 5 });
      assert.equal(occurrenceDate(salario, competence("2026-08")), "2026-08-07");
    });

    it("pula o feriado ao contar", () => {
      const salario = regra({ scheduleMode: "business_day_of_month", scheduleDay: 5 });
      // 07/09 é Independência: o 5º dia útil de setembro é dia 8.
      assert.equal(occurrenceDate(salario, competence("2026-09")), "2026-09-08");
    });
  });

  describe("valor", () => {
    it("mantém o valor fixo", () => {
      assert.equal(occurrenceAmount(regra(), competence("2026-08")), 180000);
    });

    it("multiplica pelos dias úteis no modo vale-alimentação", () => {
      const va = regra({ amount: cents(3500), amountMode: "per_business_day" });
      // Agosto/2026 tem 21 dias úteis: 35,00 × 21 = 735,00.
      assert.equal(occurrenceAmount(va, competence("2026-08")), 73500);
    });

    it("credita menos num mês com feriado a mais", () => {
      const va = regra({ amount: cents(3500), amountMode: "per_business_day" });
      const agosto = occurrenceAmount(va, competence("2026-08"));
      const janeiro = occurrenceAmount(va, competence("2026-01"));
      // Janeiro/2026 tem 21 dias úteis (1º é feriado numa quinta).
      assert.equal(janeiro, 73500);
      assert.equal(agosto, 73500);
      // Fevereiro tem menos dias e ainda perde dois com o Carnaval.
      assert.ok(occurrenceAmount(va, competence("2026-02")) < agosto);
    });
  });

  describe("vigência", () => {
    it("não vale antes do início", () => {
      const rule = regra({ startsOn: localDate("2026-06-01") });
      assert.equal(appliesTo(rule, competence("2026-05")), false);
      assert.ok(appliesTo(rule, competence("2026-06")));
    });

    it("não vale depois do fim", () => {
      const rule = regra({ endsOn: localDate("2026-09-30") });
      assert.ok(appliesTo(rule, competence("2026-09")));
      assert.equal(appliesTo(rule, competence("2026-10")), false);
    });

    it("regra pausada não gera nada", () => {
      assert.equal(appliesTo(regra({ isActive: false }), competence("2026-08")), false);
      assert.deepEqual(
        occurrencesBetween(regra({ isActive: false }), competence("2026-08"), competence("2026-12")),
        [],
      );
    });

    it("anual só cai no mês em que começou", () => {
      const anual = regra({ interval: "yearly", startsOn: localDate("2026-03-10") });
      assert.ok(appliesTo(anual, competence("2026-03")));
      assert.equal(appliesTo(anual, competence("2026-04")), false);
      assert.ok(appliesTo(anual, competence("2027-03")));
    });
  });

  describe("projeção", () => {
    it("gera uma ocorrência por competência", () => {
      const ocorrencias = occurrencesBetween(regra(), competence("2026-08"), competence("2026-11"));
      assert.deepEqual(
        ocorrencias.map((item) => item.competence),
        ["2026-08", "2026-09", "2026-10", "2026-11"],
      );
      // Outubro encadeia dois ajustes: 10/10 é sábado e a segunda seguinte,
      // 12/10, é Nossa Senhora Aparecida — o vencimento efetivo é 13/10.
      assert.deepEqual(
        ocorrencias.map((item) => item.date),
        ["2026-08-10", "2026-09-10", "2026-10-13", "2026-11-10"],
      );
    });

    it("combina várias regras em ordem de data", () => {
      const salario = regra({
        id: "salario",
        kind: "income",
        scheduleMode: "business_day_of_month",
        scheduleDay: 5,
      });
      const ocorrencias = projectOccurrences([regra(), salario], competence("2026-08"), competence("2026-08"));
      assert.deepEqual(
        ocorrencias.map((item) => item.date),
        ["2026-08-07", "2026-08-10"],
      );
    });

    it("encontra a próxima ocorrência a partir de uma data", () => {
      const proxima = nextOccurrence(regra(), localDate("2026-08-11"));
      assert.equal(proxima?.date, "2026-09-10");
    });

    it("devolve nada quando a regra já terminou", () => {
      const encerrada = regra({ endsOn: localDate("2026-07-31") });
      assert.equal(nextOccurrence(encerrada, localDate("2026-08-01")), null);
    });
  });

  it("gera chave estável para tornar a confirmação idempotente", () => {
    assert.equal(occurrenceKey("rec-1", competence("2026-08")), "recurrence:rec-1:2026-08");
    assert.equal(
      occurrenceKey("rec-1", competence("2026-08")),
      occurrenceKey("rec-1", competence("2026-08")),
    );
  });

  it("recusa agendamento fora da faixa", () => {
    assert.throws(() => assertValidSchedule({ scheduleMode: "day_of_month", scheduleDay: 32 }), DomainError);
    assert.throws(
      () => assertValidSchedule({ scheduleMode: "business_day_of_month", scheduleDay: 24 }),
      DomainError,
    );
    assert.doesNotThrow(() => assertValidSchedule({ scheduleMode: "day_of_month", scheduleDay: 31 }));
  });
});
