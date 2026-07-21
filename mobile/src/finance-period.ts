import { effectiveCardDate } from "./brazil-calendar.ts";
import type { FinanceAccount, FinanceCard, FinanceSnapshot, FinanceTransaction } from "./types";

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

export function transactionsForMonth(transactions: FinanceTransaction[], month: string) {
  return transactions.filter((item) => !item.deletedAt && calendarMonthOf(item) === month);
}

export function transactionsForCommitmentMonth(transactions: FinanceTransaction[], month: string) {
  return transactions.filter((item) => !item.deletedAt && financialMonthOf(item) === month);
}

export function transactionsForInvoiceMonth(transactions: FinanceTransaction[], month: string) {
  return transactions.filter((item) => !item.deletedAt && (item.invoiceMonth ?? item.date.slice(0, 7)) === month);
}

export function belongsToCard(item: FinanceTransaction, card: FinanceCard) {
  return item.cardId === card.id || (!item.cardId && item.account === card.linkedAccount);
}

export function activeInvoiceMonth(card: FinanceCard, today: string) {
  const calendarMonth = today.slice(0, 7);
  const closingDate = effectiveCardDate(calendarMonth, card.closingDay, "previous");
  return today > closingDate ? monthOffset(calendarMonth, 1) : calendarMonth;
}

export function invoiceClosingDate(card: FinanceCard, invoiceMonth: string) {
  return effectiveCardDate(invoiceMonth, card.closingDay, "previous");
}

export function invoiceDueDate(card: FinanceCard, invoiceMonth: string) {
  const dueMonth = card.dueDay <= card.closingDay ? monthOffset(invoiceMonth, 1) : invoiceMonth;
  return effectiveCardDate(dueMonth, card.dueDay, card.dueAdjustment ?? "next");
}

export function defaultInvoiceMonthForCard(card: FinanceCard, transactions: FinanceTransaction[], today: string) {
  const activeMonth = activeInvoiceMonth(card, today);
  const cardItems = transactions.filter((item) => !item.deletedAt && item.status !== "planned" && belongsToCard(item, card));
  const months = [...new Set(cardItems.map((item) => item.invoiceMonth ?? item.date.slice(0, 7)))].filter((month) => month < activeMonth).sort();
  const unpaid = months.find((month) => {
    const rows = cardItems.filter((item) => (item.invoiceMonth ?? item.date.slice(0, 7)) === month);
    const purchases = rows.filter((item) => item.type === "expense" && (item.paymentMethod === "credit" || !item.cardId)).reduce((sum, item) => sum + item.amount, 0);
    const paid = rows.filter((item) => item.type === "transfer" && item.source === "invoice-payment").reduce((sum, item) => sum + item.amount, 0);
    return purchases - paid > .005;
  });
  return unpaid ?? activeMonth;
}

export function flowTotals(items: FinanceTransaction[]) {
  const confirmed = items.filter((item) => item.status !== "planned" && item.type !== "transfer");
  const income = confirmed.filter((item) => item.type === "income").reduce((sum, item) => sum + item.amount, 0);
  const expenses = confirmed.filter((item) => item.type === "expense").reduce((sum, item) => sum + item.amount, 0);
  return { income, expenses, free: income - expenses };
}

export function balanceEffect(item: FinanceTransaction) {
  if (item.deletedAt || item.status === "planned" || !["debit", "cash", "transfer"].includes(item.paymentMethod ?? "")) return 0;
  return item.type === "income" ? item.amount : -item.amount;
}

function accountEffect(item: FinanceTransaction, accountName: string) {
  const sourceEffect = item.account === accountName ? balanceEffect(item) : 0;
  const destinationEffect = item.source === "account-transfer" && item.destinationAccount === accountName && !item.deletedAt && item.status !== "planned" ? item.amount : 0;
  return sourceEffect + destinationEffect;
}

export function accountBalanceAtMonth(account: FinanceAccount, transactions: FinanceTransaction[], selectedMonth: string, currentMonth: string) {
  void currentMonth;
  const laterEffect = transactions
    .filter((item) => (item.account === account.name || item.destinationAccount === account.name) && item.date.slice(0, 7) > selectedMonth)
    .reduce((sum, item) => sum + accountEffect(item, account.name), 0);
  return account.balance - laterEffect;
}

export function contextualTip(snapshot: FinanceSnapshot, month: string, today = new Date()) {
  const current = transactionsForMonth(snapshot.transactions, month);
  const previous = transactionsForMonth(snapshot.transactions, monthOffset(month, -1));
  const nowKey = today.toISOString().slice(0, 7);
  const currentTotals = flowTotals(current);
  const previousTotals = flowTotals(previous);
  const invoiceRows = transactionsForInvoiceMonth(snapshot.transactions, month);
  const invoiceGross = invoiceRows.filter((item) => item.type === "expense" && item.paymentMethod === "credit").reduce((sum, item) => sum + item.amount, 0);
  const invoicePaid = invoiceRows.filter((item) => item.type === "transfer" && item.source === "invoice-payment").reduce((sum, item) => sum + item.amount, 0);
  const invoice = Math.max(0, invoiceGross - invoicePaid);
  const nextCommitted = transactionsForCommitmentMonth(snapshot.transactions, monthOffset(month, 1)).filter((item) => item.type === "expense").reduce((sum, item) => sum + item.amount, 0);

  if (!current.length) return `Ainda não há lançamentos em ${month.split("-").reverse().join("/")}. Importe o histórico ou registre o primeiro movimento.`;
  if (month === nowKey) {
    const day = today.getDate();
    const closing = snapshot.cards.filter((card) => card.kind === "credit").map((card) => ({ card, distance: card.closingDay - day })).filter((item) => item.distance >= 0 && item.distance <= 2).sort((a, b) => a.distance - b.distance)[0];
    if (closing) return closing.distance === 0 ? `A fatura do ${closing.card.name} fecha hoje. Revise as compras antes do fechamento.` : `A fatura do ${closing.card.name} fecha em ${closing.distance} dia${closing.distance === 1 ? "" : "s"}.`;
  }
  if (previous.length && currentTotals.free > previousTotals.free) return `Você está economizando ${Math.abs(currentTotals.free - previousTotals.free).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} a mais que no mês anterior.`;
  if (nextCommitted > Math.max(currentTotals.free, 0)) return `O próximo mês já tem ${nextCommitted.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} comprometidos. Evite antecipar novas compras.`;
  const categoryTotals = new Map<string, number>();
  for (const item of current.filter((entry) => entry.type === "expense")) categoryTotals.set(item.category, (categoryTotals.get(item.category) ?? 0) + item.amount);
  const previousCategories = new Map<string, number>();
  for (const item of previous.filter((entry) => entry.type === "expense")) previousCategories.set(item.category, (previousCategories.get(item.category) ?? 0) + item.amount);
  const increase = [...categoryTotals].map(([category, value]) => ({ category, value, previous: previousCategories.get(category) ?? 0 })).filter((item) => item.previous > 0 && item.value > item.previous * 1.15).sort((a, b) => (b.value / b.previous) - (a.value / a.previous))[0];
  if (increase) return `${increase.category} aumentou ${Math.round((increase.value / increase.previous - 1) * 100)}% em relação ao mês anterior.`;
  if (invoice > currentTotals.income && currentTotals.income > 0) return `Sua fatura já supera as entradas confirmadas do mês. Considere adiar novas compras no crédito.`;
  return `Você tem ${currentTotals.free.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} livres após os movimentos confirmados deste mês.`;
}
