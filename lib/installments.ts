import type { FinanceCard, FinanceTransaction } from "./finance-types";
import { activeInvoiceMonth, belongsToCard, isInvoicePayment } from "./finance-period.ts";

export function installmentParts(value?: string) {
  const match = value?.trim().match(/^(\d{1,2})\/(\d{1,2})$/);
  if (!match) return null;
  const current = Number(match[1]);
  const total = Number(match[2]);
  if (!Number.isInteger(current) || !Number.isInteger(total) || current < 1 || total < 2 || current > total || total > 48) return null;
  return { current, total };
}

export function inferredInstallmentGroupId(item: FinanceTransaction) {
  if (item.installmentGroupId?.trim()) return item.installmentGroupId.trim();
  const parts = installmentParts(item.installments);
  if (!parts) return undefined;
  const suffix = new RegExp(`-${parts.current}$`);
  return suffix.test(item.id) ? item.id.replace(suffix, "") : undefined;
}

export function installmentFamily(items: FinanceTransaction[], selected: FinanceTransaction) {
  const parts = installmentParts(selected.installments);
  if (!parts) return [selected];
  const groupId = inferredInstallmentGroupId(selected);
  if (groupId) {
    const exact = items.filter((item) => inferredInstallmentGroupId(item) === groupId);
    if (exact.length) return exact.sort((left, right) => (installmentParts(left.installments)?.current ?? 0) - (installmentParts(right.installments)?.current ?? 0));
  }
  return items.filter((item) => {
    const candidate = installmentParts(item.installments);
    return candidate?.total === parts.total
      && item.cardId === selected.cardId
      && item.description === selected.description
      && item.source === selected.source;
  }).sort((left, right) => (installmentParts(left.installments)?.current ?? 0) - (installmentParts(right.installments)?.current ?? 0));
}

export function transactionOriginLabel(item: FinanceTransaction, cards: FinanceCard[]) {
  if (item.paymentMethod === "credit" || item.cardId) {
    return cards.find((card) => card.id === item.cardId)?.name ?? "Cartão de crédito";
  }
  return item.account;
}

export type InstallmentStatus = "paid" | "overdue" | "upcoming";

export type InstallmentEntry = {
  index: number;
  total: number;
  transactionId: string;
  date: string;
  invoiceMonth: string;
  amount: number;
  status: InstallmentStatus;
};

export type InstallmentGroup = {
  groupId: string;
  description: string;
  label: string | null;
  category: string;
  cardId?: string;
  cardName: string;
  totalInstallments: number;
  paidCount: number;
  totalAmount: number;
  paidAmount: number;
  progressPercent: number;
  nextDueDate: string | null;
  entries: InstallmentEntry[];
};

/** Meses de fatura anteriores ao mês ativo do cartão que ainda não foram totalmente pagos. */
function unpaidInvoiceMonths(cardItems: FinanceTransaction[], activeMonth: string) {
  const months = [...new Set(cardItems.map((item) => item.invoiceMonth ?? item.date.slice(0, 7)))].filter((month) => month < activeMonth);
  const unpaid = new Set<string>();
  for (const month of months) {
    const rows = cardItems.filter((item) => (item.invoiceMonth ?? item.date.slice(0, 7)) === month);
    const purchases = rows.filter((item) => !isInvoicePayment(item) && item.type === "expense" && (item.paymentMethod === "credit" || !item.cardId)).reduce((sum, item) => sum + item.amount, 0);
    const paid = rows.filter(isInvoicePayment).reduce((sum, item) => sum + Math.abs(item.amount), 0);
    if (purchases - paid > 0.005) unpaid.add(month);
  }
  return unpaid;
}

/**
 * Agrupa lançamentos parcelados (compras no crédito com installmentGroupId,
 * ou inferido por `inferredInstallmentGroupId` quando ausente) em grupos por
 * cartão, calculando quantas parcelas já foram pagas com base na fatura em
 * que cada uma cai — a mesma lógica que já define fatura paga/em aberto no
 * resto do app.
 */
export function groupInstallments(
  transactions: FinanceTransaction[],
  cards: FinanceCard[],
  labels: Record<string, string>,
  today: string,
): InstallmentGroup[] {
  const active = transactions.filter((item) => !item.deletedAt && item.status !== "planned" && installmentParts(item.installments));
  const byGroup = new Map<string, FinanceTransaction[]>();
  for (const item of active) {
    const groupId = inferredInstallmentGroupId(item) ?? item.id;
    const list = byGroup.get(groupId) ?? [];
    list.push(item);
    byGroup.set(groupId, list);
  }

  const unpaidByCard = new Map<string, Set<string>>();
  function unpaidMonthsFor(card: FinanceCard) {
    const existing = unpaidByCard.get(card.id);
    if (existing) return existing;
    const cardItems = transactions.filter((item) => !item.deletedAt && item.status !== "planned" && belongsToCard(item, card));
    const computed = unpaidInvoiceMonths(cardItems, activeInvoiceMonth(card, today));
    unpaidByCard.set(card.id, computed);
    return computed;
  }

  const groups: InstallmentGroup[] = [];
  for (const [groupId, items] of byGroup) {
    const first = items[0];
    const card = cards.find((item) => item.id === first.cardId);
    const activeMonth = card ? activeInvoiceMonth(card, today) : today.slice(0, 7);
    const unpaidMonths = card ? unpaidMonthsFor(card) : new Set<string>();

    const entries: InstallmentEntry[] = items
      .map((item) => {
        const parsed = installmentParts(item.installments);
        const invoiceMonth = item.invoiceMonth ?? item.date.slice(0, 7);
        const status: InstallmentStatus = invoiceMonth < activeMonth
          ? (unpaidMonths.has(invoiceMonth) ? "overdue" : "paid")
          : "upcoming";
        return {
          index: parsed?.current ?? 0,
          total: parsed?.total ?? items.length,
          transactionId: item.id,
          date: item.date,
          invoiceMonth,
          amount: item.amount,
          status,
        };
      })
      .sort((a, b) => a.index - b.index);

    const totalInstallments = entries[0]?.total ?? entries.length;
    const paidCount = entries.filter((entry) => entry.status === "paid").length;
    const totalAmount = entries.reduce((sum, entry) => sum + entry.amount, 0);
    const paidAmount = entries.filter((entry) => entry.status === "paid").reduce((sum, entry) => sum + entry.amount, 0);
    const nextDueEntry = entries.find((entry) => entry.status !== "paid");

    groups.push({
      groupId,
      description: first.description,
      label: labels[groupId] ?? null,
      category: first.category,
      cardId: card?.id,
      cardName: card?.name ?? first.account,
      totalInstallments,
      paidCount,
      totalAmount,
      paidAmount,
      progressPercent: totalAmount > 0 ? Math.min(100, (paidAmount / totalAmount) * 100) : 0,
      nextDueDate: nextDueEntry?.date ?? null,
      entries,
    });
  }

  return groups.sort((a, b) => {
    // Em andamento primeiro, depois por próxima data de vencimento.
    const aDone = a.paidCount >= a.totalInstallments;
    const bDone = b.paidCount >= b.totalInstallments;
    if (aDone !== bDone) return aDone ? 1 : -1;
    return (a.nextDueDate ?? "9999-99").localeCompare(b.nextDueDate ?? "9999-99");
  });
}
