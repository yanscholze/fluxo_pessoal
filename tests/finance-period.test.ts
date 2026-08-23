import assert from "node:assert/strict";
import test from "node:test";
import { accountBalanceAtMonth, committedExpensesTotal, contextualFinancialTip, currentInvoiceTotals, defaultInvoiceMonthForCard, financialMonthOf, freeToSpendProjection, invoiceClosingDate, invoiceDueDate, isExcludedFromFreeToSpend, salaryForecastAmount, transactionsForInvoiceMonth, transactionsForMonth } from "../lib/finance-period.ts";

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

test("livre para gastar considera saldo real e fatura em aberto, não só lançamentos do mês", () => {
  const account = { id: "acc-nu", name: "Nubank", institution: "Nu", currency: "BRL", kind: "checking" as const, balance: 3000, goal: 0, monthlyYieldPercent: 0, fixed: false, color: "nu" };
  const card = { id: "card-nu", name: "Nubank", linkedAccount: "Nubank", kind: "credit" as const, brand: "Mastercard", tier: "Ultravioleta", last4: "0000", limit: 10000, closingDay: 13, dueDay: 20, dueAdjustment: "next" as const, pointsPerDollar: 0, cashbackPercent: 0, rewardMode: "none" as const, pointsGoal: 0, manualUsdRate: 5, color: "nu" };

  // Compra parcelada feita no mês passado (antes do fechamento), cuja fatura só fecha e some agora.
  const oldPurchase = { id: "old-purchase", description: "Compra parcelada", category: "Casa", account: "Nubank", date: "2026-07-05", amount: 2750, type: "expense" as const, paymentMethod: "credit" as const, cardId: "card-nu", invoiceMonth: "2026-08", status: "confirmed" as const };
  // Salário já recebido este mês (já está refletido em account.balance).
  const salary = { id: "salary", description: "Salário", category: "Salário", account: "Nubank", date: "2026-08-05", amount: 3000, type: "income" as const, paymentMethod: "transfer" as const, status: "confirmed" as const };

  const transactions = [oldPurchase, salary];
  const result = freeToSpendProjection([account], transactions, [card], "2026-08-10");

  // Saldo (3000) - fatura em aberto (2750) = 250, batendo com o que o usuário via na conta de verdade.
  assert.equal(result.liquidBalance, 3000);
  assert.equal(result.upcomingInvoice, 2750);
  assert.equal(result.free, 250);
});

test("livre para gastar usa o ciclo da fatura (dia 14 a dia 13), não o mês civil", () => {
  const account = { id: "acc-nu", name: "Nubank", institution: "Nu", currency: "BRL", kind: "checking" as const, balance: 1000, goal: 0, monthlyYieldPercent: 0, fixed: false, color: "nu" };
  const card = { id: "card-nu", name: "Nubank", linkedAccount: "Nubank", kind: "credit" as const, brand: "Mastercard", tier: "Ultravioleta", last4: "0000", limit: 10000, closingDay: 13, dueDay: 20, dueAdjustment: "next" as const, pointsPerDollar: 0, cashbackPercent: 0, rewardMode: "none" as const, pointsGoal: 0, manualUsdRate: 5, favorite: true, color: "nu" };

  // Um recebimento previsto para dia 20 de agosto — depois do fechamento (13) — já
  // pertence ao ciclo que vai até 13 de setembro, não ao "mês de agosto" civil.
  const lateAugustIncome = { id: "freela", description: "Freela", category: "Renda extra", account: "Nubank", date: "2026-08-20", amount: 500, type: "income" as const, paymentMethod: "transfer" as const, status: "planned" as const };
  // Um recebimento previsto para dia 10 de agosto — antes do fechamento — pertenceria
  // ao ciclo anterior (13/07 a 13/08), então some do ciclo atual.
  const earlyAugustIncome = { id: "bonus", description: "Bônus", category: "Renda extra", account: "Nubank", date: "2026-08-10", amount: 200, type: "income" as const, paymentMethod: "transfer" as const, status: "planned" as const };

  const transactions = [lateAugustIncome, earlyAugustIncome];

  // Hoje = 20 de agosto: já viramos o ciclo (fechou dia 13), então a janela é 14/08 até o
  // próximo fechamento — 13/09/2026 cai num fim de semana, então ajusta para o dia útil anterior (11/09).
  const result = freeToSpendProjection([account], transactions, [card], "2026-08-20");
  assert.equal(result.cycleStart, "2026-08-14");
  assert.equal(result.cycleEnd, "2026-09-11");
  assert.equal(result.pendingIncome, 500); // só o recebimento de dia 20 entra, o de dia 10 é do ciclo anterior.
  assert.equal(result.free, 1000 + 500);
});
