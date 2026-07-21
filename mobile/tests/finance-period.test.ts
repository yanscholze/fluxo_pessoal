import assert from "node:assert/strict";
import test from "node:test";
import { accountBalanceAtMonth, cardLimitUsage, defaultInvoiceMonthForCard, financialMonthOf, flowTotals, invoiceDueDate, transactionsForInvoiceMonth, transactionsForMonth } from "../src/finance-period.ts";

const transactions = [
  { id: "credit", description: "Compra", category: "Casa", account: "Cartão", date: "2026-07-28", amount: 200, type: "expense" as const, paymentMethod: "credit" as const, invoiceMonth: "2026-08" },
  { id: "income", description: "Salário", category: "Salário", account: "Nubank", date: "2026-07-05", amount: 2200, type: "income" as const, paymentMethod: "transfer" as const },
  { id: "debit", description: "Mercado", category: "Casa", account: "Nubank", date: "2026-08-03", amount: 100, type: "expense" as const, paymentMethod: "debit" as const },
];

test("viagem no tempo separa mês da compra e competência do cartão", () => {
  assert.equal(financialMonthOf(transactions[0]), "2026-08");
  assert.deepEqual(transactionsForMonth(transactions, "2026-07").map((item) => item.id), ["credit", "income"]);
  assert.equal(flowTotals(transactionsForMonth(transactions, "2026-08")).expenses, 100);
  assert.equal(transactionsForInvoiceMonth(transactions, "2026-08").length, 2);
  const account = { id: "nu", name: "Nubank", institution: "Nubank", kind: "checking", balance: 2100, goal: 0, monthlyYieldPercent: 0, fixed: false, color: "#000" };
  assert.equal(accountBalanceAtMonth(account, transactions, "2026-07", "2026-08"), 2200);
});

test("fatura padrão avança somente depois do pagamento integral", () => {
  const card = { id: "uv", name: "UV", linkedAccount: "Cartão", kind: "credit" as const, brand: "Mastercard", tier: "Black", last4: "0000", limit: 10000, closingDay: 15, dueDay: 22, pointsPerDollar: 2.2, cashbackPercent: 1.25, rewardMode: "both", pointsGoal: 30000, color: "uv" };
  const purchase = { ...transactions[0], cardId: "uv", invoiceMonth: "2026-07", amount: 500 };
  const payment = { id: "paid", description: "Pagamento", category: "Fatura", account: "Nubank", date: "2026-07-20", amount: 500, type: "transfer" as const, paymentMethod: "transfer" as const, cardId: "uv", invoiceMonth: "2026-07", source: "invoice-payment" as const };
  assert.equal(defaultInvoiceMonthForCard(card, [purchase], "2026-07-20"), "2026-07");
  assert.equal(defaultInvoiceMonthForCard(card, [purchase, payment], "2026-07-20"), "2026-08");
});

test("vencimento menor que o fechamento cai no mês seguinte", () => {
  const card = { id: "uv", name: "UV", linkedAccount: "Cartão", kind: "credit" as const, brand: "Mastercard", tier: "Black", last4: "0000", limit: 10000, closingDay: 29, dueDay: 4, dueAdjustment: "next" as const, pointsPerDollar: 2.2, cashbackPercent: 1.25, rewardMode: "both", pointsGoal: 30000, color: "uv" };
  assert.equal(invoiceDueDate(card, "2026-07"), "2026-08-04");
});

test("transferência reconstrói os dois saldos históricos", () => {
  const transfer = { id: "transfer", description: "Entre contas", category: "Transferência", account: "Nubank", destinationAccount: "Dinheiro", date: "2026-08-03", amount: 100, type: "transfer" as const, paymentMethod: "transfer" as const, source: "account-transfer" as const, status: "confirmed" as const };
  const source = { id: "nu", name: "Nubank", institution: "Nubank", kind: "checking", balance: 900, goal: 0, monthlyYieldPercent: 0, fixed: false, color: "#000" };
  const destination = { ...source, id: "cash", name: "Dinheiro", balance: 600 };
  assert.equal(accountBalanceAtMonth(source, [transfer], "2026-07", "2026-08"), 1000);
  assert.equal(accountBalanceAtMonth(destination, [transfer], "2026-07", "2026-08"), 500);
});

test("limite do cartão inclui parcelas futuras e desconta a fatura paga", () => {
  const card = { id: "uv", name: "UV", linkedAccount: "Cartão", kind: "credit" as const, brand: "Mastercard", tier: "Black", last4: "0000", limit: 10000, closingDay: 29, dueDay: 4, dueAdjustment: "next" as const, pointsPerDollar: 0, cashbackPercent: 0, rewardMode: "none", pointsGoal: 0, manualUsdRate: 0, color: "uv" };
  const purchase = { id: "p1", description: "Compra", category: "Outros", account: "Cartão", cardId: "uv", date: "2026-07-20", amount: 500, type: "expense" as const, paymentMethod: "credit" as const, invoiceMonth: "2026-07", status: "confirmed" as const };
  const payment = { ...purchase, id: "pay", description: "Pagamento", type: "transfer" as const, paymentMethod: "transfer" as const, source: "invoice-payment" as const, amount: 200 };
  const future = { ...purchase, id: "future", invoiceMonth: "2026-08", amount: 400 };
  assert.equal(cardLimitUsage([purchase, payment, future], card, "2026-07"), 700);
});
