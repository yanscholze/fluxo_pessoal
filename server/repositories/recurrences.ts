/**
 * Repositório de recorrências.
 *
 * Salário e vale-alimentação não têm identificador reservado nem tabela
 * própria: são recorrências com um `role` diferente. Um identificador fixo
 * como `recurring-salary` transformava regra de negócio em string mágica e
 * impedia o usuário de ter duas fontes de renda.
 */

import { and, eq, inArray, isNull } from "drizzle-orm";

import type { Recurrence } from "../../core/domain/recurrence/schedule.ts";
import { cents } from "../../core/kernel/money.ts";
import type { Competence } from "../../core/time/competence.ts";
import { localDate } from "../../core/time/local-date.ts";
import { getDatabase } from "../db/client.ts";
import { recurrenceRuns, recurrences, transactions } from "../db/schema/index.ts";

function toRecurrence(row: typeof recurrences.$inferSelect): Recurrence {
  return {
    id: row.id,
    userId: row.userId,
    role: row.role,
    kind: row.kind,
    description: row.description,
    categoryId: row.categoryId,
    accountId: row.accountId,
    cardId: row.cardId,
    destinationAccountId: row.destinationAccountId,
    amount: cents(row.amountCents),
    amountMode: row.amountMode,
    scheduleMode: row.scheduleMode,
    scheduleDay: row.scheduleDay,
    dayAdjustment: row.dayAdjustment,
    interval: row.interval,
    startsOn: localDate(row.startsOn),
    endsOn: row.endsOn ? localDate(row.endsOn) : null,
    isActive: row.isActive,
  };
}

export async function listRecurrences(userId: string, onlyActive = false): Promise<Recurrence[]> {
  const database = getDatabase();
  const rows = await database
    .select()
    .from(recurrences)
    .where(onlyActive ? and(eq(recurrences.userId, userId), eq(recurrences.isActive, true)) : eq(recurrences.userId, userId));

  return rows.map(toRecurrence);
}

export async function findRecurrence(userId: string, id: string): Promise<Recurrence | null> {
  const database = getDatabase();
  const [row] = await database
    .select()
    .from(recurrences)
    .where(and(eq(recurrences.userId, userId), eq(recurrences.id, id)))
    .limit(1);

  return row ? toRecurrence(row) : null;
}

/**
 * Ocorrências que já viraram lançamento real.
 *
 * Consultado por `fingerprint`, que carrega a chave da ocorrência. É o que
 * impede o salário confirmado de aparecer também como projeção.
 */
export async function confirmedOccurrenceKeys(userId: string): Promise<Set<string>> {
  const database = getDatabase();
  const rows = await database
    .select({ fingerprint: transactions.fingerprint })
    .from(transactions)
    .where(and(eq(transactions.userId, userId), isNull(transactions.deletedAt)));

  return new Set(
    rows
      .map((row) => row.fingerprint)
      .filter((value): value is string => Boolean(value?.startsWith("recurrence:"))),
  );
}

export type RunRecord = {
  readonly competence: Competence;
  readonly outcome: "projected" | "confirmed" | "skipped";
  readonly transactionId: string | null;
  readonly ranAt: string;
};

export async function listRuns(userId: string, recurrenceId: string): Promise<RunRecord[]> {
  const database = getDatabase();
  const rows = await database
    .select()
    .from(recurrenceRuns)
    .where(and(eq(recurrenceRuns.userId, userId), eq(recurrenceRuns.recurrenceId, recurrenceId)));

  return rows.map((row) => ({
    competence: row.competence as Competence,
    outcome: row.outcome,
    transactionId: row.transactionId,
    ranAt: row.ranAt,
  }));
}

export async function recordRun(input: {
  id: string;
  userId: string;
  recurrenceId: string;
  competence: Competence;
  transactionId: string | null;
  outcome: RunRecord["outcome"];
  scheduledFor: string;
  amountCents: number;
}): Promise<void> {
  await getDatabase()
    .insert(recurrenceRuns)
    .values({
      id: input.id,
      userId: input.userId,
      recurrenceId: input.recurrenceId,
      competence: input.competence,
      transactionId: input.transactionId,
      outcome: input.outcome,
      scheduledFor: input.scheduledFor,
      amountCents: input.amountCents,
    })
    // Chave natural `(recurrence_id, competence)`: rodar de novo não duplica.
    .onConflictDoNothing();
}

export async function runsFor(userId: string, recurrenceIds: readonly string[]): Promise<Map<string, RunRecord[]>> {
  if (!recurrenceIds.length) return new Map();

  const database = getDatabase();
  const rows = await database
    .select()
    .from(recurrenceRuns)
    .where(and(eq(recurrenceRuns.userId, userId), inArray(recurrenceRuns.recurrenceId, [...recurrenceIds])));

  const byRecurrence = new Map<string, RunRecord[]>();
  for (const row of rows) {
    const lista = byRecurrence.get(row.recurrenceId) ?? [];
    lista.push({
      competence: row.competence as Competence,
      outcome: row.outcome,
      transactionId: row.transactionId,
      ranAt: row.ranAt,
    });
    byRecurrence.set(row.recurrenceId, lista);
  }
  return byRecurrence;
}
