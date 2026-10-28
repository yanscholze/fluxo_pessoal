/** Read-only financial context. All arithmetic stays in Fluxo, never in the provider. */
import { liquidAccounts, moneyAccounts } from "../../../core/domain/account/types.ts";
import { dueDateFor } from "../../../core/domain/card/invoice-cycle.ts";
import { CONSUMPTION, invoiceTotals } from "../../../core/domain/ledger/balance.ts";
import type { LedgerEntry } from "../../../core/domain/ledger/types.ts";
import { projectRecurrences } from "../../../core/domain/recurrence/projection.ts";
import { competenceOf, shift } from "../../../core/time/competence.ts";
import { addDays, daysBetween, todayIn } from "../../../core/time/local-date.ts";
import { listAccounts, listCards, listCategories } from "../../repositories/catalog.ts";
import { listInvoices } from "../../repositories/invoices.ts";
import { loadLedger, transactionIndex } from "../../repositories/ledger.ts";
import { confirmedOccurrenceKeys, listRecurrences } from "../../repositories/recurrences.ts";
import { buildDashboard } from "../dashboard.ts";
import { buildGoalsView } from "../goals.ts";
import { buildHealthView } from "../health.ts";
import { buildInstallmentsView } from "../installments.ts";
import { buildReport } from "../reports.ts";
import { buildFinancialInsights, financialSuggestions } from "./insights.ts";
import { withFinancialReadScope } from "../financial-read-scope.ts";

export type FinancialInsight = {
  key: string;
  category: "critical" | "attention" | "insight" | "opportunity" | "reminder";
  /** Greater values require more urgent attention. */
  priority: number;
  title: string;
  body: string;
  href: string;
  question: string;
  facts: Readonly<Record<string, string | number | null>>;
};

export type FinancialEvent = {
  date: string;
  kind: "invoice" | "scheduled";
  direction: "in" | "out";
  amountCents: number;
};

export type SavingRecommendation = {
  suggestedCents: number;
  remainingMarginCents: number;
  moneyMarginCents: number;
  currentMoneyBalanceCents: number;
  liquidityAfterNext7DaysCents: number;
  historicalDailyExpenseCents: number | null;
  prudentialBufferCents: number | null;
  observedCompleteMonths: number;
  daysRemaining: number;
  reason: "negative_margin" | "overdue" | "insufficient_history" | "low_liquidity" | "future_shortfall" | "buffer" | "available";
  method: string;
};

export type FinancialContext = {
  version: 1;
  asOf: string;
  currency: "BRL";
  unit: "cents";
  scope: {
    debt: string;
    actuals: string;
    forecast: string;
    missing: string[];
  };
  cycle: {
    freeToSpendCents: number;
    benefitFreeCents: number;
    moneyFreeCents: number;
    liquidBalanceCents: number;
    pendingIncomeCents: number;
    openInvoicesCents: number;
    otherCommitmentsCents: number;
    windowStart: string;
    windowEnd: string;
  };
  position: { currentBalanceCents: number; investmentsCents: number; netWorthCents: number; realizedCardDebtCents: number };
  month: { competence: string; incomeCents: number; expenseCents: number; netCents: number; savingsRatePercent: number | null };
  history: {
    completeMonths: { competence: string; incomeCents: number; expenseCents: number; netCents: number; hasRecordedActivity: boolean }[];
    averageMonthlyIncomeCents: number | null;
    averageMonthlyExpenseCents: number | null;
    comparison: "completed_months_only";
  };
  categories: { name: string; amountCents: number; percent: number }[];
  categoryTrends: { category: string; competence: string; currentCents: number; baselineAverageCents: number; changeCents: number; changePercent: number | null; baselineMonths: number }[];
  cards: { label: string; limitCents: number; availableLimitCents: number; usedPercent: number | null; openInvoiceCents: number; nextDueDate: string | null }[];
  obligations: {
    overdueCents: number;
    overdueCount: number;
    next7DaysExpenseCents: number;
    next30DaysExpenseCents: number;
    next7DaysIncomeCents: number;
    next30DaysIncomeCents: number;
    events: FinancialEvent[];
    truncated: boolean;
  };
  installments: { activePlans: number; remainingCount: number; remainingCents: number; next7DaysCents: number; next30DaysCents: number; includesAmountsAlreadyInInvoices: true };
  reserve: { currentCents: number; targetCents: number; monthsCovered: number | null; monthlyEssentialCents: number | null; method: string };
  goals: { label: string; targetCents: number; currentCents: number; remainingCents: number; monthlyContributionCents: number; requiredMonthlyCents: number | null; targetDate: string | null; behindSchedule: boolean }[];
  cashflow: { competence: string; inflowCents: number; outflowCents: number; projectedBalanceCents: number }[];
  savingRecommendation: SavingRecommendation;
  simulation?: { monthlyContributionCents: number; months: number; totalContributionsCents: number; remainingCycleMarginCents: number; fitsCurrentMoneyMargin: boolean; assumesNoReturn: true; points: { month: number; accumulatedCents: number }[] };
  relevantTransactions?: { date: string; amountCents: number; kind: string; category: string; origin: "account" | "card" }[];
};

export type FinancialIntelligence = {
  context: FinancialContext;
  insights: FinancialInsight[];
  suggestions: string[];
  fingerprint: string;
};

/** Labels are untrusted user content; never include free-form descriptions or notes. */
export function financialLabel(value: string): string {
  return value
    .replace(/https?:\/\/\S+/giu, "[link omitido]")
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/giu, "[email omitido]")
    .replace(/\b(?:AIza[\w-]{20,}|gh[pousr]_[\w]+|github_pat_[\w]+|sk-[\w-]{12,})\b/gu, "[segredo omitido]")
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/gu, "[documento omitido]")
    .replace(/(?:\+?55[ -]?)?\(?\d{2}\)?[ -]?\d{4,5}[ -]?\d{4}\b/gu, "[telefone omitido]")
    .replace(/[\r\n\t]/gu, " ")
    .slice(0, 64);
}

/** Deterministic prudential suggestion, separate from (and never changing) Livre. */
export function recommendSaving(input: Omit<SavingRecommendation, "suggestedCents" | "remainingMarginCents" | "prudentialBufferCents" | "reason" | "method"> & { overdueCount: number; futureShortfall: boolean }): SavingRecommendation {
  const buffer = input.historicalDailyExpenseCents === null ? null : input.historicalDailyExpenseCents * input.daysRemaining;
  let reason: SavingRecommendation["reason"];
  let suggestedCents = 0;
  if (input.moneyMarginCents <= 0) reason = "negative_margin";
  else if (input.overdueCount > 0) reason = "overdue";
  else if (input.observedCompleteMonths < 2 || buffer === null) reason = "insufficient_history";
  else if (input.futureShortfall) reason = "future_shortfall";
  else {
    const marginAfterBuffer = Math.max(0, input.moneyMarginCents - buffer);
    const liquidity = Math.max(0, Math.min(input.currentMoneyBalanceCents, input.liquidityAfterNext7DaysCents));
    suggestedCents = Math.floor(Math.min(marginAfterBuffer, liquidity));
    reason = suggestedCents > 0 ? "available" : liquidity <= 0 ? "low_liquidity" : "buffer";
  }
  return {
    suggestedCents,
    remainingMarginCents: input.moneyMarginCents - suggestedCents,
    moneyMarginCents: input.moneyMarginCents,
    currentMoneyBalanceCents: input.currentMoneyBalanceCents,
    liquidityAfterNext7DaysCents: input.liquidityAfterNext7DaysCents,
    historicalDailyExpenseCents: input.historicalDailyExpenseCents,
    prudentialBufferCents: buffer,
    observedCompleteMonths: input.observedCompleteMonths,
    daysRemaining: input.daysRemaining,
    reason,
    method: "Margem em dinheiro do ciclo, limitada ao saldo atual e à liquidez após saídas dos próximos 7 dias; colchão prudente pelo gasto diário médio dos últimos 3 meses completos com registros. V.A não é dinheiro para aporte. Compromissos já abatidos do Livre não são somados de novo; o colchão é uma hipótese conservadora de gastos ainda não registrados. Não inclui juros nem garante sobra futura.",
  };
}

/** Only explicit amounts and horizons are simulated; the provider does not calculate. */
export function savingsSimulation(question: string, moneyMarginCents: number, previousQuestions: readonly string[] = []): FinancialContext["simulation"] {
  const normal = question.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/\p{Diacritic}/gu, "");
  const previous = previousQuestions.slice(-3).map((text) => text.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/\p{Diacritic}/gu, "")).reverse();
  const amountPattern = /(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[,.]\d{1,2})?)\s*(?:reais\s*)?(?:por\s+mes|mensais|mensalmente|\/mes)/u;
  const horizonPattern = /(?:daqui\s+a\s+|durante\s+|por\s+|em\s+)?(?<!\d)(\d{1,2})(?!\d)\s+meses/u;
  const priorSimulation = previous.find((text) => /guardar|poupar|reservar|economizar|aportar/u.test(text) && amountPattern.test(text) && horizonPattern.test(text));
  if (!/guardar|poupar|reservar|economizar|aportar/u.test(normal) && !(priorSimulation && /e\s+se|apenas|somente|so\s/u.test(normal))) return undefined;
  const amount = amountPattern.exec(normal) ?? (priorSimulation ? /(?:guardar|poupar|reservar|aportar|e\s+se)(?:\s+(?:eu|guardar|poupar|reservar|aportar|so|somente|apenas))*\s*(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[,.]\d{1,2})?)(?![\d.,]|\s*meses)/u.exec(normal) : null);
  const horizon = horizonPattern.exec(normal) ?? (priorSimulation ? horizonPattern.exec(priorSimulation) : null);
  if (!amount || !horizon) return undefined;
  const value = amount[1].includes(",") ? Number(amount[1].replace(/\./gu, "").replace(",", ".")) : /^\d{1,3}(?:\.\d{3})+$/u.test(amount[1]) ? Number(amount[1].replace(/\./gu, "")) : Number(amount[1]);
  const monthlyContributionCents = Math.round(value * 100);
  const months = Number(horizon[1]);
  if (!Number.isSafeInteger(monthlyContributionCents) || monthlyContributionCents <= 0 || monthlyContributionCents > 100_000_000 || months < 1 || months > 60) return undefined;
  return {
    monthlyContributionCents, months,
    totalContributionsCents: monthlyContributionCents * months,
    remainingCycleMarginCents: moneyMarginCents - monthlyContributionCents,
    fitsCurrentMoneyMargin: monthlyContributionCents <= Math.max(0, moneyMarginCents),
    assumesNoReturn: true,
    points: Array.from({ length: months }, (_, i) => ({ month: i + 1, accumulatedCents: monthlyContributionCents * (i + 1) })),
  };
}

function sumEvents(events: readonly FinancialEvent[], direction: FinancialEvent["direction"], from: string, to: string): number {
  return events.filter((event) => event.direction === direction && event.date >= from && event.date <= to).reduce((total, event) => total + event.amountCents, 0);
}

export async function financialFingerprint(context: FinancialContext): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(context));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function buildFinancialIntelligence(userId: string, now: Date = new Date(), options: { question?: string; previousQuestions?: readonly string[]; skipFingerprint?: boolean } = {}): Promise<FinancialIntelligence> {
  return withFinancialReadScope(async () => {
  const today = todayIn(now);
  const competence = competenceOf(today);
  const [dashboard, health, report, goals, installments, accounts, cards, categories, entries, index, rules, confirmedKeys, storedInvoices] = await Promise.all([
    buildDashboard(userId, now, { financialOnly: true }), buildHealthView(userId, now), buildReport(userId, "6m", now),
    buildGoalsView(userId, now), buildInstallmentsView(userId, now), listAccounts(userId), listCards(userId),
    listCategories(userId), loadLedger(userId), transactionIndex(userId), listRecurrences(userId, true), confirmedOccurrenceKeys(userId), listInvoices(userId),
  ]);
  const liquidIds = new Set(liquidAccounts(accounts).map((account) => account.id));
  const moneyIds = new Set(moneyAccounts(accounts).map((account) => account.id));
  const categoryNames = new Map(categories.map((category) => [category.id, financialLabel(category.name)]));
  const cycleByCard = new Map(cards.map((card) => [card.id, card]));
  const projection = projectRecurrences({ rules, from: shift(competence, -1), to: shift(competence, 2), confirmedKeys, cycleOf: (id) => cycleByCard.get(id) ?? null });
  const allEntries = [...entries, ...projection.entries];
  const events: FinancialEvent[] = [];
  const storedDueDates = new Map(storedInvoices.map((invoice) => [`${invoice.cardId}:${invoice.competence}`, invoice.dueDate]));
  const invoiceEventsByCard = new Map<string, FinancialEvent[]>();
  let moneyOut7 = 0;
  for (const entry of allEntries) {
    if (entry.state !== "planned" || entry.party.kind !== "account" || !liquidIds.has(entry.party.accountId)) continue;
    const event: FinancialEvent = { date: entry.effectiveOn, kind: "scheduled", direction: entry.amount > 0 ? "in" : "out", amountCents: Math.abs(entry.amount) };
    events.push(event);
    if (entry.amount < 0 && moneyIds.has(entry.party.accountId) && entry.effectiveOn <= addDays(today, 7)) moneyOut7 -= entry.amount;
  }
  for (const card of cards.filter((item) => item.kind === "credit")) {
    const rows = allEntries.filter((entry) => entry.party.kind === "card" && entry.party.cardId === card.id);
    for (const month of new Set(rows.map((entry) => entry.competence))) {
      const amount = invoiceTotals(rows, card.id, month, undefined, { includeProjected: true }).outstanding;
      if (amount <= 0) continue;
      // Historical invoice dates are frozen; changing card settings must not move a known due date.
      const date = storedDueDates.get(`${card.id}:${month}`) ?? dueDateFor(card, month);
      const event: FinancialEvent = { date, kind: "invoice", direction: "out", amountCents: amount };
      events.push(event);
      const cardEvents = invoiceEventsByCard.get(card.id) ?? [];
      cardEvents.push(event);
      invoiceEventsByCard.set(card.id, cardEvents);
      if (moneyIds.has(card.paymentAccountId) && date <= addDays(today, 7)) moneyOut7 += amount;
    }
  }
  events.sort((left, right) => left.date.localeCompare(right.date) || left.kind.localeCompare(right.kind) || left.direction.localeCompare(right.direction) || left.amountCents - right.amountCents);
  const relevantEvents = events.filter((event) => (event.direction === "out" && event.date < today) || (event.date >= today && event.date <= addDays(today, 30)));
  const overdue = events.filter((event) => event.direction === "out" && event.date < today);
  const recordedMonths = new Set(entries.filter((entry) => entry.state === "confirmed" && CONSUMPTION.includes(entry.kind) && (entry.party.kind === "card" || liquidIds.has(entry.party.accountId))).map((entry) => entry.competence));
  const completeMonths = report.monthly.filter((month) => month.competence < competence).map((month) => ({ competence: month.competence, incomeCents: month.incomeCents, expenseCents: month.expenseCents, netCents: month.netCents, hasRecordedActivity: recordedMonths.has(month.competence) }));
  const observed = completeMonths.filter((month) => month.hasRecordedActivity).slice(-3);
  const observedDays = observed.reduce((total, month) => { const [year, monthNumber] = month.competence.split("-").map(Number); return total + new Date(Date.UTC(year, monthNumber, 0)).getUTCDate(); }, 0);
  const average = (key: "incomeCents" | "expenseCents") => observed.length ? Math.round(observed.reduce((total, month) => total + month[key], 0) / observed.length) : null;
  const benefitFreeCents = dashboard.benefitFreeToSpend?.amountCents ?? 0;
  const moneyFreeCents = dashboard.freeToSpend.amountCents - benefitFreeCents;
  const currentMoneyBalanceCents = dashboard.freeToSpend.liquidBalanceCents - (dashboard.benefitFreeToSpend?.liquidBalanceCents ?? 0);
  const monthly = report.monthly.find((month) => month.competence === competence)!;
  const activeGoals = goals.goals.filter((goal) => !goal.isAchieved);
  const openInstallments = installments.active.flatMap((plan) => plan.entries.filter((entry) => entry.status !== "paid"));
  const context: FinancialContext = {
    version: 1, asOf: today, currency: "BRL", unit: "cents",
    scope: {
      debt: "Dívida realizada de cartões considerada no patrimônio, respeitando categorias excluídas. Faturas brutas incluem obrigações com o emissor; parcelas restantes são compromissos e já podem estar nas faturas: NÃO somar esses totais. Não há cadastro geral de empréstimos externos.",
      actuals: "Movimentações confirmadas de contas líquidas BRL e cartões; competência contábil. Pagamentos de fatura e transferências não são consumo. Categorias excluídas do Livre continuam podendo aparecer nos relatórios de consumo.",
      forecast: "Livre usa o ciclo do cartão principal e as regras existentes, incluindo V.A; fluxo futuro é previsão pelos registros e recorrências, sem garantia. Ausência de registro não prova ausência de despesa.",
      missing: ["Dívidas externas não cadastradas", "Juros ou descontos negociados não registrados", "Despesas futuras ainda não cadastradas", ...(observed.length < 2 ? ["Histórico de pelo menos 2 meses completos com registros"] : [])],
    },
    cycle: { freeToSpendCents: dashboard.freeToSpend.amountCents, benefitFreeCents, moneyFreeCents, liquidBalanceCents: dashboard.freeToSpend.liquidBalanceCents, pendingIncomeCents: dashboard.freeToSpend.pendingIncomeCents, openInvoicesCents: dashboard.freeToSpend.openInvoicesCents, otherCommitmentsCents: dashboard.freeToSpend.otherCommitmentsCents, windowStart: dashboard.freeToSpend.windowStart, windowEnd: dashboard.freeToSpend.windowEnd },
    position: { currentBalanceCents: dashboard.position.currentBalanceCents, investmentsCents: dashboard.position.investmentsCents, netWorthCents: dashboard.position.netWorthCents, realizedCardDebtCents: dashboard.position.cardDebtCents },
    month: { competence, incomeCents: monthly.incomeCents, expenseCents: monthly.expenseCents, netCents: monthly.netCents, savingsRatePercent: monthly.incomeCents > 0 ? Math.round(monthly.netCents / monthly.incomeCents * 1000) / 10 : null },
    history: { completeMonths, averageMonthlyIncomeCents: average("incomeCents"), averageMonthlyExpenseCents: average("expenseCents"), comparison: "completed_months_only" },
    categories: dashboard.categorySpend.map((category) => ({ name: financialLabel(category.name), amountCents: category.amountCents, percent: Math.round(category.percent * 10) / 10 })),
    categoryTrends: categoryTrends(entries, index, categoryNames, liquidIds, competence),
    cards: dashboard.cards.filter((card) => card.kind === "credit").map((card, i) => ({ label: `Cartão ${i + 1}`, limitCents: card.limitCents, availableLimitCents: card.availableLimitCents, usedPercent: card.limitCents > 0 ? Math.round((card.limitCents - card.availableLimitCents) / card.limitCents * 1000) / 10 : null, openInvoiceCents: [...card.overdueInvoices, ...(card.currentInvoice ? [card.currentInvoice] : [])].reduce((total, invoice) => total + invoice.outstandingCents, 0), nextDueDate: (invoiceEventsByCard.get(card.id) ?? []).filter((invoice) => invoice.date >= today).sort((left, right) => left.date.localeCompare(right.date)).at(0)?.date ?? null })),
    obligations: { overdueCents: overdue.reduce((total, event) => total + event.amountCents, 0), overdueCount: overdue.length, next7DaysExpenseCents: sumEvents(events, "out", today, addDays(today, 7)), next30DaysExpenseCents: sumEvents(events, "out", today, addDays(today, 30)), next7DaysIncomeCents: sumEvents(events, "in", today, addDays(today, 7)), next30DaysIncomeCents: sumEvents(events, "in", today, addDays(today, 30)), events: relevantEvents.slice(0, 12), truncated: relevantEvents.length > 12 },
    installments: { activePlans: installments.active.length, remainingCount: openInstallments.length, remainingCents: installments.totals.openCents, next7DaysCents: openInstallments.filter((entry) => entry.dueDate >= today && entry.dueDate <= addDays(today, 7)).reduce((total, entry) => total + entry.amountCents, 0), next30DaysCents: openInstallments.filter((entry) => entry.dueDate >= today && entry.dueDate <= addDays(today, 30)).reduce((total, entry) => total + entry.amountCents, 0), includesAmountsAlreadyInInvoices: true },
    reserve: { currentCents: health.reserve.currentCents, targetCents: health.reserve.targetCents, monthsCovered: health.reserve.monthlyEssentialCents > 0 ? Math.round(health.reserve.monthsCovered * 10) / 10 : null, monthlyEssentialCents: health.reserve.monthlyEssentialCents || null, method: "Investimento/poupança BRL incluídos nos totais. Meta e cobertura usam média das categorias essenciais na janela fixa de 6 meses do módulo de saúde; sem base essencial a cobertura é indisponível." },
    goals: activeGoals.slice(0, 8).map((goal, i) => ({ label: `Meta ${i + 1}`, targetCents: goal.target, currentCents: goal.current, remainingCents: goal.remaining, monthlyContributionCents: goal.monthlyContribution, requiredMonthlyCents: goal.requiredMonthly, targetDate: goal.targetDate, behindSchedule: goal.behindSchedule })),
    cashflow: dashboard.cashflow.map((point) => ({ ...point })),
    savingRecommendation: recommendSaving({ moneyMarginCents: moneyFreeCents, currentMoneyBalanceCents, liquidityAfterNext7DaysCents: currentMoneyBalanceCents - moneyOut7, historicalDailyExpenseCents: observedDays > 0 ? Math.ceil(observed.reduce((total, month) => total + month.expenseCents, 0) / observedDays) : null, observedCompleteMonths: observed.length, daysRemaining: Math.max(0, daysBetween(today, dashboard.freeToSpend.windowEnd)), overdueCount: overdue.length, futureShortfall: dashboard.cashflow.slice(0, 2).some((point) => point.projectedBalanceCents < 0) }),
  };
  const simulation = savingsSimulation(options.question ?? "", moneyFreeCents, options.previousQuestions);
  if (simulation) context.simulation = simulation;
  const question = options.question ?? "";
  if (/quais?\s+(?:lancamentos|lançamentos|compras|despesas)|detalh|maiores?\s+(?:gastos|compras|despesas)|transa[cç][aã]o|transa[cç][oõ]es|quais\s+dados|contribu|mudan[çc]a/iu.test(question)) {
    const matched = categories.filter((category) => question.toLocaleLowerCase("pt-BR").includes(category.name.toLocaleLowerCase("pt-BR")));
    const selectedCategories = new Set(matched.map((category) => category.id));
    const detailCompetence = /(?:[uú]ltimo|[uú]ltima)\s+m[eê]s\s+fechado|m[eê]s\s+(?:passado|anterior)/iu.test(question) ? shift(competence, -1) : competence;
    const detailKind = /gastos?|compras?|despesas?/iu.test(question) ? "expense" : /entradas?|receitas?/iu.test(question) ? "income" : null;
    context.relevantTransactions = entries
      .filter((entry) => entry.state === "confirmed" && entry.effectiveOn <= today && entry.competence === detailCompetence && CONSUMPTION.includes(entry.kind) && (detailKind === null || entry.kind === detailKind) && (entry.party.kind === "card" || liquidIds.has(entry.party.accountId)) && (selectedCategories.size === 0 || selectedCategories.has(index.get(entry.transactionId)?.categoryId ?? "")))
      .sort((left, right) => Math.abs(right.amount) - Math.abs(left.amount) || left.effectiveOn.localeCompare(right.effectiveOn))
      .slice(0, 10)
      .map((entry) => ({ date: entry.effectiveOn, amountCents: Math.abs(entry.amount), kind: entry.kind, category: categoryNames.get(index.get(entry.transactionId)?.categoryId ?? "") ?? "Sem categoria", origin: entry.party.kind }));
  }
  const insights = buildFinancialInsights(context);
  return { context, insights, suggestions: financialSuggestions(context, insights), fingerprint: options.skipFingerprint ? "" : await financialFingerprint(context) };
  });
}

function categoryTrends(entries: readonly LedgerEntry[], index: Awaited<ReturnType<typeof transactionIndex>>, names: ReadonlyMap<string, string>, liquidIds: ReadonlySet<string>, competence: ReturnType<typeof competenceOf>): FinancialContext["categoryTrends"] {
  const comparisonMonth = shift(competence, -1);
  const baseline = [-4, -3, -2].map((offset) => shift(competence, offset));
  const monthsWithActivity = new Set(entries.filter((entry) => entry.state === "confirmed" && CONSUMPTION.includes(entry.kind) && (entry.party.kind === "card" || liquidIds.has(entry.party.accountId))).map((entry) => entry.competence));
  const observedBaseline = baseline.filter((month) => monthsWithActivity.has(month));
  if (!observedBaseline.length || !monthsWithActivity.has(comparisonMonth)) return [];
  const byCategory = new Map<string, { current: number; prior: number }>();
  for (const entry of entries) {
    if (entry.state !== "confirmed" || entry.kind !== "expense" || entry.amount >= 0 || entry.party.kind === "account" && !liquidIds.has(entry.party.accountId)) continue;
    if (entry.competence !== comparisonMonth && !observedBaseline.includes(entry.competence)) continue;
    const id = index.get(entry.transactionId)?.categoryId ?? "";
    const totals = byCategory.get(id) ?? { current: 0, prior: 0 };
    if (entry.competence === comparisonMonth) totals.current -= entry.amount;
    else totals.prior -= entry.amount;
    byCategory.set(id, totals);
  }
  return [...byCategory].map(([id, totals]) => {
    const average = Math.round(totals.prior / observedBaseline.length);
    return { category: names.get(id) ?? "Sem categoria", competence: comparisonMonth, currentCents: totals.current, baselineAverageCents: average, changeCents: totals.current - average, changePercent: average > 0 ? Math.round((totals.current - average) / average * 1000) / 10 : null, baselineMonths: observedBaseline.length };
  }).sort((left, right) => Math.abs(right.changeCents) - Math.abs(left.changeCents) || left.category.localeCompare(right.category)).slice(0, 8);
}
