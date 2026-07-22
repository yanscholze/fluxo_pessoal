import type { FinanceCard, FinanceTransaction } from "./finance-types";

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
