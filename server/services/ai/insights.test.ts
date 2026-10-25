import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { FinancialContext } from "./financial-context.ts";
import { buildFinancialInsights, financialSuggestions } from "./insights.ts";

function context(): FinancialContext {
  return {
    version: 1, asOf: "2026-10-24", currency: "BRL", unit: "cents",
    scope: { debt: "Somente cartões cadastrados", actuals: "Confirmados", forecast: "Previsão", missing: [] },
    cycle: { freeToSpendCents: 0, benefitFreeCents: 0, moneyFreeCents: 0, liquidBalanceCents: 0, pendingIncomeCents: 0, openInvoicesCents: 0, otherCommitmentsCents: 0, windowStart: "2026-10-14", windowEnd: "2026-11-13" },
    position: { currentBalanceCents: 0, investmentsCents: 0, netWorthCents: 0, realizedCardDebtCents: 0 },
    month: { competence: "2026-10", incomeCents: 0, expenseCents: 0, netCents: 0, savingsRatePercent: null },
    history: { completeMonths: [], averageMonthlyIncomeCents: null, averageMonthlyExpenseCents: null, comparison: "completed_months_only" },
    categories: [], categoryTrends: [], cards: [],
    obligations: { overdueCents: 0, overdueCount: 0, next7DaysExpenseCents: 0, next30DaysExpenseCents: 0, next7DaysIncomeCents: 0, next30DaysIncomeCents: 0, events: [], truncated: false },
    installments: { activePlans: 0, remainingCount: 0, remainingCents: 0, next7DaysCents: 0, next30DaysCents: 0, includesAmountsAlreadyInInvoices: true },
    reserve: { currentCents: 0, targetCents: 0, monthsCovered: null, monthlyEssentialCents: null, method: "Base existente" },
    goals: [], cashflow: [],
    savingRecommendation: { suggestedCents: 0, remainingMarginCents: 0, moneyMarginCents: 0, currentMoneyBalanceCents: 0, liquidityAfterNext7DaysCents: 0, historicalDailyExpenseCents: null, prudentialBufferCents: null, observedCompleteMonths: 0, daysRemaining: 20, reason: "insufficient_history", method: "Conservador" },
  };
}

describe("insights financeiros determinísticos", () => {
  it("prioriza riscos e preserva fatos e ação sem depender de provider", () => {
    const data = context();
    data.cycle.freeToSpendCents = -12_345;
    data.obligations.overdueCents = 99_000;
    data.obligations.overdueCount = 2;
    data.obligations.next7DaysExpenseCents = 20_000;
    data.position.currentBalanceCents = 5000;
    const before = JSON.stringify(data);
    const insights = buildFinancialInsights(data);
    assert.equal(insights[0].category, "critical");
    assert.equal(insights[0].priority, 5);
    assert.ok(insights.some((insight) => insight.facts.freeToSpendCents === -12_345));
    assert.ok(insights.some((insight) => insight.facts.overdueCents === 99_000));
    assert.ok(insights.every((insight) => insight.href.startsWith("/") && insight.question.length > 10));
    assert.ok(insights.every((insight, i) => i === 0 || insight.priority <= insights[i - 1].priority));
    assert.equal(JSON.stringify(data), before, "insight não pode modificar fatos financeiros");
    assert.deepEqual(buildFinancialInsights(data), insights, "mesmo contexto produz a mesma fila sem rede");
  });

  it("não trata uma base ausente ou um aumento pequeno como crescimento relevante", () => {
    const data = context();
    data.categoryTrends = [
      { category: "Lazer", competence: "2026-09", currentCents: 30_000, baselineAverageCents: 0, changeCents: 30_000, changePercent: null, baselineMonths: 3 },
      { category: "Mercado", competence: "2026-09", currentCents: 2000, baselineAverageCents: 1000, changeCents: 1000, changePercent: 100, baselineMonths: 3 },
    ];
    assert.equal(buildFinancialInsights(data).length, 0);
  });

  it("oportunidade preserva aporte e margem calculados pelo sistema e exclui o V.A", () => {
    const data = context();
    data.cycle.moneyFreeCents = 80_000;
    data.cycle.benefitFreeCents = 60_000;
    data.savingRecommendation.suggestedCents = 30_000;
    data.savingRecommendation.remainingMarginCents = 50_000;
    data.savingRecommendation.prudentialBufferCents = 20_000;
    const insights = buildFinancialInsights(data);
    assert.equal(insights[0].category, "opportunity");
    assert.equal(insights[0].facts.suggestedCents, 30_000);
    assert.equal(insights[0].facts.remainingMarginCents, 50_000);
    assert.match(insights[0].body, /V\.A fica fora/u);
    assert.ok(financialSuggestions(data, insights).some((question) => question.includes("guardar")));
  });

  it("reconhece melhora significativa apenas com meses completos e base suficiente", () => {
    const data = context();
    data.categoryTrends = [{ category: "Delivery", competence: "2026-09", currentCents: 10_000, baselineAverageCents: 20_000, changeCents: -10_000, changePercent: -50, baselineMonths: 3 }];
    const insights = buildFinancialInsights(data);
    assert.equal(insights[0].category, "insight");
    assert.ok(insights[0].key.startsWith("category-reduction-2026-09"));
    assert.equal(insights[0].facts.changePercent, -50);
    assert.match(insights[0].body, /Confira se todos os gastos foram registrados/u);
    data.categoryTrends[0].baselineMonths = 1;
    assert.equal(buildFinancialInsights(data).length, 0);
    data.categoryTrends[0].baselineMonths = 3;
    data.categoryTrends[0].changeCents = -1000;
    assert.equal(buildFinancialInsights(data).length, 0);
  });

  it("sugestões mudam com os fatos e uma conta vazia não recebe fatos inventados", () => {
    const data = context();
    assert.deepEqual(buildFinancialInsights(data), []);
    assert.equal(financialSuggestions(data, []).length, 1);
    data.installments.remainingCount = 8;
    data.position.realizedCardDebtCents = 50_000;
    const suggestions = financialSuggestions(data, []);
    assert.ok(suggestions.some((question) => question.includes("parcelas")));
    assert.ok(suggestions.some((question) => question.includes("cartões")));
    assert.equal(new Set(suggestions).size, suggestions.length);
    assert.ok(suggestions.length <= 4);
  });
});
