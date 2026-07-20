import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { accounts, cards, categories, recurringEntries, transactions } from "../../../db/schema";
import { ensureFinanceSchema } from "../../../db/ensure-schema";
import { getDb } from "../../../db";
import { businessDaysInMonth, effectiveRecurringDate } from "../../../lib/brazil-calendar";
import { scopedImportFingerprint } from "../../../lib/import-fingerprint";
import type { PaymentMethod, TransactionType } from "../../../lib/finance-types";
import { webIdentityFrom } from "../../../lib/app-auth";

function unauthorized() {
  return Response.json({ error: "Autenticação obrigatória", code: "AUTH_REQUIRED" }, { status: 401, headers: { "cache-control": "no-store" } });
}

function stableId(owner: string, value: string) {
  return `${owner}:${value.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

function freshEntityId(owner: string, entity: string, label: string) {
  return stableId(owner, `${entity}-${label}-${crypto.randomUUID()}`);
}

function recurringJson(row: typeof recurringEntries.$inferSelect, month: string) {
  const businessDays = businessDaysInMonth(month);
  const amount = row.amountCents / 100;
  return {
    id: row.id,
    description: row.description,
    type: row.type === "income" ? "income" : "expense",
    category: row.category,
    account: row.account,
    amount,
    dayOfMonth: row.dayOfMonth,
    calculationMode: row.calculationMode,
    scheduleMode: row.scheduleMode,
    dateAdjustment: row.dateAdjustment,
    paymentMethod: row.paymentMethod,
    cardId: row.cardId ?? undefined,
    active: row.active,
    lastConfirmedMonth: row.lastConfirmedMonth ?? undefined,
    effectiveDate: effectiveRecurringDate(month, row.dayOfMonth, row.scheduleMode === "business-day-of-month" ? "business-day-of-month" : "day-of-month", row.dateAdjustment === "next" ? "next" : "previous"),
    businessDays,
    projectedAmount: row.calculationMode === "business-day" ? amount * businessDays : amount,
  };
}

function cardJson(row: typeof cards.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    linkedAccount: row.linkedAccount,
    kind: row.kind,
    brand: row.brand,
    tier: row.tier,
    last4: row.last4,
    limit: row.limitCents / 100,
    closingDay: row.closingDay,
    dueDay: row.dueDay,
    dueAdjustment: row.dueAdjustment,
    pointsPerDollar: row.pointsPerDollarMilli / 1000,
    cashbackPercent: row.cashbackBasisPoints / 100,
    rewardMode: row.rewardMode,
    pointsGoal: row.pointsGoal,
    manualUsdRate: row.manualUsdRateMicros / 1_000_000,
    color: row.color,
  };
}

async function seedDefaults(ownerId: string) {
  const db = getDb();
  const accountDefaults = [
    ["Nubank", "nubank", "checking", "purple"],
    ["Mercado Pago", "mercado-pago", "checking", "blue"],
    ["Caju VA", "caju", "benefit", "orange"],
    ["Dinheiro", "manual", "cash", "green"],
    ["XP Investimentos", "xp", "investment", "gold"],
    ["Reserva de emergência", "manual", "investment", "green"],
    ["Nubank Ultravioleta", "nubank", "credit-card", "black"],
  ] as const;
  const categoryDefaults = [
    ["Alimentação", "expense", "teal", "utensils", true],
    ["Moradia", "expense", "blue", "home", true],
    ["Transporte", "expense", "purple", "car", true],
    ["Saúde", "expense", "green", "heart", true],
    ["Lazer", "expense", "orange", "sparkles", false],
    ["Educação", "expense", "blue", "book", false],
    ["Outros", "expense", "gray", "circle", false],
    ["Salário", "income", "green", "wallet", false],
    ["Estética automotiva", "income", "purple", "sparkles", false],
    ["Presentes", "income", "orange", "gift", false],
    ["Benefício / VA", "income", "teal", "wallet", false],
  ] as const;

  await db.insert(accounts).values(accountDefaults.map(([name, institution, kind, color]) => ({
    id: stableId(ownerId, `account-${name}`), ownerId, name, institution, kind, color,
    fixed: name === "Reserva de emergência",
  }))).onConflictDoNothing();
  await db.insert(categories).values(categoryDefaults.map(([name, kind, color, icon, essential]) => ({
    id: stableId(ownerId, `category-${name}`), ownerId, name, kind, color, icon, essential,
  }))).onConflictDoNothing();
  await db.insert(cards).values([
    {
      id: stableId(ownerId, "card-nubank-ultravioleta"), ownerId, name: "Nubank Ultravioleta",
      linkedAccount: "Nubank Ultravioleta", kind: "credit", brand: "Mastercard", tier: "Black",
      last4: "0000", closingDay: 1, dueDay: 8, dueAdjustment: "next",
      pointsPerDollarMilli: 2200, cashbackBasisPoints: 125, rewardMode: "both", color: "uv",
    },
    {
      id: stableId(ownerId, "card-caju-va"), ownerId, name: "Caju VA",
      linkedAccount: "Caju VA", kind: "debit", brand: "Visa", tier: "Benefícios", last4: "0000",
      closingDay: 1, dueDay: 1, dueAdjustment: "next", color: "caju",
    },
  ]).onConflictDoNothing();
  await db.insert(recurringEntries).values([
    {
      id: stableId(ownerId, "recurring-salary"), ownerId, description: "Salário", category: "Salário",
      account: "Nubank", amountCents: 220000, type: "income", dayOfMonth: 5, calculationMode: "fixed",
      scheduleMode: "business-day-of-month", dateAdjustment: "previous", active: true,
    },
    {
      id: stableId(ownerId, "recurring-benefit-va"), ownerId, description: "Crédito Caju VA", category: "Benefício / VA",
      account: "Caju VA", amountCents: 2500, type: "income", dayOfMonth: 5, calculationMode: "business-day",
      scheduleMode: "business-day-of-month", dateAdjustment: "previous", active: true,
    },
  ]).onConflictDoNothing();
}

async function adjustAccount(ownerId: string, name: string, deltaCents: number) {
  if (!deltaCents) return;
  const db = getDb();
  const row = (await db.select().from(accounts).where(and(eq(accounts.ownerId, ownerId), eq(accounts.name, name))).limit(1))[0];
  if (!row || row.kind === "credit-card") return;
  await db.update(accounts).set({
    balanceCents: sql`${accounts.balanceCents} + ${deltaCents}`,
    updatedAt: new Date().toISOString(),
  }).where(and(eq(accounts.ownerId, ownerId), eq(accounts.id, row.id)));
}

function balanceEffect(item: { type: string; status: string; paymentMethod: string; amountCents: number; deletedAt?: string | null }) {
  if (item.deletedAt) return 0;
  if (item.status !== "confirmed" || !["debit", "cash", "transfer"].includes(item.paymentMethod)) return 0;
  return item.type === "income" ? item.amountCents : -item.amountCents;
}

function transactionJson(row: typeof transactions.$inferSelect) {
  return {
    id: row.id, description: row.description, category: row.category, account: row.account,
    date: row.occurredAt, amount: row.amountCents / 100, type: row.type,
    paymentMethod: row.paymentMethod, cardId: row.cardId ?? undefined,
    invoiceMonth: row.invoiceMonth ?? undefined, installments: row.installments ?? undefined,
    rewardPoints: row.rewardPointsMilli == null ? undefined : row.rewardPointsMilli / 1000,
    rewardCashback: row.rewardCashbackCents == null ? undefined : row.rewardCashbackCents / 100,
    rewardUsdRate: row.rewardUsdRateMicros == null ? undefined : row.rewardUsdRateMicros / 1_000_000,
    status: row.status, source: row.source, fingerprint: row.fingerprint ?? undefined,
    version: row.version, updatedAt: row.updatedAt, deletedAt: row.deletedAt ?? undefined,
    deviceId: row.deviceId ?? undefined,
  };
}

function monthOffset(month: string, offset: number) {
  const [year, index] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, index - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function purchaseInvoiceMonth(date: string, closingDay: number) {
  const calendarMonth = date.slice(0, 7);
  const closingDate = effectiveRecurringDate(calendarMonth, closingDay, "day-of-month", "previous");
  return date > closingDate ? monthOffset(calendarMonth, 1) : calendarMonth;
}

async function materializeRecurring(ownerId: string, rows: Array<typeof recurringEntries.$inferSelect>, currentMonth: string) {
  const db = getDb();
  const reserved = new Set([stableId(ownerId, "recurring-salary"), stableId(ownerId, "recurring-benefit-va")]);
  for (const rule of rows.filter((row) => row.active && !reserved.has(row.id))) {
    for (let offset = 0; offset <= 12; offset += 1) {
      const month = monthOffset(currentMonth, offset);
      const amountCents = rule.calculationMode === "business-day" ? rule.amountCents * businessDaysInMonth(month) : rule.amountCents;
      const date = effectiveRecurringDate(month, rule.dayOfMonth, rule.scheduleMode === "business-day-of-month" ? "business-day-of-month" : "day-of-month", rule.dateAdjustment === "next" ? "next" : "previous");
      const fingerprint = `recurring:${rule.id}:${month}`;
      await db.insert(transactions).values({
        id: `${rule.id}:${month}`, ownerId, description: rule.description, category: rule.category,
        account: rule.account, occurredAt: date, amountCents, type: rule.type,
        paymentMethod: rule.paymentMethod, cardId: rule.cardId, status: "planned",
        source: "recurring", fingerprint,
      }).onConflictDoNothing();
    }
  }
}

export async function financeGetForOwner(request: Request, ownerId: string) {
  try {
    await ensureFinanceSchema();
    await seedDefaults(ownerId);
    const db = getDb();
    const month = new Date().toISOString().slice(0, 7);
    const [accountRows, categoryRows, cardRows, recurringRows] = await Promise.all([
      db.select().from(accounts).where(eq(accounts.ownerId, ownerId)).orderBy(accounts.name),
      db.select().from(categories).where(eq(categories.ownerId, ownerId)).orderBy(categories.kind, categories.name),
      db.select().from(cards).where(eq(cards.ownerId, ownerId)).orderBy(cards.name),
      db.select().from(recurringEntries).where(eq(recurringEntries.ownerId, ownerId)),
    ]);
    await materializeRecurring(ownerId, recurringRows, month);
    const transactionRows = await db.select().from(transactions).where(and(eq(transactions.ownerId, ownerId), isNull(transactions.deletedAt))).orderBy(desc(transactions.occurredAt), desc(transactions.createdAt));
    const salary = recurringRows.find((row) => row.id === stableId(ownerId, "recurring-salary"));
    const benefit = recurringRows.find((row) => row.id === stableId(ownerId, "recurring-benefit-va"));
    const specialIds = new Set([stableId(ownerId, "recurring-salary"), stableId(ownerId, "recurring-benefit-va")]);
    return Response.json({
      accounts: accountRows.map((row) => ({ id: row.id, name: row.name, institution: row.institution, kind: row.kind, balance: row.balanceCents / 100, goal: row.goalCents / 100, monthlyYieldPercent: row.monthlyYieldBasisPoints / 100, fixed: row.fixed, color: row.color })),
      categories: categoryRows,
      cards: cardRows.sort((a, b) => a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "credit" ? -1 : 1).map(cardJson),
      transactions: transactionRows.map(transactionJson),
      salaryRule: salary ? recurringJson(salary, month) : null,
      benefitRule: benefit ? recurringJson(benefit, month) : null,
      recurringRules: recurringRows.filter((row) => !specialIds.has(row.id)).map((row) => recurringJson(row, month)),
      serverTime: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Falha ao carregar os dados" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const user = await webIdentityFrom(request);
  if (!user) return unauthorized();
  return financeGetForOwner(request, user.id);
}

type RuleInput = {
  amount?: number; dayOfMonth?: number; account?: string; active?: boolean;
  calculationMode?: string; scheduleMode?: string; dateAdjustment?: string;
};

export async function financePostForOwner(request: Request, ownerId: string) {
  try {
    await ensureFinanceSchema();
    await seedDefaults(ownerId);
    const payload = await request.json() as {
      account?: { id?: string; name?: string; institution?: string; kind?: string; balance?: number; goal?: number; monthlyYieldPercent?: number; fixed?: boolean; color?: string };
      category?: { id?: string; name?: string; originalName?: string; kind?: string; color?: string; icon?: string; essential?: boolean };
      card?: { id?: string; name?: string; linkedAccount?: string; kind?: string; brand?: string; tier?: string; last4?: string; limit?: number; closingDay?: number; dueDay?: number; dueAdjustment?: string; pointsPerDollar?: number; cashbackPercent?: number; rewardMode?: string; pointsGoal?: number; manualUsdRate?: number; color?: string };
      incomeRules?: { salary?: RuleInput; benefit?: RuleInput };
      salaryRule?: RuleInput;
      confirmSalary?: { month?: string };
      recurringRule?: { id?: string; description?: string; category?: string; account?: string; amount?: number; type?: string; dayOfMonth?: number; calculationMode?: string; scheduleMode?: string; dateAdjustment?: string; paymentMethod?: PaymentMethod; cardId?: string; active?: boolean };
      payInvoice?: { id?: string; cardId?: string; invoiceMonth?: string; sourceAccount?: string; amount?: number; date?: string };
      transaction?: { id?: string; description?: string; category?: string; account?: string; date?: string; amount?: number; type?: string; paymentMethod?: PaymentMethod; cardId?: string; invoiceMonth?: string; installments?: string; status?: string; source?: string; fingerprint?: string; rewardPoints?: number; rewardCashback?: number; rewardUsdRate?: number };
    };
    const db = getDb();

    if (payload.account) {
      const item = payload.account;
      const name = item.name?.trim();
      const balance = Number(item.balance);
      const allowedKinds = ["checking", "cash", "investment", "credit-card", "benefit"];
      if (!name || !Number.isFinite(balance)) return Response.json({ error: "Conta inválida" }, { status: 400 });
      const kind = allowedKinds.includes(item.kind ?? "") ? String(item.kind) : "checking";
      const now = new Date().toISOString();
      const requestedId = item.id?.trim() || "";
      const existing = requestedId ? (await db.select().from(accounts).where(and(eq(accounts.ownerId, ownerId), eq(accounts.id, requestedId))).limit(1))[0] : null;
      const id = existing?.id ?? freshEntityId(ownerId, "account", name);
      if (!existing) {
        const duplicateName = await db.select({ id: accounts.id }).from(accounts).where(and(eq(accounts.ownerId, ownerId), eq(accounts.name, name))).limit(1);
        if (duplicateName.length) return Response.json({ error: "Já existe uma conta com este nome" }, { status: 409 });
      }
      const goal = Number(item.goal ?? 0); const monthlyYieldPercent = Number(item.monthlyYieldPercent ?? 0);
      if (!Number.isFinite(goal) || goal < 0 || !Number.isFinite(monthlyYieldPercent) || monthlyYieldPercent < 0) return Response.json({ error: "Meta ou rentabilidade inválida" }, { status: 400 });
      const values = { name, institution: item.institution?.trim() || "manual", kind, balanceCents: Math.round(balance * 100), goalCents: Math.round(goal * 100), monthlyYieldBasisPoints: Math.round(monthlyYieldPercent * 100), fixed: existing?.fixed || item.fixed === true, color: item.color?.trim() || "teal", updatedAt: now };
      if (existing) await db.update(accounts).set(values).where(and(eq(accounts.ownerId, ownerId), eq(accounts.id, existing.id)));
      else await db.insert(accounts).values({ id, ownerId, ...values });
      if (existing && existing.name !== name) {
        await Promise.all([
          db.update(transactions).set({ account: name, updatedAt: now }).where(and(eq(transactions.ownerId, ownerId), eq(transactions.account, existing.name))),
          db.update(cards).set({ linkedAccount: name, updatedAt: now }).where(and(eq(cards.ownerId, ownerId), eq(cards.linkedAccount, existing.name))),
          db.update(recurringEntries).set({ account: name, updatedAt: now }).where(and(eq(recurringEntries.ownerId, ownerId), eq(recurringEntries.account, existing.name))),
        ]);
      }
      return Response.json({ account: { id, name, institution: values.institution, kind, balance, goal, monthlyYieldPercent, fixed: values.fixed, color: values.color } });
    }

    if (payload.category) {
      const item = payload.category;
      const name = item.name?.trim();
      const kind = item.kind === "income" ? "income" : "expense";
      if (!name) return Response.json({ error: "Nome da categoria obrigatório" }, { status: 400 });
      const requestedId = item.id?.trim() || "";
      const existing = requestedId ? (await db.select().from(categories).where(and(eq(categories.ownerId, ownerId), eq(categories.id, requestedId))).limit(1))[0] : null;
      const id = existing?.id ?? freshEntityId(ownerId, "category", name);
      if (!existing) {
        const duplicateName = await db.select({ id: categories.id }).from(categories).where(and(eq(categories.ownerId, ownerId), eq(categories.name, name))).limit(1);
        if (duplicateName.length) return Response.json({ error: "Já existe uma categoria com este nome" }, { status: 409 });
      }
      const values = { name, kind, color: item.color?.trim() || (kind === "income" ? "green" : "teal"), icon: item.icon?.trim() || "circle", essential: kind === "expense" && item.essential === true };
      if (existing) await db.update(categories).set(values).where(and(eq(categories.ownerId, ownerId), eq(categories.id, existing.id)));
      else await db.insert(categories).values({ id, ownerId, ...values });
      if (existing && existing.name !== name) {
        await db.update(transactions).set({ category: name, updatedAt: new Date().toISOString() }).where(and(eq(transactions.ownerId, ownerId), eq(transactions.category, existing.name)));
      }
      return Response.json({ category: { id, ...values } });
    }

    if (payload.card) {
      const item = payload.card;
      const name = item.name?.trim();
      const linkedAccount = item.linkedAccount?.trim();
      const limit = Number(item.limit ?? 0);
      const closingDay = Math.trunc(Number(item.closingDay ?? 1));
      const dueDay = Math.trunc(Number(item.dueDay ?? 8));
      if (!name || !linkedAccount || !Number.isFinite(limit) || limit < 0 || closingDay < 1 || closingDay > 31 || dueDay < 1 || dueDay > 31) {
        return Response.json({ error: "Configuração de cartão inválida" }, { status: 400 });
      }
      const linked = (await db.select({ id: accounts.id }).from(accounts).where(and(eq(accounts.ownerId, ownerId), eq(accounts.name, linkedAccount))).limit(1))[0];
      if (!linked) return Response.json({ error: "A conta vinculada não pertence a este usuário" }, { status: 400 });
      const requestedId = item.id?.trim() || "";
      const existing = requestedId ? (await db.select().from(cards).where(and(eq(cards.ownerId, ownerId), eq(cards.id, requestedId))).limit(1))[0] : null;
      const id = existing?.id ?? freshEntityId(ownerId, "card", name);
      if (!existing) {
        const duplicateName = await db.select({ id: cards.id }).from(cards).where(and(eq(cards.ownerId, ownerId), eq(cards.name, name))).limit(1);
        if (duplicateName.length) return Response.json({ error: "Já existe um cartão com este nome" }, { status: 409 });
      }
      const now = new Date().toISOString();
      const values = {
        name, linkedAccount, kind: item.kind === "debit" ? "debit" : "credit",
        brand: item.brand?.trim() || "Mastercard", tier: item.tier?.trim() || "Black",
        last4: (item.last4?.replace(/\D/g, "").slice(-4) || "0000").padStart(4, "0"),
        limitCents: Math.round(limit * 100), closingDay, dueDay,
        dueAdjustment: item.dueAdjustment === "previous" ? "previous" : "next",
        pointsPerDollarMilli: Math.round(Math.max(0, Number(item.pointsPerDollar ?? 0)) * 1000),
        cashbackBasisPoints: Math.round(Math.max(0, Number(item.cashbackPercent ?? 0)) * 100),
        rewardMode: ["points", "cashback", "both"].includes(item.rewardMode ?? "") ? String(item.rewardMode) : "none",
        pointsGoal: Math.max(0, Math.trunc(Number(item.pointsGoal ?? 0))),
        manualUsdRateMicros: Math.round(Math.max(0, Number(item.manualUsdRate ?? 0)) * 1_000_000),
        color: item.color?.trim() || "black", updatedAt: now,
      };
      if (existing) await db.update(cards).set(values).where(and(eq(cards.ownerId, ownerId), eq(cards.id, existing.id)));
      else await db.insert(cards).values({ id, ownerId, ...values });
      const saved = (await db.select().from(cards).where(and(eq(cards.ownerId, ownerId), eq(cards.id, id))).limit(1))[0];
      return Response.json({ card: cardJson(saved) });
    }

    if (payload.recurringRule) {
      const item = payload.recurringRule; const description = item.description?.trim(); const category = item.category?.trim(); const account = item.account?.trim(); const amount = Number(item.amount); const dayOfMonth = Math.trunc(Number(item.dayOfMonth)); const type = item.type === "income" ? "income" : "expense";
      if (!description || !category || !account || !Number.isFinite(amount) || amount <= 0 || dayOfMonth < 1 || dayOfMonth > 31) return Response.json({ error: "Recorrência inválida" }, { status: 400 });
      const paymentMethod = ["credit", "debit", "cash", "transfer"].includes(item.paymentMethod ?? "") ? String(item.paymentMethod) : "transfer";
      let resolvedAccount = account;
      let resolvedCardId: string | null = null;
      if (paymentMethod === "credit") {
        const ownerCard = item.cardId ? (await db.select().from(cards).where(and(eq(cards.ownerId, ownerId), eq(cards.id, item.cardId.trim()), eq(cards.kind, "credit"))).limit(1))[0] : null;
        if (!ownerCard) return Response.json({ error: "Selecione um cartão de crédito válido" }, { status: 400 });
        resolvedAccount = ownerCard.linkedAccount;
        resolvedCardId = ownerCard.id;
      } else {
        const ownerAccount = (await db.select({ id: accounts.id }).from(accounts).where(and(eq(accounts.ownerId, ownerId), eq(accounts.name, account))).limit(1))[0];
        if (!ownerAccount) return Response.json({ error: "Selecione uma conta válida" }, { status: 400 });
      }
      const requestedId = item.id?.trim() || "";
      const existing = requestedId ? (await db.select().from(recurringEntries).where(and(eq(recurringEntries.ownerId, ownerId), eq(recurringEntries.id, requestedId))).limit(1))[0] : null;
      const id = existing?.id ?? freshEntityId(ownerId, "recurring", description);
      const values = { description, category, account: resolvedAccount, amountCents: Math.round(amount * 100), type, dayOfMonth, calculationMode: item.calculationMode === "business-day" ? "business-day" : "fixed", scheduleMode: item.scheduleMode === "business-day-of-month" ? "business-day-of-month" : "day-of-month", dateAdjustment: item.dateAdjustment === "next" ? "next" : "previous", paymentMethod, cardId: resolvedCardId, active: item.active !== false, updatedAt: new Date().toISOString() };
      if (existing) await db.update(recurringEntries).set(values).where(and(eq(recurringEntries.ownerId, ownerId), eq(recurringEntries.id, existing.id)));
      else await db.insert(recurringEntries).values({ id, ownerId, ...values });
      const row = (await db.select().from(recurringEntries).where(and(eq(recurringEntries.ownerId, ownerId), eq(recurringEntries.id, id))).limit(1))[0];
      await materializeRecurring(ownerId, [row], new Date().toISOString().slice(0, 7));
      return Response.json({ recurringRule: recurringJson(row, new Date().toISOString().slice(0, 7)) });
    }

    if (payload.incomeRules || payload.salaryRule) {
      const salaryInput = payload.incomeRules?.salary ?? payload.salaryRule;
      const benefitInput = payload.incomeRules?.benefit;
      const now = new Date().toISOString();
      const saveRule = async (kind: "salary" | "benefit", item: RuleInput | undefined) => {
        if (!item) return null;
        const amount = Number(item.amount);
        const dayOfMonth = Math.trunc(Number(item.dayOfMonth));
        if (!Number.isFinite(amount) || amount <= 0 || dayOfMonth < 1 || dayOfMonth > 31) throw new Error("Regra de receita inválida");
        const id = stableId(ownerId, kind === "salary" ? "recurring-salary" : "recurring-benefit-va");
        const base = kind === "salary"
          ? { description: "Salário", category: "Salário", account: item.account?.trim() || "Nubank", calculationMode: "fixed" }
          : { description: "Crédito Caju VA", category: "Benefício / VA", account: item.account?.trim() || "Caju VA", calculationMode: "business-day" };
        const values = {
          ...base, amountCents: Math.round(amount * 100), type: "income", dayOfMonth,
          scheduleMode: item.scheduleMode === "day-of-month" ? "day-of-month" : "business-day-of-month",
          dateAdjustment: item.dateAdjustment === "next" ? "next" : "previous",
          active: item.active !== false, updatedAt: now,
        };
        await db.insert(recurringEntries).values({ id, ownerId, ...values }).onConflictDoUpdate({ target: recurringEntries.id, set: values });
        return (await db.select().from(recurringEntries).where(and(eq(recurringEntries.ownerId, ownerId), eq(recurringEntries.id, id))).limit(1))[0];
      };
      const [salaryRow, benefitRow] = await Promise.all([saveRule("salary", salaryInput), saveRule("benefit", benefitInput)]);
      const month = new Date().toISOString().slice(0, 7);
      return Response.json({
        salaryRule: salaryRow ? recurringJson(salaryRow, month) : null,
        benefitRule: benefitRow ? recurringJson(benefitRow, month) : null,
      });
    }

    if (payload.confirmSalary) {
      const month = payload.confirmSalary.month?.trim() || "";
      if (!/^\d{4}-\d{2}$/.test(month)) return Response.json({ error: "Mês inválido" }, { status: 400 });
      const ruleRows = await db.select().from(recurringEntries).where(eq(recurringEntries.ownerId, ownerId));
      const selected = ruleRows.filter((row) => [stableId(ownerId, "recurring-salary"), stableId(ownerId, "recurring-benefit-va")].includes(row.id) && row.active);
      if (!selected.length) return Response.json({ error: "Receitas recorrentes não configuradas" }, { status: 404 });
      const created = [] as Array<Record<string, unknown>>;
      const balanceChanges = [] as Array<{ account: string; amount: number }>;
      for (const rule of selected) {
        const amountCents = rule.calculationMode === "business-day" ? rule.amountCents * businessDaysInMonth(month) : rule.amountCents;
        const date = effectiveRecurringDate(month, rule.dayOfMonth, rule.scheduleMode === "business-day-of-month" ? "business-day-of-month" : "day-of-month", rule.dateAdjustment === "next" ? "next" : "previous");
        const fingerprint = `recurring:${rule.id}:${month}`;
        const existing = await db.select({ id: transactions.id }).from(transactions).where(and(eq(transactions.ownerId, ownerId), eq(transactions.fingerprint, fingerprint))).limit(1);
        const transactionId = `${rule.id}:${month}`;
        if (!existing.length) {
          await db.insert(transactions).values({
            id: transactionId, ownerId, description: rule.description, category: rule.category,
            account: rule.account, occurredAt: date, amountCents, type: "income", paymentMethod: "transfer",
            status: "confirmed", source: "recurring", fingerprint,
          });
          await adjustAccount(ownerId, rule.account, amountCents);
          balanceChanges.push({ account: rule.account, amount: amountCents / 100 });
        }
        await db.update(recurringEntries).set({ lastConfirmedMonth: month, updatedAt: new Date().toISOString() }).where(and(eq(recurringEntries.ownerId, ownerId), eq(recurringEntries.id, rule.id)));
        created.push({ id: transactionId, description: rule.description, category: rule.category, account: rule.account, date, amount: amountCents / 100, type: "income", paymentMethod: "transfer", status: "confirmed", source: "recurring", fingerprint });
      }
      const refreshed = await db.select().from(recurringEntries).where(eq(recurringEntries.ownerId, ownerId));
      const salary = refreshed.find((row) => row.id === stableId(ownerId, "recurring-salary"));
      const benefit = refreshed.find((row) => row.id === stableId(ownerId, "recurring-benefit-va"));
      return Response.json({ transactions: created, salaryRule: salary ? recurringJson(salary, month) : null, benefitRule: benefit ? recurringJson(benefit, month) : null, balanceChanges });
    }

    if (payload.payInvoice) {
      const item = payload.payInvoice; const cardId = item.cardId?.trim() || ""; const invoiceMonth = item.invoiceMonth?.trim() || ""; const sourceAccount = item.sourceAccount?.trim() || "";
      if (!cardId || !/^\d{4}-\d{2}$/.test(invoiceMonth) || !sourceAccount) return Response.json({ error: "Dados do pagamento inválidos" }, { status: 400 });
      const card = (await db.select().from(cards).where(and(eq(cards.ownerId, ownerId), eq(cards.id, cardId))).limit(1))[0];
      const account = (await db.select().from(accounts).where(and(eq(accounts.ownerId, ownerId), eq(accounts.name, sourceAccount))).limit(1))[0];
      if (!card || card.kind !== "credit") return Response.json({ error: "Cartão de crédito não encontrado" }, { status: 404 });
      if (!account || account.kind === "credit-card") return Response.json({ error: "Conta de pagamento inválida" }, { status: 404 });
      const allRows = await db.select().from(transactions).where(and(eq(transactions.ownerId, ownerId), isNull(transactions.deletedAt)));
      const cardRows = allRows.filter((row) => row.cardId === cardId || row.account === card.linkedAccount);
      const monthRows = cardRows.filter((row) => (row.invoiceMonth ?? row.occurredAt.slice(0, 7)) === invoiceMonth && row.status === "confirmed");
      const grossCents = monthRows.filter((row) => row.type === "expense" && (row.paymentMethod === "credit" || row.account === card.linkedAccount)).reduce((sum, row) => sum + row.amountCents, 0);
      const alreadyPaidCents = monthRows.filter((row) => row.type === "transfer" && row.source === "invoice-payment").reduce((sum, row) => sum + row.amountCents, 0);
      const remainingCents = Math.max(0, grossCents - alreadyPaidCents); const requestedCents = item.amount == null ? remainingCents : Math.round(Number(item.amount) * 100);
      if (!Number.isFinite(requestedCents) || requestedCents <= 0 || requestedCents > remainingCents) return Response.json({ error: "Valor maior que o saldo restante da fatura" }, { status: 400 });
      if (account.balanceCents < requestedCents) return Response.json({ error: "Saldo insuficiente na conta selecionada" }, { status: 400 });
      const id = item.id?.trim() || `invoice-payment:${cardId}:${invoiceMonth}:${Date.now()}`;
      const existing = await db.select({ id: transactions.id }).from(transactions).where(and(eq(transactions.ownerId, ownerId), eq(transactions.id, id))).limit(1);
      if (existing.length) return Response.json({ error: "Este pagamento já foi registrado" }, { status: 409 });
      const foreignId = await db.select({ ownerId: transactions.ownerId }).from(transactions).where(eq(transactions.id, id)).limit(1);
      if (foreignId.length) return Response.json({ error: "Identificador de pagamento indisponível" }, { status: 409 });
      const date = item.date?.trim() || new Date().toISOString().slice(0, 10);
      await db.insert(transactions).values({ id, ownerId, description: `Pagamento da fatura ${card.name}`, category: "Pagamento de fatura", account: sourceAccount, occurredAt: date, amountCents: requestedCents, type: "transfer", paymentMethod: "transfer", cardId, invoiceMonth, status: "confirmed", source: "invoice-payment", fingerprint: `invoice-payment:${id}` });
      await adjustAccount(ownerId, sourceAccount, -requestedCents);
      const saved = (await db.select().from(transactions).where(and(eq(transactions.ownerId, ownerId), eq(transactions.id, id))).limit(1))[0];
      return Response.json({ transaction: transactionJson(saved), remaining: (remainingCents - requestedCents) / 100, balance: (account.balanceCents - requestedCents) / 100 }, { status: 201 });
    }

    const item = payload.transaction;
    if (!item?.id || !item.description?.trim() || !item.date || !Number.isFinite(item.amount) || Number(item.amount) <= 0) {
      return Response.json({ error: "Lançamento inválido" }, { status: 400 });
    }
    if (!["income", "expense", "transfer"].includes(item.type ?? "")) return Response.json({ error: "Tipo de lançamento inválido" }, { status: 400 });
    const transactionType = item.type as TransactionType;
    let previous = (await db.select().from(transactions).where(and(eq(transactions.id, item.id), eq(transactions.ownerId, ownerId))).limit(1))[0];
    if (!previous) {
      const idOwner = (await db.select({ ownerId: transactions.ownerId }).from(transactions).where(eq(transactions.id, item.id)).limit(1))[0];
      if (idOwner && idOwner.ownerId !== ownerId) return Response.json({ error: "Identificador de lançamento indisponível" }, { status: 409 });
    }
    let transactionId = item.id;
    const importFingerprint = scopedImportFingerprint(item);
    if (!previous && item.source === "import" && importFingerprint) {
      const duplicate = (await db.select().from(transactions).where(and(eq(transactions.ownerId, ownerId), eq(transactions.fingerprint, importFingerprint))).limit(1))[0];
      if (duplicate) { previous = duplicate; transactionId = duplicate.id; }
    }
    const paymentMethod = ["credit", "debit", "cash", "transfer"].includes(item.paymentMethod ?? "") ? String(item.paymentMethod) : "other";
    let resolvedAccount = item.account?.trim() || "Nubank";
    let resolvedCardId = item.cardId?.trim() || null;
    let resolvedInvoiceMonth = /^\d{4}-\d{2}$/.test(item.invoiceMonth?.trim() || "") ? item.invoiceMonth!.trim() : null;
    if (transactionType === "expense" && (paymentMethod === "credit" || resolvedCardId)) {
      const ownerCards = await db.select().from(cards).where(eq(cards.ownerId, ownerId));
      const selectedCard = ownerCards.find((card) => card.id === resolvedCardId)
        ?? ownerCards.find((card) => card.linkedAccount === resolvedAccount && card.kind === paymentMethod)
        ?? (paymentMethod === "credit" && ownerCards.filter((card) => card.kind === "credit").length === 1 ? ownerCards.find((card) => card.kind === "credit") : undefined);
      if (paymentMethod === "credit" && (!selectedCard || selectedCard.kind !== "credit")) return Response.json({ error: "Selecione o cartão de crédito usado na compra" }, { status: 400 });
      if (selectedCard) {
        resolvedAccount = selectedCard.linkedAccount;
        resolvedCardId = selectedCard.id;
        resolvedInvoiceMonth = selectedCard.kind === "credit" ? resolvedInvoiceMonth ?? purchaseInvoiceMonth(item.date, selectedCard.closingDay) : null;
      }
    }
    const now = new Date().toISOString();
    const values = {
      description: item.description.trim(), category: item.category?.trim() || "Outros",
      account: resolvedAccount, occurredAt: item.date,
      amountCents: Math.round(Number(item.amount) * 100), type: transactionType,
      paymentMethod, cardId: resolvedCardId,
      invoiceMonth: resolvedInvoiceMonth,
      rewardPointsMilli: item.rewardPoints == null ? previous?.rewardPointsMilli ?? null : Math.round(Math.max(0, Number(item.rewardPoints)) * 1000),
      rewardCashbackCents: item.rewardCashback == null ? previous?.rewardCashbackCents ?? null : Math.round(Math.max(0, Number(item.rewardCashback)) * 100),
      rewardUsdRateMicros: item.rewardUsdRate == null ? previous?.rewardUsdRateMicros ?? null : Math.round(Math.max(0, Number(item.rewardUsdRate)) * 1_000_000),
      installments: item.installments?.trim() || null, status: item.status === "planned" ? "planned" : "confirmed",
      source: ["import", "recurring", "invoice-payment"].includes(item.source ?? "") ? String(item.source) : "manual",
      fingerprint: importFingerprint || null, version: (previous?.version ?? 0) + 1,
      deletedAt: null, deviceId: "web", lastMutationId: null, updatedAt: now,
    };
    await db.insert(transactions).values({ id: transactionId, ownerId, ...values }).onConflictDoUpdate({ target: transactions.id, set: values });
    if (previous) await adjustAccount(ownerId, previous.account, -balanceEffect(previous));
    await adjustAccount(ownerId, values.account, balanceEffect(values));
    const saved = (await db.select().from(transactions).where(and(eq(transactions.ownerId, ownerId), eq(transactions.id, transactionId))).limit(1))[0];
    return Response.json({ transaction: transactionJson(saved), updatedDuplicate: transactionId !== item.id }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao salvar os dados";
    if (message.includes("transactions_owner_fingerprint_idx")) return Response.json({ ok: true, duplicate: true });
    if (/accounts_owner_name_idx|categories_owner_name_idx|cards_owner_name_idx/.test(message)) return Response.json({ error: "Já existe um item com este nome" }, { status: 409 });
    return Response.json({ error: message }, { status: message === "Regra de receita inválida" ? 400 : 500 });
  }
}

export async function POST(request: Request) {
  const user = await webIdentityFrom(request);
  if (!user) return unauthorized();
  return financePostForOwner(request, user.id);
}

export async function financeDeleteForOwner(request: Request, ownerId: string) {
  try {
    await ensureFinanceSchema();
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (!id) return Response.json({ error: "ID obrigatório" }, { status: 400 });
    const db = getDb();
    if (url.searchParams.get("entity") === "account") {
      const account = (await db.select().from(accounts).where(and(eq(accounts.id, id), eq(accounts.ownerId, ownerId))).limit(1))[0];
      if (!account) return Response.json({ ok: true });
      if (account.fixed) return Response.json({ error: "A conta fixa de reserva não pode ser excluída" }, { status: 409 });
      const [linkedTransaction, linkedCard, linkedRule] = await Promise.all([
        db.select({ id: transactions.id }).from(transactions).where(and(eq(transactions.ownerId, ownerId), eq(transactions.account, account.name), isNull(transactions.deletedAt))).limit(1),
        db.select({ id: cards.id }).from(cards).where(and(eq(cards.ownerId, ownerId), eq(cards.linkedAccount, account.name))).limit(1),
        db.select({ id: recurringEntries.id }).from(recurringEntries).where(and(eq(recurringEntries.ownerId, ownerId), eq(recurringEntries.account, account.name))).limit(1),
      ]);
      if (linkedTransaction.length || linkedCard.length || linkedRule.length) {
        return Response.json({ error: "Esta conta possui lançamentos, cartões ou recorrências vinculados. Realoque-os antes de excluir." }, { status: 409 });
      }
      await db.delete(accounts).where(and(eq(accounts.ownerId, ownerId), eq(accounts.id, id)));
      return Response.json({ ok: true });
    }
    const existing = (await db.select().from(transactions).where(and(eq(transactions.id, id), eq(transactions.ownerId, ownerId))).limit(1))[0];
    if (existing && !existing.deletedAt) {
      await adjustAccount(ownerId, existing.account, -balanceEffect(existing));
      await db.update(transactions).set({
        deletedAt: new Date().toISOString(), version: existing.version + 1,
        deviceId: "web", lastMutationId: null, updatedAt: new Date().toISOString(),
      }).where(and(eq(transactions.id, id), eq(transactions.ownerId, ownerId)));
    }
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Falha ao remover o lançamento" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const user = await webIdentityFrom(request);
  if (!user) return unauthorized();
  return financeDeleteForOwner(request, user.id);
}
