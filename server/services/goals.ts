/**
 * Serviço de metas.
 *
 * Quando a meta tem conta própria, o acumulado é o **saldo da conta** — não um
 * número guardado à parte que diverge do dinheiro real assim que o usuário
 * mexe na conta sem passar pela tela de metas.
 */

import { accountBalance } from "../../core/domain/ledger/balance.ts";
import {
  type Goal,
  type GoalProgress,
  type GoalTotals,
  goalProgress,
  summarizeGoals,
} from "../../core/domain/goal/goal.ts";
import { notFound } from "../../core/kernel/errors.ts";
import { newId } from "../../core/kernel/id.ts";
import { type Cents, cents } from "../../core/kernel/money.ts";
import { type LocalDate, localDate, todayIn } from "../../core/time/local-date.ts";
import { and, eq, sum } from "drizzle-orm";

import { getDatabase } from "../db/client.ts";
import { goalContributions, goals } from "../db/schema/index.ts";
import { findAccount, listAccounts } from "../repositories/catalog.ts";
import { loadLedger } from "../repositories/ledger.ts";

export type GoalView = GoalProgress & {
  readonly color: string;
  readonly accountId: string | null;
  readonly accountName: string | null;
};

export type GoalsView = {
  readonly today: LocalDate;
  readonly goals: readonly GoalView[];
  readonly totals: GoalTotals;
  readonly accounts: readonly { id: string; name: string }[];
};

function toGoal(row: typeof goals.$inferSelect): Goal {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    target: cents(row.targetCents),
    monthlyContribution: cents(row.monthlyContributionCents),
    targetDate: row.targetDate ? localDate(row.targetDate) : null,
    accountId: row.accountId,
    color: row.color,
    status: row.status,
  };
}

export async function buildGoalsView(userId: string, now: Date = new Date()): Promise<GoalsView> {
  const today = todayIn(now);
  const database = getDatabase();

  const [rows, accounts, entries, aportes] = await Promise.all([
    database.select().from(goals).where(eq(goals.userId, userId)),
    listAccounts(userId),
    loadLedger(userId),
    database
      .select({ goalId: goalContributions.goalId, total: sum(goalContributions.amountCents) })
      .from(goalContributions)
      .where(eq(goalContributions.userId, userId))
      .groupBy(goalContributions.goalId),
  ]);

  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const aporteByGoal = new Map(aportes.map((row) => [row.goalId, Number(row.total ?? 0)]));

  const views: GoalView[] = rows
    .filter((row) => row.status !== "cancelled")
    .map((row) => {
      const goal = toGoal(row);
      const account = goal.accountId ? accountById.get(goal.accountId) : undefined;

      const current = account
        ? accountBalance(entries, account.id, today, account.openingBalance)
        : cents(aporteByGoal.get(goal.id) ?? 0);

      return {
        ...goalProgress(goal, current, today),
        color: goal.color,
        accountId: goal.accountId,
        accountName: account?.name ?? null,
      };
    })
    // Mais perto de fechar primeiro: é a que dá vontade de continuar.
    .sort((left, right) => right.percent - left.percent);

  return {
    today,
    goals: views,
    totals: summarizeGoals(views),
    accounts: accounts.map((account) => ({ id: account.id, name: account.name })),
  };
}

export type GoalInput = {
  readonly name: string;
  readonly target: Cents;
  readonly monthlyContribution?: Cents | null;
  readonly targetDate?: LocalDate | null;
  readonly accountId?: string | null;
  readonly color?: string | null;
};

export async function createGoal(userId: string, input: GoalInput, now: Date = new Date()): Promise<string> {
  if (input.accountId) {
    const account = await findAccount(userId, input.accountId);
    if (!account) throw notFound("Conta", input.accountId);
  }

  const id = newId(now.getTime());
  await getDatabase()
    .insert(goals)
    .values({
      id,
      userId,
      name: input.name,
      targetCents: input.target as number,
      monthlyContributionCents: (input.monthlyContribution ?? 0) as number,
      targetDate: (input.targetDate ?? null) as string | null,
      accountId: input.accountId ?? null,
      color: input.color ?? "#7c5cff",
      status: "active",
    });

  return id;
}

export async function contributeToGoal(
  userId: string,
  goalId: string,
  input: { amount: Cents; occurredOn?: LocalDate | null; note?: string | null },
  now: Date = new Date(),
): Promise<void> {
  const database = getDatabase();
  const [goal] = await database
    .select({ id: goals.id, accountId: goals.accountId })
    .from(goals)
    .where(and(eq(goals.userId, userId), eq(goals.id, goalId)))
    .limit(1);
  if (!goal) throw notFound("Meta", goalId);

  await database.insert(goalContributions).values({
    id: newId(now.getTime()),
    userId,
    goalId,
    amountCents: input.amount as number,
    occurredOn: (input.occurredOn ?? todayIn(now)) as string,
    note: input.note ?? null,
  });
}

export async function archiveGoal(userId: string, goalId: string, status: Goal["status"]): Promise<void> {
  await getDatabase()
    .update(goals)
    .set({ status, updatedAt: new Date().toISOString() })
    .where(and(eq(goals.userId, userId), eq(goals.id, goalId)));
}
