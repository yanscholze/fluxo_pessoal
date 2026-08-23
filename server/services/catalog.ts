/**
 * Serviço de cadastros: contas, categorias e cartões.
 *
 * Renomear é um `UPDATE` numa linha. Na versão anterior, mudar o nome de uma
 * conta disparava cascata por cinco tabelas, porque o nome **era** a chave
 * estrangeira — e qualquer falha no meio deixava lançamentos apontando para
 * uma conta que não existia mais.
 */

import { and, count, eq, isNull, max } from "drizzle-orm";

import { SUPPORTED_CURRENCIES, type AccountKind, type CurrencyCode } from "../../core/domain/account/types.ts";
import { assertValidCycle } from "../../core/domain/card/invoice-cycle.ts";
import { conflict, duplicate, notFound, validationError } from "../../core/kernel/errors.ts";
import { newId } from "../../core/kernel/id.ts";
import type { Cents } from "../../core/kernel/money.ts";
import { type LocalDate, todayIn } from "../../core/time/local-date.ts";
import { getDatabase } from "../db/client.ts";
import { accounts, cards, categories, ledgerEntries, recurrences, transactions } from "../db/schema/index.ts";

// ---------------------------------------------------------------------------
// Contas
// ---------------------------------------------------------------------------

export type AccountInput = {
  readonly name: string;
  readonly kind: AccountKind;
  readonly institution?: string | null;
  readonly currency?: string | null;
  readonly openingBalance?: Cents | null;
  readonly openedOn?: LocalDate | null;
  readonly goalAmount?: Cents | null;
  readonly monthlyYieldBasisPoints?: number | null;
  readonly includeInTotals?: boolean;
  readonly color?: string | null;
};

function assertCurrency(value: string | null | undefined): CurrencyCode {
  const code = (value ?? "BRL").toUpperCase();
  if (!(SUPPORTED_CURRENCIES as readonly string[]).includes(code)) {
    throw validationError("Moeda não suportada", [{ path: "currency", message: `Use uma de: ${SUPPORTED_CURRENCIES.join(", ")}` }]);
  }
  return code as CurrencyCode;
}

export async function createAccount(userId: string, input: AccountInput, now: Date = new Date()): Promise<string> {
  const database = getDatabase();
  const id = newId(now.getTime());

  const [existing] = await database
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.name, input.name)))
    .limit(1);
  if (existing) throw duplicate("Já existe uma conta com este nome");

  const [order] = await database
    .select({ value: max(accounts.sortOrder) })
    .from(accounts)
    .where(eq(accounts.userId, userId));

  await database.insert(accounts).values({
    id,
    userId,
    name: input.name,
    institution: input.institution ?? "manual",
    kind: input.kind,
    currency: assertCurrency(input.currency),
    openingBalanceCents: (input.openingBalance ?? 0) as number,
    openedOn: (input.openedOn ?? todayIn(now)) as string,
    goalCents: (input.goalAmount ?? null) as number | null,
    monthlyYieldBasisPoints: input.monthlyYieldBasisPoints ?? 0,
    includeInTotals: input.includeInTotals ?? true,
    color: input.color ?? "#6b7280",
    sortOrder: (order?.value ?? -1) + 1,
  });

  return id;
}

export async function updateAccount(
  userId: string,
  accountId: string,
  input: Partial<AccountInput>,
  now: Date = new Date(),
): Promise<void> {
  const database = getDatabase();
  const [existing] = await database
    .select()
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.id, accountId)))
    .limit(1);
  if (!existing) throw notFound("Conta", accountId);

  await database
    .update(accounts)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.institution !== undefined ? { institution: input.institution ?? "manual" } : {}),
      ...(input.kind !== undefined ? { kind: input.kind } : {}),
      ...(input.currency !== undefined ? { currency: assertCurrency(input.currency) } : {}),
      ...(input.openingBalance !== undefined ? { openingBalanceCents: input.openingBalance as number } : {}),
      ...(input.goalAmount !== undefined ? { goalCents: input.goalAmount as number | null } : {}),
      ...(input.monthlyYieldBasisPoints !== undefined
        ? { monthlyYieldBasisPoints: input.monthlyYieldBasisPoints ?? 0 }
        : {}),
      ...(input.includeInTotals !== undefined ? { includeInTotals: input.includeInTotals } : {}),
      ...(input.color !== undefined ? { color: input.color ?? "#6b7280" } : {}),
      updatedAt: now.toISOString(),
    })
    .where(and(eq(accounts.userId, userId), eq(accounts.id, accountId)));
}

/**
 * Arquiva uma conta.
 *
 * Conta com histórico **não** é apagada: apagar reescreveria o passado, e o
 * saldo de meses anteriores deixaria de fechar. Arquivar tira da tela e dos
 * totais, preservando o razão.
 */
export async function archiveAccount(userId: string, accountId: string, now: Date = new Date()): Promise<"archived" | "deleted"> {
  const database = getDatabase();
  const [existing] = await database
    .select()
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.id, accountId)))
    .limit(1);
  if (!existing) throw notFound("Conta", accountId);
  if (existing.isProtected) throw conflict("Esta conta está protegida contra exclusão");

  const [{ total } = { total: 0 }] = await database
    .select({ total: count() })
    .from(ledgerEntries)
    .where(and(eq(ledgerEntries.userId, userId), eq(ledgerEntries.accountId, accountId)));

  if (total > 0) {
    await database
      .update(accounts)
      .set({ archivedAt: now.toISOString(), updatedAt: now.toISOString() })
      .where(and(eq(accounts.userId, userId), eq(accounts.id, accountId)));
    return "archived";
  }

  const [{ total: linked } = { total: 0 }] = await database
    .select({ total: count() })
    .from(cards)
    .where(and(eq(cards.userId, userId), eq(cards.paymentAccountId, accountId)));
  if (linked > 0) throw conflict("Há cartões que pagam a fatura por esta conta");

  await database.delete(accounts).where(and(eq(accounts.userId, userId), eq(accounts.id, accountId)));
  return "deleted";
}

// ---------------------------------------------------------------------------
// Categorias
// ---------------------------------------------------------------------------

export type CategoryInput = {
  readonly name: string;
  readonly kind: "expense" | "income";
  readonly parentId?: string | null;
  readonly color?: string | null;
  readonly icon?: string | null;
  readonly isEssential?: boolean;
  readonly excludeFromFreeToSpend?: boolean;
};

export async function createCategory(userId: string, input: CategoryInput, now: Date = new Date()): Promise<string> {
  const database = getDatabase();

  const [existing] = await database
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.userId, userId), eq(categories.name, input.name), eq(categories.kind, input.kind)))
    .limit(1);
  if (existing) throw duplicate("Já existe uma categoria com este nome neste fluxo");

  if (input.parentId) {
    const [parent] = await database
      .select({ id: categories.id, kind: categories.kind })
      .from(categories)
      .where(and(eq(categories.userId, userId), eq(categories.id, input.parentId)))
      .limit(1);
    if (!parent) throw notFound("Categoria pai", input.parentId);
    if (parent.kind !== input.kind) throw conflict("A subcategoria precisa ter o mesmo fluxo da categoria pai");
  }

  const id = newId(now.getTime());
  const [order] = await database
    .select({ value: max(categories.sortOrder) })
    .from(categories)
    .where(eq(categories.userId, userId));

  await database.insert(categories).values({
    id,
    userId,
    name: input.name,
    kind: input.kind,
    parentId: input.parentId ?? null,
    color: input.color ?? "#6b7280",
    icon: input.icon ?? "tag",
    // "Essencial" só faz sentido para gasto: alimenta a reserva de emergência.
    isEssential: input.kind === "expense" ? (input.isEssential ?? false) : false,
    excludeFromFreeToSpend: input.excludeFromFreeToSpend ?? false,
    sortOrder: (order?.value ?? -1) + 1,
  });

  return id;
}

export async function archiveCategory(userId: string, categoryId: string, now: Date = new Date()): Promise<void> {
  const database = getDatabase();

  const [{ total } = { total: 0 }] = await database
    .select({ total: count() })
    .from(transactions)
    .where(
      and(eq(transactions.userId, userId), eq(transactions.categoryId, categoryId), isNull(transactions.deletedAt)),
    );

  if (total > 0) {
    await database
      .update(categories)
      .set({ archivedAt: now.toISOString(), updatedAt: now.toISOString() })
      .where(and(eq(categories.userId, userId), eq(categories.id, categoryId)));
    return;
  }

  await database.delete(categories).where(and(eq(categories.userId, userId), eq(categories.id, categoryId)));
}

// ---------------------------------------------------------------------------
// Cartões
// ---------------------------------------------------------------------------

export type CardInput = {
  readonly name: string;
  readonly kind: "credit" | "debit";
  readonly paymentAccountId: string;
  readonly closingDay: number;
  readonly dueDay: number;
  readonly dueAdjustment?: "previous" | "next";
  readonly limit?: Cents | null;
  readonly brand?: string | null;
  readonly tier?: string | null;
  readonly last4?: string | null;
  readonly color?: string | null;
  readonly isPrimary?: boolean;
  readonly rewardMode?: "none" | "points" | "cashback" | "both";
  readonly pointsPerDollarMilli?: number | null;
  readonly cashbackBasisPoints?: number | null;
  readonly pointsGoal?: number | null;
  readonly manualUsdRateMicros?: number | null;
};

export async function createCard(userId: string, input: CardInput, now: Date = new Date()): Promise<string> {
  const database = getDatabase();

  assertValidCycle({
    closingDay: input.closingDay,
    dueDay: input.dueDay,
    dueAdjustment: input.dueAdjustment ?? "next",
  });

  const [account] = await database
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.id, input.paymentAccountId)))
    .limit(1);
  if (!account) throw notFound("Conta de pagamento", input.paymentAccountId);

  const [existing] = await database
    .select({ id: cards.id })
    .from(cards)
    .where(and(eq(cards.userId, userId), eq(cards.name, input.name)))
    .limit(1);
  if (existing) throw duplicate("Já existe um cartão com este nome");

  const id = newId(now.getTime());
  const [order] = await database.select({ value: max(cards.sortOrder) }).from(cards).where(eq(cards.userId, userId));
  const [{ total } = { total: 0 }] = await database
    .select({ total: count() })
    .from(cards)
    .where(and(eq(cards.userId, userId), eq(cards.kind, "credit")));

  // O primeiro cartão de crédito vira o principal: é ele que define a janela
  // do "livre para gastar", e essa escolha precisa ser explícita desde o
  // começo, não adivinhada depois.
  const isPrimary = input.isPrimary ?? (input.kind === "credit" && total === 0);
  if (isPrimary) await clearPrimary(userId, now);

  await database.insert(cards).values({
    id,
    userId,
    paymentAccountId: input.paymentAccountId,
    name: input.name,
    kind: input.kind,
    brand: input.brand ?? "",
    tier: input.tier ?? "",
    last4: (input.last4 ?? "").replace(/\D/g, "").slice(-4),
    limitCents: (input.limit ?? 0) as number,
    closingDay: input.closingDay,
    dueDay: input.dueDay,
    dueAdjustment: input.dueAdjustment ?? "next",
    rewardMode: input.rewardMode ?? "none",
    pointsPerDollarMilli: input.pointsPerDollarMilli ?? 0,
    cashbackBasisPoints: input.cashbackBasisPoints ?? 0,
    pointsGoal: input.pointsGoal ?? 0,
    manualUsdRateMicros: input.manualUsdRateMicros ?? 0,
    color: input.color ?? "#6b7280",
    isPrimary,
    sortOrder: (order?.value ?? -1) + 1,
  });

  return id;
}

async function clearPrimary(userId: string, now: Date): Promise<void> {
  await getDatabase()
    .update(cards)
    .set({ isPrimary: false, updatedAt: now.toISOString() })
    .where(and(eq(cards.userId, userId), eq(cards.isPrimary, true)));
}

/** Define qual cartão define a janela do "livre para gastar". */
export async function setPrimaryCard(userId: string, cardId: string, now: Date = new Date()): Promise<void> {
  const database = getDatabase();
  const [card] = await database
    .select({ id: cards.id, kind: cards.kind })
    .from(cards)
    .where(and(eq(cards.userId, userId), eq(cards.id, cardId)))
    .limit(1);
  if (!card) throw notFound("Cartão", cardId);
  if (card.kind !== "credit") throw conflict("Só um cartão de crédito pode ser o principal");

  await clearPrimary(userId, now);
  await database
    .update(cards)
    .set({ isPrimary: true, updatedAt: now.toISOString() })
    .where(and(eq(cards.userId, userId), eq(cards.id, cardId)));
}

export async function archiveCard(userId: string, cardId: string, now: Date = new Date()): Promise<void> {
  const database = getDatabase();

  const [{ total } = { total: 0 }] = await database
    .select({ total: count() })
    .from(recurrences)
    .where(and(eq(recurrences.userId, userId), eq(recurrences.cardId, cardId), eq(recurrences.isActive, true)));
  if (total > 0) throw conflict("Há recorrências ativas neste cartão. Ajuste-as antes de arquivar.");

  await database
    .update(cards)
    .set({ archivedAt: now.toISOString(), isPrimary: false, updatedAt: now.toISOString() })
    .where(and(eq(cards.userId, userId), eq(cards.id, cardId)));
}

/**
 * Cadastro inicial de um usuário novo.
 *
 * Uma tela vazia não ensina nada. Estas categorias cobrem o gasto comum de
 * quem está começando e podem ser renomeadas ou apagadas à vontade.
 */
export async function seedDefaults(userId: string, now: Date = new Date()): Promise<void> {
  const padroes: CategoryInput[] = [
    { name: "Moradia", kind: "expense", isEssential: true, color: "#7c5cff" },
    { name: "Alimentação", kind: "expense", isEssential: true, color: "#0d9f6e" },
    { name: "Transporte", kind: "expense", isEssential: true, color: "#38bdf8" },
    { name: "Saúde", kind: "expense", isEssential: true, color: "#dc2b3d" },
    { name: "Lazer", kind: "expense", color: "#fb923c" },
    { name: "Compras", kind: "expense", color: "#c77700" },
    { name: "Assinaturas", kind: "expense", color: "#8f8f9c" },
    { name: "Salário", kind: "income", color: "#0d9f6e" },
    { name: "Outras entradas", kind: "income", color: "#38bdf8" },
  ];

  for (const categoria of padroes) {
    await createCategory(userId, categoria, now).catch(() => undefined);
  }
}
