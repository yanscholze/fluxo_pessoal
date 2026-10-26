import type { FinancialContext, FinancialInsight } from "./financial-context.ts";

const money = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** A short, deterministic attention queue. Gemini is never required for an event. */
export function buildFinancialInsights(context: FinancialContext): FinancialInsight[] {
  const insights: FinancialInsight[] = [];
  const month = context.month.competence;
  if (context.cycle.freeToSpendCents < 0) insights.push({
    key: `free-negative-${context.cycle.windowStart}`, category: "critical", priority: 5,
    title: "Os compromissos ultrapassam a margem do ciclo",
    body: `Faltam ${money(-context.cycle.freeToSpendCents)} para cobrir as previsões já consideradas no Livre para gastar.`,
    href: "/planejamento", question: "O que está deixando meu Livre para gastar negativo e quais compromissos merecem prioridade?",
    facts: { freeToSpendCents: context.cycle.freeToSpendCents, windowEnd: context.cycle.windowEnd },
  });
  if (context.obligations.overdueCount > 0) insights.push({
    key: `overdue-${month}`, category: "critical", priority: 5,
    title: "Há vencimentos pendentes de baixa",
    body: `${money(context.obligations.overdueCents)} em ${context.obligations.overdueCount} obrigação(ões) com data anterior a hoje. Confira se já foram pagas antes de lançar novamente.`,
    href: "/planejamento", question: "Quais compromissos estão com vencimento passado e como posso conferir as baixas sem duplicar lançamentos?",
    facts: { overdueCents: context.obligations.overdueCents, count: context.obligations.overdueCount },
  });
  if (context.obligations.next7DaysExpenseCents > 0) insights.push({
    key: `due-week-${month}`, category: context.obligations.next7DaysExpenseCents > context.position.currentBalanceCents ? "attention" : "reminder", priority: context.obligations.next7DaysExpenseCents > context.position.currentBalanceCents ? 4 : 2,
    title: "Confira o caixa para os próximos 7 dias",
    body: `${money(context.obligations.next7DaysExpenseCents)} em faturas e saídas previstas; ${money(context.obligations.next7DaysIncomeCents)} em entradas previstas no período. As parcelas já incluídas nas faturas não são somadas novamente.`,
    href: "/planejamento", question: "Como os vencimentos dos próximos 7 dias afetam meu caixa e meu Livre para gastar?",
    facts: { expenseCents: context.obligations.next7DaysExpenseCents, incomeCents: context.obligations.next7DaysIncomeCents },
  });
  const changed = context.categoryTrends.find((trend) => trend.baselineMonths >= 2 && trend.changePercent !== null && trend.changePercent >= 25 && trend.changeCents >= 5_000);
  if (changed) insights.push({
    key: `category-growth-${changed.competence}-${encodeURIComponent(changed.category)}`, category: "insight", priority: 3,
    title: `${changed.category} cresceu no último mês fechado`,
    body: `${money(changed.currentCents)} em ${changed.competence}: ${changed.changePercent}% acima da média de ${money(changed.baselineAverageCents)} dos ${changed.baselineMonths} meses completos comparáveis anteriores.`,
    href: "/relatorios", question: `Explique a mudança dos gastos em ${changed.category} no último mês fechado, comparando com a média anterior.`,
    facts: { category: changed.category, currentCents: changed.currentCents, baselineCents: changed.baselineAverageCents, changePercent: changed.changePercent, competence: changed.competence },
  });
  const reduced = context.categoryTrends.find((trend) => trend.baselineMonths >= 2 && trend.changePercent !== null && trend.changePercent <= -25 && trend.changeCents <= -5_000);
  if (reduced) insights.push({
    key: `category-reduction-${reduced.competence}-${encodeURIComponent(reduced.category)}`, category: "insight", priority: 2,
    title: `${reduced.category} teve redução nos gastos registrados`,
    body: `${money(reduced.currentCents)} em ${reduced.competence}: ${Math.abs(reduced.changePercent!)}% abaixo da média de ${money(reduced.baselineAverageCents)} dos ${reduced.baselineMonths} meses completos comparáveis anteriores. Confira se todos os gastos foram registrados antes de considerar a diferença uma economia disponível.`,
    href: "/relatorios", question: `O que explica a redução dos gastos em ${reduced.category} no último mês fechado e como manter essa melhora?`,
    facts: { category: reduced.category, currentCents: reduced.currentCents, baselineCents: reduced.baselineAverageCents, changePercent: reduced.changePercent, competence: reduced.competence },
  });
  const saving = context.savingRecommendation;
  if (saving.suggestedCents > 0) insights.push({
    key: `saving-opportunity-${context.cycle.windowStart}`, category: "opportunity", priority: 2,
    title: "Há margem prudente para uma reserva",
    body: `A estimativa conservadora é separar até ${money(saving.suggestedCents)}, mantendo ${money(saving.remainingMarginCents)} de margem em dinheiro no ciclo. O V.A fica fora desse aporte.`,
    href: "/assistente", question: "Quanto posso guardar neste ciclo e quais premissas sustentam essa sugestão?",
    facts: { suggestedCents: saving.suggestedCents, remainingMarginCents: saving.remainingMarginCents, prudentialBufferCents: saving.prudentialBufferCents },
  });
  const risk = context.cashflow.slice(0, 2).find((point) => point.projectedBalanceCents < 0);
  if (risk && context.cycle.freeToSpendCents >= 0) insights.push({
    key: `future-shortfall-${risk.competence}`, category: "attention", priority: 4,
    title: "O fluxo projetado pede atenção",
    body: `Os registros atuais projetam ${money(risk.projectedBalanceCents)} no fim de ${risk.competence}. Isso é uma previsão de caixa, diferente do Livre para gastar do ciclo.`,
    href: "/planejamento", question: "Por que o fluxo projetado fica negativo e o que já está previsto para esse período?",
    facts: { competence: risk.competence, projectedBalanceCents: risk.projectedBalanceCents },
  });
  if (!insights.length && context.categories.length) {
    const largest = context.categories[0];
    insights.push({
      key: `largest-category-${month}`, category: "insight", priority: 1,
      title: `${largest.name} concentra o maior gasto registrado`,
      body: `${money(largest.amountCents)} de consumo registrado na competência atual (${largest.percent}%).`,
      href: "/relatorios", question: `Como posso entender melhor meus gastos em ${largest.name}?`,
      facts: { category: largest.name, amountCents: largest.amountCents, percent: largest.percent },
    });
  }
  return insights.sort((left, right) => right.priority - left.priority || left.key.localeCompare(right.key)).slice(0, 5);
}

export function financialSuggestions(context: FinancialContext, insights: readonly FinancialInsight[]): string[] {
  const suggestions = insights.slice(0, 2).map((insight) => insight.question);
  if (context.installments.remainingCount > 0) suggestions.push("Como estão minhas parcelas restantes e quais vencem primeiro?");
  if (context.savingRecommendation.suggestedCents > 0 || context.cycle.moneyFreeCents > 0) suggestions.push("Quanto posso guardar neste ciclo sem usar meu V.A?");
  if (context.position.realizedCardDebtCents > 0) suggestions.push("Quanto devo nos cartões e quanto ainda é compromisso futuro?");
  if (context.reserve.monthlyEssentialCents !== null) suggestions.push("Quantos meses de gastos essenciais minha reserva cobre?");
  suggestions.push("Me dê um resumo financeiro deste mês usando meus dados registrados.");
  return [...new Set(suggestions)].slice(0, 4);
}
