import assert from "node:assert/strict";
import test from "node:test";
import { accountBalanceAtMonth, defaultInvoiceMonthForCard, financialMonthOf, transactionsForInvoiceMonth, transactionsForMonth } from "../lib/finance-period.ts";

const items = [
  { id: "card", description: "Compra", category: "Casa", account: "Cartão", date: "2026-07-29", amount: 500, type: "expense" as const, paymentMethod: "credit" as const, invoiceMonth: "2026-08" },
  { id: "debit", description: "Mercado", category: "Casa", account: "Nubank", date: "2026-08-03", amount: 100, type: "expense" as const, paymentMethod: "debit" as const },
];

test("compra pertence ao mês real nos lançamentos e à competência no cartão", () => {
  assert.equal(financialMonthOf(items[0]), "2026-08");
  assert.deepEqual(transactionsForMonth(items, "2026-07").map((item) => item.id), ["card"]);
  assert.deepEqual(transactionsForInvoiceMonth(items, "2026-08").map((item) => item.id), ["card", "debit"]);
});

test("mantém fatura fechada até o pagamento total e então avança", () => {
  const card = { id: "uv", name: "UV", linkedAccount: "Cartão", kind: "credit" as const, brand: "Mastercard", tier: "Black", last4: "0000", limit: 10000, closingDay: 15, dueDay: 22, dueAdjustment: "next" as const, pointsPerDollar: 2.2, cashbackPercent: 1.25, rewardMode: "both" as const, pointsGoal: 30000, manualUsdRate: 5, color: "uv" };
  const purchase = { ...items[0], id: "july", cardId: "uv", invoiceMonth: "2026-07", amount: 500 };
  assert.equal(defaultInvoiceMonthForCard(card, [purchase], "2026-07-20"), "2026-07");
  const partial = { id: "partial", description: "Pagamento", category: "Fatura", account: "Nubank", date: "2026-07-20", amount: 300, type: "transfer" as const, paymentMethod: "transfer" as const, cardId: "uv", invoiceMonth: "2026-07", source: "invoice-payment" as const };
  assert.equal(defaultInvoiceMonthForCard(card, [purchase, partial], "2026-07-20"), "2026-07");
  assert.equal(defaultInvoiceMonthForCard(card, [{ ...partial, amount: 500 }, purchase], "2026-07-20"), "2026-08");
});

test("reconstrói o saldo existente ao fim de um mês histórico", () => {
  const account = { id: "nu", name: "Nubank", institution: "Nubank", kind: "checking", balance: 900, goal: 0, monthlyYieldPercent: 0, fixed: false, color: "purple" };
  assert.equal(accountBalanceAtMonth(account, items, "2026-07", "2026-08"), 1000);
});
