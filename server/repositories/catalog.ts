/**
 * Repositório de cadastros: contas, categorias e cartões.
 *
 * Toda função recebe `userId` e filtra por ele. Não existe consulta sem dono —
 * é assim que a autorização deixa de depender de disciplina de quem escreve o
 * serviço.
 */

import { and, asc, eq, isNull } from "drizzle-orm";

import type { Account } from "../../core/domain/account/types.ts";
import type { PositionCard } from "../../core/domain/position/financial-position.ts";
import { getDatabase } from "../db/client.ts";
import { accounts, cards, categories } from "../db/schema/index.ts";
import { toAccount, toPositionCard } from "./mappers.ts";

export type CategoryRecord = {
  readonly id: string;
  readonly name: string;
  readonly kind: "expense" | "income";
  readonly parentId: string | null;
  readonly color: string;
  readonly icon: string;
  readonly isEssential: boolean;
  readonly excludeFromFreeToSpend: boolean;
  readonly sortOrder: number;
};

export type CardRecord = PositionCard & {
  readonly userId: string;
  readonly name: string;
  readonly paymentAccountId: string;
  readonly brand: string;
  readonly tier: string;
  readonly last4: string;
  readonly limitCents: number;
  readonly rewardMode: "none" | "points" | "cashback" | "both";
  readonly pointsPerDollarMilli: number;
  readonly cashbackBasisPoints: number;
  readonly pointsGoal: number;
  readonly manualUsdRateMicros: number;
  readonly color: string;
  readonly imageUrl: string | null;
};

export async function listAccounts(userId: string, options: { includeArchived?: boolean } = {}): Promise<Account[]> {
  const database = getDatabase();
  const rows = await database
    .select()
    .from(accounts)
    .where(
      options.includeArchived
        ? eq(accounts.userId, userId)
        : and(eq(accounts.userId, userId), isNull(accounts.archivedAt)),
    )
    .orderBy(asc(accounts.sortOrder), asc(accounts.name));

  return rows.map(toAccount);
}

export async function findAccount(userId: string, accountId: string): Promise<Account | null> {
  const database = getDatabase();
  const [row] = await database
    .select()
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.id, accountId)))
    .limit(1);

  return row ? toAccount(row) : null;
}

export async function listCategories(userId: string): Promise<CategoryRecord[]> {
  const database = getDatabase();
  const rows = await database
    .select()
    .from(categories)
    .where(and(eq(categories.userId, userId), isNull(categories.archivedAt)))
    .orderBy(asc(categories.kind), asc(categories.sortOrder), asc(categories.name));

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    kind: row.kind,
    parentId: row.parentId,
    color: row.color,
    icon: row.icon,
    isEssential: row.isEssential,
    excludeFromFreeToSpend: row.excludeFromFreeToSpend,
    sortOrder: row.sortOrder,
  }));
}

export async function listCards(userId: string): Promise<CardRecord[]> {
  const database = getDatabase();
  const rows = await database
    .select()
    .from(cards)
    .where(and(eq(cards.userId, userId), isNull(cards.archivedAt)))
    .orderBy(asc(cards.sortOrder), asc(cards.name));

  return rows.map((row) => ({
    ...toPositionCard(row),
    userId: row.userId,
    name: row.name,
    paymentAccountId: row.paymentAccountId,
    brand: row.brand,
    tier: row.tier,
    last4: row.last4,
    limitCents: row.limitCents,
    rewardMode: row.rewardMode,
    pointsPerDollarMilli: row.pointsPerDollarMilli,
    cashbackBasisPoints: row.cashbackBasisPoints,
    pointsGoal: row.pointsGoal,
    manualUsdRateMicros: row.manualUsdRateMicros,
    color: row.color,
    imageUrl: row.imageUrl,
  }));
}

export async function findCard(userId: string, cardId: string): Promise<CardRecord | null> {
  const database = getDatabase();
  const [row] = await database
    .select()
    .from(cards)
    .where(and(eq(cards.userId, userId), eq(cards.id, cardId)))
    .limit(1);

  if (!row) return null;
  return {
    ...toPositionCard(row),
    userId: row.userId,
    name: row.name,
    paymentAccountId: row.paymentAccountId,
    brand: row.brand,
    tier: row.tier,
    last4: row.last4,
    limitCents: row.limitCents,
    rewardMode: row.rewardMode,
    pointsPerDollarMilli: row.pointsPerDollarMilli,
    cashbackBasisPoints: row.cashbackBasisPoints,
    pointsGoal: row.pointsGoal,
    manualUsdRateMicros: row.manualUsdRateMicros,
    color: row.color,
    imageUrl: row.imageUrl,
  };
}

/** Categorias que não devem pesar no "livre para gastar". */
export async function freeToSpendExclusions(userId: string): Promise<Set<string>> {
  const database = getDatabase();
  const rows = await database
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.userId, userId), eq(categories.excludeFromFreeToSpend, true)));

  return new Set(rows.map((row) => row.id));
}
