import { env } from "cloudflare:workers";
import { and, eq, gte, isNull, lte } from "drizzle-orm";
import { accounts, cards, transactions } from "../../../../../db/schema";
import { ensureFinanceSchema } from "../../../../../db/ensure-schema";
import { getDb } from "../../../../../db";
import { consumeAiQuota } from "../../../../../lib/ai-quota";
import { apiIdentityFrom, apiUnauthorized } from "../../../../../lib/api-v1-auth";
import { askFinancialCoach } from "../../../../../lib/financial-coach";
import { isExcludedFromFreeToSpend } from "../../../../../lib/finance-period";

const headers = { "cache-control": "no-store", "x-fluxo-api-version": "1" };

function monthOffset(month: string, offset: number) {
  const [year, number] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, number - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function config() {
  const values = env as unknown as { OPENAI_API_KEY?: string; OPENAI_FINANCE_MODEL?: string };
  return { apiKey: values.OPENAI_API_KEY?.trim() || "", model: values.OPENAI_FINANCE_MODEL?.trim() || "gpt-5.6-luna" };
}

export async function POST(request: Request) {
  const identity = await apiIdentityFrom(request);
  if (!identity) return apiUnauthorized();
  try {
    const payload = await request.json() as { question?: unknown; period?: unknown };
    const question = typeof payload.question === "string" ? payload.question.trim().slice(0, 600) : "";
    const requestedPeriod = typeof payload.period === "string" ? payload.period.trim() : "";
    const period = /^\d{4}-\d{2}$/.test(requestedPeriod) ? requestedPeriod : new Date().toISOString().slice(0, 7);
    if (question.length < 3) return Response.json({ error: "Escreva uma pergunta sobre suas finanças" }, { status: 400, headers });
    const ai = config();
    if (!ai.apiKey) return Response.json({ error: "Assistente financeiro ainda não está configurado" }, { status: 503, headers });

    await ensureFinanceSchema();
    const db = getDb();
    const start = `${monthOffset(period, -1)}-01`;
    const end = `${monthOffset(period, 2)}-01`;
    const [accountRows, cardRows, transactionRows] = await Promise.all([
      db.select().from(accounts).where(eq(accounts.ownerId, identity.ownerId)),
      db.select().from(cards).where(eq(cards.ownerId, identity.ownerId)),
      db.select().from(transactions).where(and(
        eq(transactions.ownerId, identity.ownerId), isNull(transactions.deletedAt),
        gte(transactions.occurredAt, start), lte(transactions.occurredAt, end),
      )).limit(600),
    ]);
    const brlAccounts = new Set(accountRows.filter((item) => item.currency === "BRL").map((item) => item.name));
    const knownAccounts = new Set(accountRows.map((item) => item.name));
    const currencyFor = (account: string) => accountRows.find((item) => item.name === account)?.currency ?? "BRL";
    const periodRows = transactionRows.filter((item) => item.occurredAt.startsWith(period) && (!knownAccounts.has(item.account) || brlAccounts.has(item.account)));
    const totals = periodRows.reduce((acc, item) => {
      if (item.status === "confirmed" || item.status === "planned") {
        if (item.type === "income") acc.income += item.amountCents;
        else if (item.type === "expense") {
          acc.expense += item.amountCents;
          if (!isExcludedFromFreeToSpend(item)) acc.freeToSpendExpense += item.amountCents;
        }
      }
      return acc;
    }, { income: 0, expense: 0, freeToSpendExpense: 0 });
    const categoryTotals = Object.entries(periodRows.filter((item) => item.type === "expense").reduce<Record<string, number>>((acc, item) => {
      acc[item.category] = (acc[item.category] ?? 0) + item.amountCents; return acc;
    }, {})).sort((a, b) => b[1] - a[1]).map(([category, cents]) => ({ category, amount: cents / 100 }));
    const context = {
      period,
      totals: { income: totals.income / 100, expense: totals.expense / 100, freeCashFlow: (totals.income - totals.freeToSpendExpense) / 100 },
      accounts: accountRows.map((item) => ({ name: item.name, kind: item.kind, currency: item.currency, balance: item.balanceCents / 100, goal: item.goalCents / 100 })),
      cards: cardRows.map((item) => ({ name: item.name, kind: item.kind, limit: item.limitCents / 100, closingDay: item.closingDay, dueDay: item.dueDay })),
      expensesByCategory: categoryTotals,
      transactions: transactionRows.map((item) => ({ date: item.occurredAt, description: item.description, category: item.category, account: item.account, currency: currencyFor(item.account), amount: item.amountCents / 100, type: item.type, status: item.status, paymentMethod: item.paymentMethod, invoiceMonth: item.invoiceMonth })),
    };
    await consumeAiQuota(identity.ownerId, "financial-advice", 60);
    const advice = await askFinancialCoach({ ...ai, question, context });
    return Response.json({ advice, period }, { headers });
  } catch (error) {
    const code = error instanceof Error ? error.message : "AI_ADVICE_FAILED";
    if (code === "AI_DAILY_LIMIT") return Response.json({ error: "Limite diário do assistente atingido" }, { status: 429, headers });
    if (code === "AI_RATE_LIMITED") return Response.json({ error: "O assistente está muito ocupado. Tente novamente em instantes." }, { status: 429, headers });
    if (code === "AI_TIMEOUT") return Response.json({ error: "O assistente demorou demais para responder" }, { status: 504, headers });
    console.error("[fluxo:financial-coach]", { code });
    return Response.json({ error: "Não consegui gerar esta análise agora" }, { status: 502, headers });
  }
}
