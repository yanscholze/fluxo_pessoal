import { effectiveRecurringDate } from "./brazil-calendar.ts";
import type { FinanceAccount, FinanceCard, FinanceTransaction } from "./finance-types";

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

export function transactionsForInvoiceMonth(items: FinanceTransaction[], month: string) {
  return items.filter((item) => !item.deletedAt && (item.invoiceMonth ?? item.date.slice(0, 7)) === month);
}

export function belongsToCard(item: FinanceTransaction, card: FinanceCard) {
  return item.cardId === card.id || (!item.cardId && item.account === card.linkedAccount);
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
    const purchases = rows.filter((item) => item.type === "expense" && (item.paymentMethod === "credit" || !item.cardId)).reduce((sum, item) => sum + item.amount, 0);
    const paid = rows.filter((item) => item.type === "transfer" && item.source === "invoice-payment").reduce((sum, item) => sum + item.amount, 0);
    return purchases - paid > .005;
  });
  return unpaid ?? activeMonth;
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
  });
  const now = today.toISOString().slice(0, 7); const currentTotals = totals(current); const previousTotals = totals(previous);
  if (!current.length) return `Ainda não há lançamentos em ${month.slice(5, 7)}/${month.slice(0, 4)}. Importe o histórico ou registre o primeiro movimento.`;
  if (month === now) {
    const closing = cards.filter((card) => card.kind === "credit").map((card) => ({ card, distance: card.closingDay - today.getDate() })).filter((item) => item.distance >= 0 && item.distance <= 2).sort((a, b) => a.distance - b.distance)[0];
    if (closing) return closing.distance === 0 ? `A fatura do ${closing.card.name} fecha hoje. Revise as compras.` : `A fatura do ${closing.card.name} fecha em ${closing.distance} dia${closing.distance === 1 ? "" : "s"}.`;
  }
  const currentFree = currentTotals.income - currentTotals.expenses; const previousFree = previousTotals.income - previousTotals.expenses;
  if (previous.length && currentFree > previousFree) return `Você está economizando ${brl.format(currentFree - previousFree)} a mais que no mês anterior.`;
  const nextCommitted = transactionsForCommitmentMonth(transactions, monthOffset(month, 1)).filter((item) => item.type === "expense").reduce((sum, item) => sum + item.amount, 0);
  if (nextCommitted > Math.max(currentFree, 0)) return `O próximo mês já tem ${brl.format(nextCommitted)} comprometidos. Evite antecipar novas compras.`;
  const categories = new Map<string, number>(); const oldCategories = new Map<string, number>();
  current.filter((item) => item.type === "expense").forEach((item) => categories.set(item.category, (categories.get(item.category) ?? 0) + item.amount));
  previous.filter((item) => item.type === "expense").forEach((item) => oldCategories.set(item.category, (oldCategories.get(item.category) ?? 0) + item.amount));
  const increase = [...categories].map(([category, value]) => ({ category, value, previous: oldCategories.get(category) ?? 0 })).filter((item) => item.previous > 0 && item.value > item.previous * 1.15).sort((a, b) => b.value / b.previous - a.value / a.previous)[0];
  if (increase) return `${increase.category} aumentou ${Math.round((increase.value / increase.previous - 1) * 100)}% em relação ao mês anterior.`;
  return `Você tem ${brl.format(currentFree)} livres após os movimentos confirmados deste mês.`;
}
