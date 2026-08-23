import type { FinanceTransaction } from "./finance-types";

export type TripExpenseSummary = {
  items: FinanceTransaction[];
  total: number;
  categories: Array<[name: string, amount: number]>;
};

export function tripExpenseSummary(transactions: FinanceTransaction[], tripId: string): TripExpenseSummary {
  const items = transactions.filter((item) => (
    item.tripId === tripId
    && item.type === "expense"
    && item.status !== "planned"
    && !item.deletedAt
  ));
  const total = items.reduce((sum, item) => sum + item.amount, 0);
  const byCategory = new Map<string, number>();
  items.forEach((item) => byCategory.set(item.category, (byCategory.get(item.category) ?? 0) + item.amount));
  return {
    items,
    total,
    categories: [...byCategory.entries()].sort((a, b) => b[1] - a[1]),
  };
}

export function tripTotalInCurrency(totalBrl: number, exchangeRate: number) {
  return Number.isFinite(exchangeRate) && exchangeRate > 0 ? totalBrl / exchangeRate : 0;
}
