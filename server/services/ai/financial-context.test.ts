import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { cents } from "../../../core/kernel/money.ts";
import { localDate } from "../../../core/time/local-date.ts";
import { ambiente, zerar } from "../../testing/cenario.ts";
import { buildFinancialIntelligence, financialLabel, recommendSaving, savingsSimulation } from "./financial-context.ts";

const NOW = new Date("2026-10-24T12:00:00Z");

async function expense(userId: string, accountId: string, categoryId: string, amount: number, date: string) {
  const { recordTransaction } = await import("../transactions.ts");
  return recordTransaction(userId, { kind: "expense", description: "Compra confidencial cpf 123.456.789-00", amount: cents(amount), occurredOn: localDate(date), accountId, categoryId, state: "confirmed", notes: "segredo-que-nao-pode-sair" }, NOW);
}

describe("contexto financeiro minimizado", () => {
  beforeEach(() => zerar());

  it("mantém o Livre canônico, separa V.A e reserva e não grava previsões", async () => {
    const { buildDashboard } = await import("../dashboard.ts");
    const { createAccount } = await import("../catalog.ts");
    const { listTransactions } = await import("../../repositories/ledger.ts");
    const user = await ambiente(500_000);
    await createAccount(user.userId, { name: "V.A confidencial", kind: "benefit", openingBalance: cents(70_000), openedOn: localDate("2026-01-01") });
    await createAccount(user.userId, { name: "Reserva privada", kind: "savings", openingBalance: cents(900_000), openedOn: localDate("2026-01-01") });
    const dashboard = await buildDashboard(user.userId, NOW);
    const intelligence = await buildFinancialIntelligence(user.userId, NOW);
    assert.equal(intelligence.context.cycle.freeToSpendCents, dashboard.freeToSpend.amountCents);
    assert.equal(intelligence.context.cycle.benefitFreeCents, 70_000);
    assert.equal(intelligence.context.cycle.moneyFreeCents, 500_000);
    assert.equal(intelligence.context.reserve.currentCents, 900_000);
    assert.equal((await listTransactions(user.userId)).length, 0);
    assert.ok(intelligence.suggestions.length > 0);
  });

  it("não envia nomes de pessoa, contas, cartão, descrição, notas, instituições nem IDs", async () => {
    const user = await ambiente();
    await expense(user.userId, user.contaId, user.categoriaId, 12_345, "2026-10-20");
    const { context } = await buildFinancialIntelligence(user.userId, NOW);
    const json = JSON.stringify(context);
    for (const forbidden of [user.userId, user.contaId, user.cartaoId, user.categoriaId, "Banco de Teste", "Cartão de Teste", "Compra confidencial", "segredo-que-nao-pode-sair", "Pessoa de Teste", "teste@fluxo.app"]) assert.ok(!json.includes(forbidden), forbidden);
    assert.equal(context.relevantTransactions, undefined);
    assert.equal(context.month.expenseCents, 12_345);
  });

  it("reutiliza exclusões de categoria e deduplicação de recorrência confirmada", async () => {
    const { buildDashboard } = await import("../dashboard.ts");
    const { createCategory } = await import("../catalog.ts");
    const { createRecurrence, confirmOccurrence } = await import("../recurrences.ts");
    const { recordTransaction } = await import("../transactions.ts");
    const { competence } = await import("../../../core/time/competence.ts");
    const user = await ambiente(500_000);
    const excluded = await createCategory(user.userId, { name: "Empréstimo de teste IA", kind: "expense", excludeFromFreeToSpend: true });
    const income = await createCategory(user.userId, { name: "Salário de teste IA", kind: "income" });
    await recordTransaction(user.userId, { kind: "expense", state: "confirmed", description: "Favor para outra pessoa", amount: cents(100_000), cardId: user.cartaoId, categoryId: excluded, occurredOn: localDate("2026-10-20") }, NOW);
    const recurrence = await createRecurrence(user.userId, { kind: "income", role: "salary", description: "Salário privado", amount: cents(200_000), accountId: user.contaId, categoryId: income, scheduleDay: 28, startsOn: localDate("2026-10-01") }, NOW);
    const before = await buildFinancialIntelligence(user.userId, NOW);
    assert.equal(before.context.cycle.freeToSpendCents, (await buildDashboard(user.userId, NOW)).freeToSpend.amountCents);
    assert.equal(before.context.cycle.openInvoicesCents, 0, "categoria excluída não pesa no Livre");
    await confirmOccurrence(user.userId, recurrence, competence("2026-10"), {}, NOW);
    const after = await buildFinancialIntelligence(user.userId, NOW);
    assert.equal(after.context.cycle.freeToSpendCents, (await buildDashboard(user.userId, NOW)).freeToSpend.amountCents);
    assert.equal(after.context.cycle.pendingIncomeCents, 0, "não mantém renda virtual já confirmada");
    assert.equal(after.context.obligations.next7DaysIncomeCents, 0);
  });

  it("detalhamento é opt-in, limitado a 10 linhas sanitizadas do mês e categoria relevantes", async () => {
    const user = await ambiente(1_000_000);
    const { createCategory } = await import("../catalog.ts");
    const other = await createCategory(user.userId, { name: "Outro", kind: "expense" });
    for (let i = 0; i < 13; i++) await expense(user.userId, user.contaId, user.categoriaId, 1000 + i, "2026-10-20");
    await expense(user.userId, user.contaId, other, 90_000, "2026-10-20");
    await expense(user.userId, user.contaId, user.categoriaId, 80_000, "2026-09-20");
    const { context } = await buildFinancialIntelligence(user.userId, NOW, { question: "Quais despesas do Mercado foram maiores?" });
    assert.equal(context.relevantTransactions?.length, 10);
    assert.ok(context.relevantTransactions?.every((row) => row.category === "Mercado" && row.date.startsWith("2026-10")));
    assert.ok(!JSON.stringify(context).includes("Compra confidencial"));
    assert.deepEqual(Object.keys(context.relevantTransactions![0]).sort(), ["amountCents", "category", "date", "kind", "origin"]);
  });

  it("soma todos os vencimentos antes do corte visual de eventos", async () => {
    const { recordTransaction } = await import("../transactions.ts");
    const user = await ambiente(1_000_000);
    for (let i = 0; i < 15; i++) await recordTransaction(user.userId, { kind: "expense", description: `Conta prevista ${i}`, amount: cents(1000), accountId: user.contaId, categoryId: user.categoriaId, occurredOn: localDate("2026-10-26"), state: "planned" }, NOW);
    const { context } = await buildFinancialIntelligence(user.userId, NOW);
    assert.equal(context.obligations.next7DaysExpenseCents, 15_000);
    assert.equal(context.obligations.events.length, 12);
    assert.equal(context.obligations.truncated, true);
  });

  it("sem histórico essencial a cobertura fica indisponível em vez de inventada", async () => {
    const user = await ambiente();
    const { context } = await buildFinancialIntelligence(user.userId, NOW);
    assert.equal(context.reserve.monthsCovered, null);
    assert.equal(context.reserve.monthlyEssentialCents, null);
    assert.equal(context.savingRecommendation.reason, "insufficient_history");
    assert.equal(context.savingRecommendation.suggestedCents, 0);
  });

  it("não soma parcelas novamente nas saídas de faturas", async () => {
    const { recordTransaction } = await import("../transactions.ts");
    const user = await ambiente(1_000_000);
    await recordTransaction(user.userId, { kind: "expense", description: "Compra parcelada privada", amount: cents(30_000), cardId: user.cartaoId, categoryId: user.categoriaId, occurredOn: localDate("2026-10-20"), state: "confirmed", installmentCount: 3 }, NOW);
    const { context } = await buildFinancialIntelligence(user.userId, NOW);
    assert.equal(context.installments.remainingCount, 3);
    assert.equal(context.installments.remainingCents, 30_000);
    assert.equal(context.obligations.next30DaysExpenseCents, 10_000);
    assert.equal(context.installments.includesAmountsAlreadyInInvoices, true);
  });

  it("preserva o vencimento congelado de uma fatura após mudar o dia do cartão", async () => {
    const { recordTransaction } = await import("../transactions.ts");
    const { updateCard } = await import("../catalog.ts");
    const { buildDashboard } = await import("../dashboard.ts");
    const now = new Date("2026-10-18T12:00:00Z");
    const user = await ambiente(500_000);
    await recordTransaction(user.userId, { kind: "expense", state: "confirmed", description: "Compra da fatura já fechada", amount: cents(10_000), cardId: user.cartaoId, categoryId: user.categoriaId, occurredOn: localDate("2026-10-05") }, now);
    await updateCard(user.userId, user.cartaoId, { dueDay: 28 }, now);
    const { context } = await buildFinancialIntelligence(user.userId, now);
    const invoice = context.obligations.events.find((event) => event.kind === "invoice");
    assert.equal(invoice?.date, "2026-10-20", "usa a data congelada ao fechar, não o novo dia28");
    assert.equal(context.cards[0].nextDueDate, "2026-10-20");
    assert.equal(context.obligations.next7DaysExpenseCents, 10_000);
    assert.equal(context.obligations.overdueCents, 0);
    assert.equal(context.cycle.freeToSpendCents, (await buildDashboard(user.userId, now)).freeToSpend.amountCents, "não modifica o Livre canônico");
  });

  it("inclui consumo no cartão e não confunde transferência com gasto", async () => {
    const { recordTransaction } = await import("../transactions.ts");
    const { createAccount } = await import("../catalog.ts");
    const user = await ambiente(1_000_000);
    const reserve = await createAccount(user.userId, { name: "Reserva", kind: "savings", openingBalance: cents(0), openedOn: localDate("2026-01-01") });
    await recordTransaction(user.userId, { kind: "expense", description: "Compra no cartão", amount: cents(15_000), cardId: user.cartaoId, categoryId: user.categoriaId, occurredOn: localDate("2026-10-05"), state: "confirmed" }, NOW);
    await recordTransaction(user.userId, { kind: "transfer", description: "Guardar", amount: cents(20_000), accountId: user.contaId, destinationAccountId: reserve, occurredOn: localDate("2026-10-06"), state: "confirmed" }, NOW);
    const { context } = await buildFinancialIntelligence(user.userId, NOW);
    assert.equal(context.month.expenseCents, 15_000);
    assert.equal(context.reserve.currentCents, 20_000);
  });

  it("histórico e tendências comparam somente meses completos e não dividem por zero", async () => {
    const user = await ambiente(1_000_000);
    for (const date of ["2026-06-05", "2026-07-05", "2026-08-05"]) await expense(user.userId, user.contaId, user.categoriaId, 10_000, date);
    await expense(user.userId, user.contaId, user.categoriaId, 30_000, "2026-09-05");
    await expense(user.userId, user.contaId, user.categoriaId, 500_000, "2026-10-05");
    const { context, insights } = await buildFinancialIntelligence(user.userId, NOW);
    assert.ok(context.history.completeMonths.every((month) => month.competence < "2026-10"));
    const trend = context.categoryTrends.find((row) => row.category === "Mercado");
    assert.equal(trend?.competence, "2026-09");
    assert.equal(trend?.baselineAverageCents, 10_000);
    assert.equal(trend?.changePercent, 200);
    assert.ok(insights.some((insight) => insight.key.startsWith("category-growth-")));
  });

  it("fingerprint é estável e muda com os valores, não com descrições privadas", async () => {
    const { recordTransaction } = await import("../transactions.ts");
    const user = await ambiente();
    const transaction = await expense(user.userId, user.contaId, user.categoriaId, 10_000, "2026-10-05");
    const first = await buildFinancialIntelligence(user.userId, NOW);
    const repeated = await buildFinancialIntelligence(user.userId, NOW);
    assert.equal(first.fingerprint, repeated.fingerprint);
    assert.match(first.fingerprint, /^[a-f0-9]{64}$/u);
    const input = { id: transaction.ids[0], kind: "expense" as const, state: "confirmed" as const, accountId: user.contaId, categoryId: user.categoriaId, amount: cents(10_000), occurredOn: localDate("2026-10-05"), description: "Outra descrição privada" };
    await recordTransaction(user.userId, input, NOW);
    assert.equal((await buildFinancialIntelligence(user.userId, NOW)).fingerprint, first.fingerprint);
    await recordTransaction(user.userId, { ...input, amount: cents(20_000) }, NOW);
    assert.notEqual((await buildFinancialIntelligence(user.userId, NOW)).fingerprint, first.fingerprint);
  });

  it("isola os dados de outro usuário", async () => {
    const { signUp } = await import("../auth.ts");
    const { createAccount, createCategory } = await import("../catalog.ts");
    const user = await ambiente();
    const { user: other } = await signUp({ email: "outro@fluxo.teste", password: "senha-de-teste-123", displayName: "Outra pessoa" });
    const account = await createAccount(other.id, { name: "Outra conta", kind: "checking", openingBalance: cents(999_999), openedOn: localDate("2026-01-01") });
    const category = await createCategory(other.id, { name: "Segredo do outro", kind: "expense" });
    await expense(other.id, account, category, 55_555, "2026-10-20");
    const { context } = await buildFinancialIntelligence(user.userId, NOW);
    assert.equal(context.month.expenseCents, 0);
    assert.equal(context.position.currentBalanceCents, 500_000);
    assert.ok(!JSON.stringify(context).includes("Segredo do outro"));
  });
});

describe("sugestões e simulações determinísticas", () => {
  const base = { moneyMarginCents: 100_000, currentMoneyBalanceCents: 80_000, liquidityAfterNext7DaysCents: 70_000, historicalDailyExpenseCents: 1000, observedCompleteMonths: 3, daysRemaining: 10, overdueCount: 0, futureShortfall: false };

  it("limita o aporte pela margem sem benefício, colchão e liquidez", () => {
    const result = recommendSaving(base);
    assert.equal(result.suggestedCents, 70_000);
    assert.equal(result.remainingMarginCents, 30_000);
    assert.equal(result.prudentialBufferCents, 10_000);
    assert.equal(result.reason, "available");
  });

  it("não sugere aporte com déficit, atraso, pouca base ou caixa futuro negativo", () => {
    for (const [override, reason] of [
      [{ moneyMarginCents: -1 }, "negative_margin"], [{ overdueCount: 1 }, "overdue"],
      [{ observedCompleteMonths: 1 }, "insufficient_history"], [{ futureShortfall: true }, "future_shortfall"],
      [{ liquidityAfterNext7DaysCents: -1 }, "low_liquidity"], [{ historicalDailyExpenseCents: 20_000 }, "buffer"],
    ] as const) {
      const result = recommendSaving({ ...base, ...override });
      assert.equal(result.suggestedCents, 0);
      assert.equal(result.reason, reason);
    }
  });

  it("simula somente aporte e horizonte explícitos, sem rendimento prometido", () => {
    const simulation = savingsSimulation("Se eu guardar R$ 500 por mês, como fico daqui a 6 meses?", 40_000);
    assert.equal(simulation?.totalContributionsCents, 300_000);
    assert.equal(simulation?.points.at(-1)?.accumulatedCents, 300_000);
    assert.equal(simulation?.fitsCurrentMoneyMargin, false);
    assert.equal(simulation?.remainingCycleMarginCents, -10_000);
    assert.equal(simulation?.assumesNoReturn, true);
    assert.equal(savingsSimulation("Quero guardar mais", 100_000), undefined);
    assert.equal(savingsSimulation("Guardar 100 por mês em 99 meses", 100_000), undefined);
    assert.equal(savingsSimulation("Guardar 100 por mês em 123 meses", 100_000), undefined);
    assert.equal(savingsSimulation("Guardar R$ 1.500,50 por mês durante 12 meses", 500_000)?.totalContributionsCents, 1_800_600);
  });

  it("preserva horizonte explícito e usa o valor mais recente no follow-up", () => {
    const prior = ["Se eu guardar R$ 500 por mês, como fico daqui a 6 meses?"];
    const simulation = savingsSimulation("E se eu guardar só 400?", 100_000, prior);
    assert.equal(simulation?.monthlyContributionCents, 40_000);
    assert.equal(simulation?.months, 6);
    assert.equal(simulation?.totalContributionsCents, 240_000);
    assert.equal(savingsSimulation("E se 400?", 100_000, prior)?.totalContributionsCents, 240_000);
    assert.equal(savingsSimulation("E se 4 meses?", 100_000, prior), undefined);
    assert.equal(savingsSimulation("E se eu guardar só 400?", 100_000), undefined);
  });

  it("remove identificadores e segredos acidentais em nomes de categorias", () => {
    assert.equal(financialLabel("Contato pessoa@example.com 123.456.789-00"), "Contato [email omitido] [documento omitido]");
    // Build provider-shaped examples at runtime: no complete credential-like
    // literal belongs in the repository, even when the value is fictitious.
    const examples = [
      ["AI", "za", "x".repeat(35)].join(""),
      ["gh", "p_", "x".repeat(36)].join(""),
      ["sk", "-", "x".repeat(40)].join(""),
    ];
    for (const example of examples) assert.equal(financialLabel(`Token ${example}`), "Token [segredo omitido]");
  });
});
