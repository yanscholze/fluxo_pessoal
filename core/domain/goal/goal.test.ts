import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { cents } from "../../kernel/money.ts";
import { localDate } from "../../time/local-date.ts";
import { type Goal, goalProgress, summarizeGoals } from "./goal.ts";

function meta(overrides: Partial<Goal> = {}): Goal {
  return {
    id: "g1",
    userId: "u1",
    name: "Viagem",
    target: cents(1500000),
    monthlyContribution: cents(50000),
    targetDate: null,
    accountId: null,
    color: "#7c5cff",
    status: "active",
    ...overrides,
  };
}

const HOJE = localDate("2026-08-24");

describe("meta", () => {
  it("calcula progresso e quanto falta", () => {
    const p = goalProgress(meta(), cents(850000), HOJE);
    assert.equal(p.current, 850000);
    assert.equal(p.remaining, 650000);
    assert.ok(Math.abs(p.percent - 56.67) < 0.01);
    assert.equal(p.isAchieved, false);
  });

  it("prevê a conclusão pelo aporte mensal", () => {
    // Faltam R$ 6.500 a R$ 500 por mês: 13 meses, fecha em setembro de 2027.
    const p = goalProgress(meta(), cents(850000), HOJE);
    assert.equal(p.monthsRemaining, 13);
    assert.equal(p.forecast, "2027-09");
  });

  it("sem aporte definido não inventa previsão", () => {
    const p = goalProgress(meta({ monthlyContribution: cents(0) }), cents(850000), HOJE);
    assert.equal(p.monthsRemaining, null);
    assert.equal(p.forecast, null);
  });

  it("reconhece meta alcançada", () => {
    const p = goalProgress(meta(), cents(1500000), HOJE);
    assert.ok(p.isAchieved);
    assert.equal(p.remaining, 0);
    assert.equal(p.percent, 100);
    assert.equal(p.monthsRemaining, 0);
  });

  it("não passa de 100% quando guardou mais que o alvo", () => {
    const p = goalProgress(meta(), cents(2000000), HOJE);
    assert.equal(p.percent, 100);
    assert.equal(p.remaining, 0);
  });

  describe("prazo", () => {
    it("calcula quanto precisaria aportar por mês", () => {
      // Faltam R$ 6.500 em 10 meses (ago/2026 a jun/2027): R$ 650 por mês.
      const p = goalProgress(meta({ targetDate: localDate("2027-06-30") }), cents(850000), HOJE);
      assert.equal(p.requiredMonthly, 65000);
    });

    it("avisa quando o ritmo não alcança o prazo", () => {
      // R$ 500 por mês leva 13 meses, mas o prazo dá 10.
      const p = goalProgress(meta({ targetDate: localDate("2027-06-30") }), cents(850000), HOJE);
      assert.ok(p.behindSchedule);
      assert.ok(p.requiredMonthly! > p.monthlyContribution);
    });

    it("não avisa quando o ritmo alcança", () => {
      const p = goalProgress(
        meta({ targetDate: localDate("2028-06-30"), monthlyContribution: cents(50000) }),
        cents(850000),
        HOJE,
      );
      assert.equal(p.behindSchedule, false);
    });

    it("prazo vencido exige o restante de uma vez", () => {
      const p = goalProgress(meta({ targetDate: localDate("2026-06-30") }), cents(850000), HOJE);
      assert.equal(p.requiredMonthly, 650000);
    });

    it("meta alcançada nunca fica atrasada", () => {
      const p = goalProgress(meta({ targetDate: localDate("2026-01-31") }), cents(1500000), HOJE);
      assert.equal(p.behindSchedule, false);
      assert.equal(p.requiredMonthly, null);
    });
  });

  describe("consolidado", () => {
    it("soma o compromisso mensal só das metas em aberto", () => {
      const total = summarizeGoals([
        goalProgress(meta({ id: "a" }), cents(850000), HOJE),
        goalProgress(meta({ id: "b", target: cents(500000) }), cents(500000), HOJE),
      ]);

      assert.equal(total.achievedCount, 1);
      assert.equal(total.activeCount, 1);
      // A meta já alcançada não exige mais aporte.
      assert.equal(total.monthlyCommitmentCents, 50000);
      assert.equal(total.remainingCents, 650000);
    });
  });
});
