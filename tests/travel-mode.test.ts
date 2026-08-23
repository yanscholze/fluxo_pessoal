import assert from "node:assert/strict";
import test from "node:test";
import type { FinanceTransaction } from "../lib/finance-types.ts";
import { tripExpenseSummary, tripTotalInCurrency } from "../lib/travel.ts";

const base: FinanceTransaction = {
  id: "base",
  description: "Compra",
  category: "Alimentação",
  account: "Nubank Ultravioleta",
  date: "2026-07-20",
  amount: 100,
  type: "expense",
  paymentMethod: "credit",
  status: "confirmed",
  tripId: "trip-buenos-aires",
};

test("modo viagem filtra apenas despesas confirmadas com a mesma identificação", () => {
  const transactions: FinanceTransaction[] = [
    base,
    { ...base, id: "installment-2", date: "2026-08-20", invoiceMonth: "2026-08", installments: "2/3", amount: 75 },
    { ...base, id: "other-trip", tripId: "trip-londres", amount: 900 },
    { ...base, id: "planned", status: "planned", amount: 250 },
    { ...base, id: "income", type: "income", amount: 300 },
    { ...base, id: "transport", category: "Transporte", amount: 50 },
  ];

  const summary = tripExpenseSummary(transactions, "trip-buenos-aires");
  assert.equal(summary.items.length, 3);
  assert.equal(summary.total, 225);
  assert.deepEqual(summary.categories, [["Alimentação", 175], ["Transporte", 50]]);
});

test("conversão da viagem usa reais por uma unidade da moeda", () => {
  assert.equal(tripTotalInCurrency(560, 5.6), 100);
  assert.equal(tripTotalInCurrency(560, 0), 0);
});
