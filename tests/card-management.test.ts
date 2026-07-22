import assert from "node:assert/strict";
import test from "node:test";
import { normalizeCardOrder, sortFinanceCards } from "../lib/card-management.ts";
import { cardLimitUsage } from "../lib/finance-period.ts";
import type { FinanceCard, FinanceTransaction } from "../lib/finance-types.ts";

const card = (id: string, name: string, sortOrder: number, favorite = false): FinanceCard => ({
  id, name, linkedAccount: name, kind: "credit", brand: "Mastercard", tier: "Black", last4: "0000",
  limit: 10000, closingDay: 29, dueDay: 4, dueAdjustment: "next", pointsPerDollar: 0,
  cashbackPercent: 0, rewardMode: "none", pointsGoal: 0, manualUsdRate: 0, color: "custom", sortOrder, favorite,
});

test("cartão favorito fica em primeiro sem perder a ordem personalizada", () => {
  const cards = [card("a", "A", 2), card("b", "B", 0, true), card("c", "C", 1)];
  assert.deepEqual(sortFinanceCards(cards).map((item) => item.id), ["b", "c", "a"]);
  const changed = normalizeCardOrder(cards, ["a", "b", "c"], "c");
  assert.deepEqual(changed.map((item) => item.id), ["c", "a", "b"]);
  assert.equal(changed.filter((item) => item.favorite).length, 1);
});

test("limite usado considera fatura atual e parcelas futuras, descontando pagamentos", () => {
  const uv = card("uv", "Nubank Ultravioleta", 0, true);
  const base: FinanceTransaction = { id: "base", description: "Compra", category: "Outros", account: uv.linkedAccount, cardId: uv.id, date: "2026-07-20", amount: 500, type: "expense", paymentMethod: "credit", invoiceMonth: "2026-07", status: "confirmed" };
  const rows: FinanceTransaction[] = [
    { ...base, id: "old", invoiceMonth: "2026-06", amount: 700 },
    base,
    { ...base, id: "payment", description: "Pagamento", type: "transfer", paymentMethod: "transfer", source: "invoice-payment", amount: 200 },
    { ...base, id: "future-1", invoiceMonth: "2026-08", amount: 300 },
    { ...base, id: "future-2", invoiceMonth: "2026-09", amount: 300 },
  ];
  assert.equal(cardLimitUsage(rows, uv, "2026-07"), 900);
});

test("pagamento de fatura nunca vira compra no limite, mesmo em registro legado", () => {
  const uv = card("uv", "Nubank Ultravioleta", 0, true);
  const purchase: FinanceTransaction = { id: "purchase", description: "Compra", category: "Outros", account: uv.linkedAccount, cardId: uv.id, date: "2026-07-20", amount: 500, type: "expense", paymentMethod: "credit", invoiceMonth: "2026-07", status: "confirmed" };
  const legacyPayment: FinanceTransaction = { ...purchase, id: "invoice-payment:legacy", description: "Pagamento da fatura", source: "invoice-payment", paymentMethod: "transfer", amount: 200 };

  assert.equal(cardLimitUsage([purchase], uv, "2026-07"), 500);
  assert.equal(cardLimitUsage([purchase, legacyPayment], uv, "2026-07"), 300);
});
