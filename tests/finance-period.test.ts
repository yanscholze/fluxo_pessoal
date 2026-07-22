import assert from "node:assert/strict";
import test from "node:test";
import { accountBalanceAtMonth, committedExpensesTotal, contextualFinancialTip, currentInvoiceTotals, defaultInvoiceMonthForCard, financialMonthOf, invoiceClosingDate, invoiceDueDate, isExcludedFromFreeToSpend, salaryForecastAmount, transactionsForInvoiceMonth, transactionsForMonth } from "../lib/finance-period.ts";

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
  const account = { id: "nu", name: "Nubank", institution: "Nubank", currency: "BRL", kind: "checking", balance: 900, goal: 0, monthlyYieldPercent: 0, fixed: false, color: "purple" };
  assert.equal(accountBalanceAtMonth(account, items, "2026-07", "2026-08"), 1000);
});

test("vencimento anterior ao fechamento pertence ao mês seguinte", () => {
  const datesCard = { id: "uv", name: "UV", linkedAccount: "Cartão", kind: "credit" as const, brand: "Mastercard", tier: "Black", last4: "0000", limit: 10000, closingDay: 29, dueDay: 4, dueAdjustment: "next" as const, pointsPerDollar: 2.2, cashbackPercent: 1.25, rewardMode: "both" as const, pointsGoal: 30000, manualUsdRate: 5, color: "uv" };
  assert.equal(invoiceClosingDate(datesCard, "2026-07"), "2026-07-29");
  assert.equal(invoiceDueDate(datesCard, "2026-07"), "2026-08-04");
});

test("transferência reconstrói origem e destino sem criar renda", () => {
  const source = { id: "nu", name: "Nubank", institution: "Nubank", currency: "BRL", kind: "checking", balance: 900, goal: 0, monthlyYieldPercent: 0, fixed: false, color: "purple" };
  const destination = { ...source, id: "cash", name: "Dinheiro", balance: 600 };
  const transfer = { id: "transfer", description: "Saque", category: "Transferência", account: "Nubank", destinationAccount: "Dinheiro", date: "2026-08-03", amount: 100, type: "transfer" as const, paymentMethod: "transfer" as const, source: "account-transfer" as const, status: "confirmed" as const };
  assert.equal(accountBalanceAtMonth(source, [transfer], "2026-07", "2026-08"), 1000);
  assert.equal(accountBalanceAtMonth(destination, [transfer], "2026-07", "2026-08"), 500);
});

test("empréstimo de cartão não compromete o livre para gastar", () => {
  const salary = { id: "salary", description: "Salário", category: "Salário", account: "Nubank", date: "2026-07-05", amount: 2200, type: "income" as const, paymentMethod: "transfer" as const };
  const purchase = { id: "purchase", description: "Mercado", category: "Casa", account: "Nubank", date: "2026-07-10", amount: 300, type: "expense" as const, paymentMethod: "debit" as const };
  const loan = { id: "loan", description: "Compra emprestada", category: "Empréstimo de Cartão", account: "Cartão", date: "2026-07-12", amount: 500, type: "expense" as const, paymentMethod: "credit" as const };
  assert.equal(isExcludedFromFreeToSpend(loan), true);
  assert.match(contextualFinancialTip([salary, purchase, loan], "2026-07", [], new Date("2026-07-20T12:00:00Z")), /R\$\s*1\.900,00 livres/);
});

test("categoria de empréstimo é reconhecida sem depender de acentos, caixa ou espaços", () => {
  const loan = { id: "loan", description: "Compra emprestada", category: "  EMPRÉSTIMO   DE CARTAO ", account: "Cartão", date: "2026-08-12", amount: 500, type: "expense" as const, paymentMethod: "credit" as const, invoiceMonth: "2026-08", status: "confirmed" as const };
  const mine = { ...loan, id: "mine", category: "Casa", amount: 300, status: "planned" as const };
  assert.equal(isExcludedFromFreeToSpend(loan), true);
  assert.equal(committedExpensesTotal([loan, mine], "2026-08"), 300);
});

test("próximo mês ignora o nome existente Empréstimo do Cartão", () => {
  const loan = { id: "loan-existing", description: "Compra emprestada", category: "Empréstimo do Cartão", account: "Cartão", date: "2026-08-12", amount: 2825.36, type: "expense" as const, paymentMethod: "credit" as const, invoiceMonth: "2026-08", status: "confirmed" as const };
  const mine = { ...loan, id: "mine-existing", description: "Meus compromissos", category: "Casa", amount: 1434.11, status: "planned" as const };
  assert.equal(isExcludedFromFreeToSpend(loan), true);
  assert.equal(committedExpensesTotal([loan, mine], "2026-08"), 1434.11);
});

test("salário previsto entra até o recebimento real ser lançado", () => {
  const rule = { id: "salary", description: "Salário", type: "income" as const, category: "Salário", account: "Nubank", amount: 2200, projectedAmount: 2450, dayOfMonth: 5, calculationMode: "fixed" as const, scheduleMode: "day-of-month" as const, dateAdjustment: "previous" as const, paymentMethod: "transfer" as const, active: true };
  assert.equal(salaryForecastAmount(rule, [], "2026-08"), 2450);
  const received = { id: "received", description: "SALARIO", category: "salario", account: "Nubank", date: "2026-08-05", amount: 2400, type: "income" as const, paymentMethod: "transfer" as const };
  assert.equal(salaryForecastAmount(rule, [received], "2026-08"), 0);
});

test("fatura do painel segue o ciclo atual do cartão", () => {
  const card = { id: "uv", name: "UV", linkedAccount: "Cartão", kind: "credit" as const, brand: "Mastercard", tier: "Black", last4: "0000", limit: 10000, closingDay: 15, dueDay: 22, dueAdjustment: "next" as const, pointsPerDollar: 0, cashbackPercent: 0, rewardMode: "none" as const, pointsGoal: 0, manualUsdRate: 5, color: "uv" };
  const july = { ...items[0], id: "july", cardId: "uv", invoiceMonth: "2026-07", amount: 100 };
  const august = { ...items[0], id: "august", cardId: "uv", invoiceMonth: "2026-08", amount: 450 };
  assert.equal(currentInvoiceTotals([july, august], [card], "2026-07-21").total, 450);
});
