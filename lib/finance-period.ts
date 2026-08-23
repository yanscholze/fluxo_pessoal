import { effectiveRecurringDate } from "./brazil-calendar.ts";
import type { FinanceAccount, FinanceCard, FinanceSalaryRule, FinanceTransaction } from "./finance-types";

const FREE_TO_SPEND_EXCLUDED_CATEGORIES = new Set([
  "emprestimo de cartao",
  "emprestimo do cartao",
]);

function normalizedLabel(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
}

export function isExcludedFromFreeToSpend(item: Pick<FinanceTransaction, "category">) {
  return FREE_TO_SPEND_EXCLUDED_CATEGORIES.has(normalizedLabel(item.category));
}

export function isSalaryReceived(rule: FinanceSalaryRule | null, items: FinanceTransaction[], month: string) {
  if (!rule) return true;
  if (rule.lastConfirmedMonth === month) return true;
  const fingerprint = `recurring:${rule.id}:${month}`;
  return items.some((item) => !item.deletedAt && item.status !== "planned" && item.type === "income" && (
    item.fingerprint === fingerprint
    || (normalizedLabel(item.category) === normalizedLabel(rule.category) && normalizedLabel(item.description) === normalizedLabel(rule.description))
  ));
}

export function salaryForecastAmount(rule: FinanceSalaryRule | null, items: FinanceTransaction[], month: string) {
  if (!rule?.active || (rule.effectiveDate && rule.effectiveDate.slice(0, 7) > month) || isSalaryReceived(rule, items, month)) return 0;
  return rule.projectedAmount ?? rule.amount;
}

export function monthOffset(month: string, offset: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function financialMonthOf(item: FinanceTransaction) {
  return item.paymentMethod === "credit" ? item.invoiceMonth ?? item.date.slice(0, 7) : item.date.slice(0, 7);
}

export function calendarMonthOf(item: FinanceTransaction) {
  return item.date.slice(0, 7);
}

export function transactionsForMonth(items: FinanceTransaction[], month: string) {
  return items.filter((item) => !item.deletedAt && calendarMonthOf(item) === month);
}

export function transactionsForCommitmentMonth(items: FinanceTransaction[], month: string) {
  return items.filter((item) => !item.deletedAt && financialMonthOf(item) === month);
}

export function committedExpensesTotal(items: FinanceTransaction[], month: string) {
  return transactionsForCommitmentMonth(items, month)
    .filter((item) => item.type === "expense" && !isExcludedFromFreeToSpend(item))
    .reduce((sum, item) => sum + item.amount, 0);
}

export function transactionsForInvoiceMonth(items: FinanceTransaction[], month: string) {
  return items.filter((item) => !item.deletedAt && (item.invoiceMonth ?? item.date.slice(0, 7)) === month);
}

export function belongsToCard(item: FinanceTransaction, card: FinanceCard) {
  return item.cardId === card.id || (!item.cardId && item.account === card.linkedAccount);
}

export function isInvoicePayment(item: FinanceTransaction) {
  return item.source === "invoice-payment"
    || item.id.startsWith("invoice-payment:")
    || Boolean(item.fingerprint?.startsWith("invoice-payment:"));
}

export function activeInvoiceMonth(card: FinanceCard, today: string) {
  const calendarMonth = today.slice(0, 7);
  const closingDate = effectiveRecurringDate(calendarMonth, card.closingDay, "day-of-month", "previous");
  return today > closingDate ? monthOffset(calendarMonth, 1) : calendarMonth;
}

export function invoiceClosingDate(card: FinanceCard, invoiceMonth: string) {
  return effectiveRecurringDate(invoiceMonth, card.closingDay, "day-of-month", "previous");
}

export function invoiceDueDate(card: FinanceCard, invoiceMonth: string) {
  const dueMonth = card.dueDay <= card.closingDay ? monthOffset(invoiceMonth, 1) : invoiceMonth;
  return effectiveRecurringDate(dueMonth, card.dueDay, "day-of-month", card.dueAdjustment ?? "next");
}

export function defaultInvoiceMonthForCard(card: FinanceCard, items: FinanceTransaction[], today: string) {
  const activeMonth = activeInvoiceMonth(card, today);
  const cardItems = items.filter((item) => !item.deletedAt && item.status !== "planned" && belongsToCard(item, card));
  const months = [...new Set(cardItems.map((item) => item.invoiceMonth ?? item.date.slice(0, 7)))].filter((month) => month < activeMonth).sort();
  const unpaid = months.find((month) => {
    const rows = cardItems.filter((item) => (item.invoiceMonth ?? item.date.slice(0, 7)) === month);
    const purchases = rows.filter((item) => !isInvoicePayment(item) && item.type === "expense" && (item.paymentMethod === "credit" || !item.cardId)).reduce((sum, item) => sum + item.amount, 0);
    const paid = rows.filter(isInvoicePayment).reduce((sum, item) => sum + Math.abs(item.amount), 0);
    return purchases - paid > .005;
  });
  return unpaid ?? activeMonth;
}

export function cardLimitUsage(items: FinanceTransaction[], card: FinanceCard, fromInvoiceMonth: string) {
  if (card.kind !== "credit") return 0;
  const invoices = new Map<string, number>();
  items.filter((item) => !item.deletedAt && item.status !== "planned" && belongsToCard(item, card)).forEach((item) => {
    const month = item.invoiceMonth ?? item.date.slice(0, 7);
    if (month < fromInvoiceMonth) return;
    const current = invoices.get(month) ?? 0;
    if (isInvoicePayment(item)) invoices.set(month, current - Math.abs(item.amount));
    else if (item.type === "expense" && (item.paymentMethod === "credit" || item.cardId === card.id)) invoices.set(month, current + item.amount);
  });
  return [...invoices.values()].reduce((sum, amount) => sum + Math.max(0, amount), 0);
}

export function currentInvoiceTotals(items: FinanceTransaction[], cards: FinanceCard[], today: string) {
  const purchases: FinanceTransaction[] = [];
  let gross = 0;
  let paid = 0;
  for (const card of cards.filter((item) => item.kind === "credit")) {
    const invoiceMonth = activeInvoiceMonth(card, today);
    const rows = items.filter((item) => !item.deletedAt && item.status !== "planned" && belongsToCard(item, card) && (item.invoiceMonth ?? item.date.slice(0, 7)) === invoiceMonth);
    const cardPurchases = rows.filter((item) => !isInvoicePayment(item) && item.type === "expense" && (item.paymentMethod === "credit" || item.cardId === card.id));
    const cardPayments = rows.filter((item) => isInvoicePayment(item) && item.cardId === card.id);
    purchases.push(...cardPurchases);
    gross += cardPurchases.reduce((sum, item) => sum + item.amount, 0);
    paid += cardPayments.reduce((sum, item) => sum + Math.abs(item.amount), 0);
  }
  return { purchases, gross, paid, total: Math.max(0, gross - paid) };
}

/**
 * "Livre para gastar" de verdade: parte do saldo REAL das contas (não da
 * soma de lançamentos do mês, que ignora o que já estava na conta antes e
 * ignora a fatura do cartão ainda não paga). Fórmula:
 *
 *   saldo líquido atual
 *   + recebimentos programados no mês (ainda não recebidos)
 *   − fatura em aberto do(s) cartão(ões)
 *   − outros compromissos do mês ainda não pagos (contas fixas, recorrências)
 *
 * "Saldo líquido" soma só contas de uso corrente (conta, dinheiro, benefício)
 * — investimento fica de fora porque não é dinheiro pensado pra gastar.
 */
function addDaysIso(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
}

/**
 * Janela do ciclo de fatura "ativo" em `today`: do dia seguinte ao último
 * fechamento até o próximo fechamento (ex.: fecha dia 13 -> ciclo vai de
 * 14 de um mês até 13 do mês seguinte). Uma compra feita dia 14 já pertence
 * ao PRÓXIMO ciclo, mesmo que o mês civil ainda seja o mesmo.
 */
export function invoiceCycleWindow(closingDay: number, today: string) {
  const calendarMonth = today.slice(0, 7);
  const closingThisMonth = effectiveRecurringDate(calendarMonth, closingDay, "day-of-month", "previous");
  if (today <= closingThisMonth) {
    const closingPrevMonth = effectiveRecurringDate(monthOffset(calendarMonth, -1), closingDay, "day-of-month", "previous");
    return { start: addDaysIso(closingPrevMonth, 1), end: closingThisMonth };
  }
  const closingNextMonth = effectiveRecurringDate(monthOffset(calendarMonth, 1), closingDay, "day-of-month", "previous");
  return { start: addDaysIso(closingThisMonth, 1), end: closingNextMonth };
}

/**
 * "Livre para gastar" de verdade: parte do saldo REAL das contas (não da
 * soma de lançamentos do mês, que ignora o que já estava na conta antes e
 * ignora a fatura do cartão ainda não paga). Fórmula:
 *
 *   saldo líquido atual
 *   + recebimentos programados no ciclo atual (ainda não recebidos)
 *   − fatura em aberto do(s) cartão(ões)
 *   − outros compromissos do ciclo atual ainda não pagos
 *
 * "Ciclo atual" = janela entre fechamentos de fatura (ex. dia 14 a dia 13),
 * não o mês civil — porque um gasto no crédito só "conta" no fechamento,
 * então tudo que sobra de renda depois do fechamento já pertence à
 * fatura seguinte, mesmo dentro do mesmo mês civil.
 * "Saldo líquido" soma só contas de uso corrente (conta, dinheiro,
 * benefício) e ignora contas marcadas como "não somar nos totais"
 * (ex.: uma conta usada só para anotar valores futuros de fatura).
 */
export function freeToSpendProjection(accounts: FinanceAccount[], transactions: FinanceTransaction[], cards: FinanceCard[], today: string) {
  const liquidBalance = accounts
    .filter((account) => ["checking", "cash", "benefit"].includes(account.kind) && (account.currency === "BRL" || !account.currency) && !account.excludeFromTotals)
    .reduce((sum, account) => sum + account.balance, 0);

  const referenceCard = cards.find((card) => card.favorite) ?? cards[0];
  const cycle = invoiceCycleWindow(referenceCard?.closingDay ?? 1, today);
  const cycleItems = transactions.filter((item) => !item.deletedAt && item.date >= cycle.start && item.date <= cycle.end);

  const pendingIncome = cycleItems
    .filter((item) => item.type === "income" && item.status === "planned")
    .reduce((sum, item) => sum + item.amount, 0);
  const otherCommitments = cycleItems
    .filter((item) => item.type === "expense" && item.status === "planned" && item.paymentMethod !== "credit" && !isExcludedFromFreeToSpend(item))
    .reduce((sum, item) => sum + item.amount, 0);

  const invoice = currentInvoiceTotals(transactions, cards, today);

  return {
    liquidBalance, pendingIncome, upcomingInvoice: invoice.total, otherCommitments, cycleStart: cycle.start, cycleEnd: cycle.end,
    free: liquidBalance + pendingIncome - invoice.total - otherCommitments,
  };
}

function balanceEffect(item: FinanceTransaction) {
  if (item.deletedAt || item.status === "planned" || !["debit", "cash", "transfer"].includes(item.paymentMethod ?? "")) return 0;
  return item.type === "income" ? item.amount : -item.amount;
}

function accountEffect(item: FinanceTransaction, accountName: string) {
  const sourceEffect = item.account === accountName ? balanceEffect(item) : 0;
  const destinationEffect = item.source === "account-transfer" && item.destinationAccount === accountName && !item.deletedAt && item.status !== "planned" ? item.amount : 0;
  return sourceEffect + destinationEffect;
}

export function accountBalanceAtMonth(account: FinanceAccount, transactions: FinanceTransaction[], selectedMonth: string, currentMonth = new Date().toISOString().slice(0, 7)) {
  void currentMonth;
  const laterEffect = transactions.filter((item) => (item.account === account.name || item.destinationAccount === account.name) && item.date.slice(0, 7) > selectedMonth).reduce((sum, item) => sum + accountEffect(item, account.name), 0);
  return account.balance - laterEffect;
}

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export function contextualFinancialTip(transactions: FinanceTransaction[], month: string, cards: FinanceCard[], today = new Date()) {
  const current = transactionsForMonth(transactions, month); const previous = transactionsForMonth(transactions, monthOffset(month, -1));
  const totals = (items: FinanceTransaction[]) => ({
    income: items.filter((item) => item.type === "income").reduce((sum, item) => sum + item.amount, 0),
    expenses: items.filter((item) => item.type === "expense").reduce((sum, item) => sum + item.amount, 0),
    freeToSpendExpenses: items.filter((item) => item.type === "expense" && !isExcludedFromFreeToSpend(item)).reduce((sum, item) => sum + item.amount, 0),
  });
  const now = today.toISOString().slice(0, 7); const currentTotals = totals(current); const previousTotals = totals(previous);
  if (!current.length) return `Ainda não há lançamentos em ${month.slice(5, 7)}/${month.slice(0, 4)}. Importe o histórico ou registre o primeiro movimento.`;
  if (month === now) {
    const closing = cards.filter((card) => card.kind === "credit").map((card) => ({ card, distance: card.closingDay - today.getDate() })).filter((item) => item.distance >= 0 && item.distance <= 2).sort((a, b) => a.distance - b.distance)[0];
    if (closing) return closing.distance === 0 ? `A fatura do ${closing.card.name} fecha hoje. Revise as compras.` : `A fatura do ${closing.card.name} fecha em ${closing.distance} dia${closing.distance === 1 ? "" : "s"}.`;
  }
  const currentFree = currentTotals.income - currentTotals.freeToSpendExpenses; const previousFree = previousTotals.income - previousTotals.freeToSpendExpenses;
  if (previous.length && currentFree > previousFree) return `Você está economizando ${brl.format(currentFree - previousFree)} a mais que no mês anterior.`;
  const nextCommitted = committedExpensesTotal(transactions, monthOffset(month, 1));
  if (nextCommitted > Math.max(currentFree, 0)) return `O próximo mês já tem ${brl.format(nextCommitted)} comprometidos. Evite antecipar novas compras.`;
  const categories = new Map<string, number>(); const oldCategories = new Map<string, number>();
  current.filter((item) => item.type === "expense").forEach((item) => categories.set(item.category, (categories.get(item.category) ?? 0) + item.amount));
  previous.filter((item) => item.type === "expense").forEach((item) => oldCategories.set(item.category, (oldCategories.get(item.category) ?? 0) + item.amount));
  const increase = [...categories].map(([category, value]) => ({ category, value, previous: oldCategories.get(category) ?? 0 })).filter((item) => item.previous > 0 && item.value > item.previous * 1.15).sort((a, b) => b.value / b.previous - a.value / a.previous)[0];
  if (increase) return `${increase.category} aumentou ${Math.round((increase.value / increase.previous - 1) * 100)}% em relação ao mês anterior.`;
  return `Você tem ${brl.format(currentFree)} livres após os movimentos confirmados deste mês.`;
}
