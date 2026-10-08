/**
 * Serviço de recorrências.
 *
 * Criar uma regra **não** grava lançamento nenhum: a projeção é derivada dela.
 * Só a confirmação de que a ocorrência aconteceu vira linha no banco, e é
 * idempotente por `(regra, competência)`.
 */

import { and, eq, isNull, lte, notExists, sql } from "drizzle-orm";
import { competenceForPurchase } from "../../core/domain/card/invoice-cycle.ts";
import { accountParty, cardParty, type Party, type Transaction } from "../../core/domain/ledger/types.ts";
import {
  type Recurrence,
  assertValidSchedule,
  occurrenceAmount,
  occurrenceDate,
  occurrenceKey,
  appliesTo,
} from "../../core/domain/recurrence/schedule.ts";
import { conflict, notFound, validationError } from "../../core/kernel/errors.ts";
import { newId } from "../../core/kernel/id.ts";
import type { Cents } from "../../core/kernel/money.ts";
import type { Competence } from "../../core/time/competence.ts";
import { type LocalDate, localDate, todayIn } from "../../core/time/local-date.ts";
import { getDatabase } from "../db/client.ts";
import { projectPayments, recurrenceRuns, recurrences, transactions } from "../db/schema/index.ts";
import { findAccount, findCard, listCategories } from "../repositories/catalog.ts";
import { ensureInvoices } from "../repositories/invoices.ts";
import { transactionSaveStatements } from "../repositories/ledger.ts";
import { confirmedOccurrence, findRecurrence } from "../repositories/recurrences.ts";

export type OccurrenceTransaction = {
  id: string;
  description: string;
  occurredOn: LocalDate;
  amountCents: number;
};

async function occurrenceRule(userId: string, recurrenceId: string, competence: Competence) {
  const rule = await findRecurrence(userId, recurrenceId);
  if (!rule) throw notFound("Recorrência", recurrenceId);
  if (!appliesTo(rule, competence)) throw conflict("Esta recorrência não vale para a competência informada", { competence });
  return rule;
}

/** Somente movimentos reais, da mesma natureza e conta/cartão da previsão. */
function availableTransaction(userId: string, rule: Recurrence, now: Date) {
  const database = getDatabase();
  return and(eq(transactions.userId, userId), eq(transactions.kind, rule.kind),
    eq(transactions.state, "confirmed"), isNull(transactions.deletedAt),
    isNull(transactions.recurrenceId), isNull(transactions.installmentPlanId),
    lte(transactions.occurredOn, todayIn(now)),
    rule.cardId ? eq(transactions.originCardId, rule.cardId) : eq(transactions.originAccountId, rule.accountId!),
    rule.kind === "transfer" ? eq(transactions.destinationAccountId, rule.destinationAccountId!) : undefined,
    notExists(database.select({ id: recurrenceRuns.id }).from(recurrenceRuns)
      .where(eq(recurrenceRuns.transactionId, transactions.id))),
    notExists(database.select({ id: projectPayments.id }).from(projectPayments)
      .where(eq(projectPayments.transactionId, transactions.id))));
}

export async function occurrenceTransactions(userId: string, recurrenceId: string, competence: Competence, now = new Date()): Promise<OccurrenceTransaction[]> {
  const rule = await occurrenceRule(userId, recurrenceId, competence);
  const rows = await getDatabase().select({ id: transactions.id, description: transactions.description,
    occurredOn: transactions.occurredOn, amountCents: transactions.amountCents })
    .from(transactions).where(availableTransaction(userId, rule, now))
    .orderBy(sql`abs(${transactions.amountCents} - ${occurrenceAmount(rule, competence)})`,
      sql`abs(julianday(${transactions.occurredOn}) - julianday(${occurrenceDate(rule, competence)}))`).limit(100);
  return rows.map((row) => ({ ...row, occurredOn: localDate(row.occurredOn) }));
}

function removeStaleRun(userId: string, recurrenceId: string, competence: Competence) {
  return getDatabase().delete(recurrenceRuns).where(and(eq(recurrenceRuns.userId, userId),
    eq(recurrenceRuns.recurrenceId, recurrenceId), eq(recurrenceRuns.competence, competence),
    sql`NOT EXISTS (SELECT 1 FROM transactions AS live WHERE live.id = recurrence_runs.transaction_id
      AND live.user_id = ${userId} AND live.deleted_at IS NULL AND live.state = 'confirmed')`));
}

/** Vincula sem tocar no valor, data, categoria, impressão digital ou razão. */
export async function linkOccurrence(userId: string, recurrenceId: string, competence: Competence, transactionId: string, now = new Date()) {
  const rule = await occurrenceRule(userId, recurrenceId, competence);
  const previous = await confirmedOccurrence(userId, recurrenceId, competence);
  if (previous) {
    if (previous.transactionId !== transactionId) throw conflict("Esta ocorrência já está vinculada a outro lançamento");
    return { ...previous, alreadyConfirmed: true };
  }
  const database = getDatabase();
  const runId = newId(now.getTime());
  const insert = database.insert(recurrenceRuns).select(database.select({
    id: sql<string>`${runId}`.as("id"), userId: sql<string>`${userId}`.as("user_id"), recurrenceId: sql<string>`${rule.id}`.as("recurrence_id"),
    competence: sql<string>`${competence}`.as("competence"), transactionId: transactions.id,
    outcome: sql<"confirmed">`'confirmed'`.as("outcome"), scheduledFor: transactions.occurredOn,
    amountCents: transactions.amountCents, ranAt: sql<string>`${now.toISOString()}`.as("ran_at"),
  }).from(transactions).where(and(eq(transactions.id, transactionId), availableTransaction(userId, rule, now))))
    .onConflictDoNothing();
  await database.batch([
    removeStaleRun(userId, recurrenceId, competence), insert,
    database.update(transactions).set({ recurrenceId: rule.id, updatedAt: now.toISOString(), version: sql`${transactions.version} + 1` })
      .where(and(eq(transactions.userId, userId), eq(transactions.id, transactionId),
        sql`EXISTS (SELECT 1 FROM recurrence_runs WHERE id = ${runId} AND transaction_id = ${transactionId})`)),
  ] as never);
  const linked = await confirmedOccurrence(userId, recurrenceId, competence);
  if (!linked || linked.transactionId !== transactionId) throw conflict("O lançamento não está disponível para este compromisso. Atualize a lista e escolha um movimento confirmado da mesma conta ou cartão.");
  return { ...linked, alreadyConfirmed: false };
}

export type RecurrenceInput = {
  readonly role?: Recurrence["role"];
  readonly kind: Recurrence["kind"];
  readonly description: string;
  readonly amount: Cents;
  readonly amountMode?: Recurrence["amountMode"];
  readonly scheduleMode?: Recurrence["scheduleMode"];
  readonly scheduleDay: number;
  readonly dayAdjustment?: Recurrence["dayAdjustment"];
  readonly interval?: Recurrence["interval"];
  readonly categoryId?: string | null;
  readonly accountId?: string | null;
  readonly cardId?: string | null;
  readonly destinationAccountId?: string | null;
  readonly startsOn?: LocalDate | null;
  readonly endsOn?: LocalDate | null;
  readonly isActive?: boolean;
};

export async function createRecurrence(
  userId: string,
  input: RecurrenceInput,
  now: Date = new Date(),
): Promise<string> {
  const scheduleMode = input.scheduleMode ?? "day_of_month";
  assertValidSchedule({ scheduleMode, scheduleDay: input.scheduleDay });
  await assertOrigin(userId, input);

  if (input.categoryId && input.kind !== "transfer") {
    const categorias = await listCategories(userId);
    if (!categorias.some((item) => item.id === input.categoryId)) {
      throw notFound("Categoria", input.categoryId);
    }
  }

  const id = newId(now.getTime());
  await getDatabase()
    .insert(recurrences)
    .values({
      id,
      userId,
      role: input.role ?? "standard",
      kind: input.kind,
      description: input.description,
      categoryId: input.kind === "transfer" ? null : (input.categoryId ?? null),
      accountId: input.accountId ?? null,
      cardId: input.cardId ?? null,
      destinationAccountId: input.destinationAccountId ?? null,
      amountCents: input.amount as number,
      amountMode: input.amountMode ?? "fixed",
      scheduleMode,
      scheduleDay: input.scheduleDay,
      dayAdjustment: input.dayAdjustment ?? "next",
      interval: input.interval ?? "monthly",
      startsOn: (input.startsOn ?? todayIn(now)) as string,
      endsOn: (input.endsOn ?? null) as string | null,
      isActive: input.isActive ?? true,
    });

  return id;
}

async function assertOrigin(userId: string, input: RecurrenceInput): Promise<void> {
  if (input.cardId && input.accountId) {
    throw validationError("Informe a conta ou o cartão, não os dois", [
      { path: "cardId", message: "Escolha apenas uma origem" },
    ]);
  }

  if (input.cardId) {
    if (input.kind !== "expense") throw conflict("Só despesa pode recorrer no cartão de crédito");
    const card = await findCard(userId, input.cardId);
    if (!card) throw notFound("Cartão", input.cardId);
    if (card.kind !== "credit") throw conflict("Recorrência no crédito exige um cartão de crédito");
    return;
  }

  if (!input.accountId) {
    throw validationError("Informe a conta da recorrência", [
      { path: "accountId", message: "Selecione a conta" },
    ]);
  }
  const account = await findAccount(userId, input.accountId);
  if (!account) throw notFound("Conta", input.accountId);

  if (input.kind === "transfer") {
    if (!input.destinationAccountId) {
      throw validationError("Transferência recorrente exige conta de destino", [
        { path: "destinationAccountId", message: "Selecione a conta de destino" },
      ]);
    }
    if (input.destinationAccountId === input.accountId) {
      throw conflict("A conta de origem e a de destino precisam ser diferentes");
    }
    const destino = await findAccount(userId, input.destinationAccountId);
    if (!destino) throw notFound("Conta de destino", input.destinationAccountId);
  }
}

export async function setRecurrenceActive(
  userId: string,
  recurrenceId: string,
  isActive: boolean,
  now: Date = new Date(),
): Promise<void> {
  const rule = await findRecurrence(userId, recurrenceId);
  if (!rule) throw notFound("Recorrência", recurrenceId);

  const { eq, and } = await import("drizzle-orm");
  await getDatabase()
    .update(recurrences)
    .set({ isActive, updatedAt: now.toISOString() })
    .where(and(eq(recurrences.userId, userId), eq(recurrences.id, recurrenceId)));
}

/**
 * Apaga a regra.
 *
 * O que ela já produziu **fica**: as ocorrências confirmadas viraram lançamento
 * no razão e são fato, não previsão. Apagar a regra só interrompe o futuro —
 * levar as transações junto reescreveria meses já fechados e faria o saldo
 * mudar sozinho.
 */
export async function removeRecurrence(userId: string, recurrenceId: string): Promise<boolean> {
  const rule = await findRecurrence(userId, recurrenceId);
  if (!rule) return false;

  const { eq, and } = await import("drizzle-orm");
  await getDatabase()
    .delete(recurrences)
    .where(and(eq(recurrences.userId, userId), eq(recurrences.id, recurrenceId)));
  return true;
}

/**
 * Confirma que a ocorrência aconteceu.
 *
 * Idempotente: a impressão digital é a chave da ocorrência, e o índice único
 * `(user, fingerprint)` recusa a segunda gravação. Confirmar o salário de
 * agosto duas vezes não credita duas vezes.
 */
export async function confirmOccurrence(
  userId: string,
  recurrenceId: string,
  competence: Competence,
  overrides: { amount?: Cents | null; occurredOn?: LocalDate | null } = {},
  now: Date = new Date(),
): Promise<{ transactionId: string; amountCents: number; alreadyConfirmed: boolean }> {
  const rule = await occurrenceRule(userId, recurrenceId, competence);
  const previous = await confirmedOccurrence(userId, recurrenceId, competence);
  if (previous) return { ...previous, alreadyConfirmed: true };

  const chave = occurrenceKey(rule.id, competence);
  const amount = overrides.amount ?? occurrenceAmount(rule, competence);
  const occurredOn = overrides.occurredOn ?? occurrenceDate(rule, competence);

  const origin: Party = rule.cardId ? cardParty(rule.cardId) : accountParty(rule.accountId!);
  let competenciaFinal: Competence = competence;

  if (rule.cardId) {
    const card = await findCard(userId, rule.cardId);
    if (!card) throw notFound("Cartão", rule.cardId);
    competenciaFinal = competenceForPurchase(card, occurredOn);
    await ensureInvoices({ userId, cardId: card.id, cycle: card, competences: [competenciaFinal] });
  }

  const transaction: Transaction = {
    id: newId(now.getTime()),
    userId,
    kind: rule.kind,
    state: "confirmed",
    source: "recurrence",
    description: rule.description,
    categoryId: rule.kind === "transfer" ? null : rule.categoryId,
    amount,
    currency: "BRL",
    occurredOn,
    origin,
    destination: rule.destinationAccountId ? accountParty(rule.destinationAccountId) : null,
    competence: competenciaFinal,
    tripId: null,
    installmentPlanId: null,
    installmentNumber: null,
    recurrenceId: rule.id,
    notes: null,
  };

  try {
    const database = getDatabase();
    await database.batch([
      removeStaleRun(userId, recurrenceId, competence),
      ...transactionSaveStatements(transaction, { fingerprint: chave, recurrenceId: rule.id }),
      database.insert(recurrenceRuns).values({ id: newId(now.getTime()), userId,
        recurrenceId: rule.id, competence, transactionId: transaction.id,
        outcome: "confirmed", scheduledFor: occurredOn, amountCents: amount as number }),
    ] as never);
  } catch (error) {
    // Violação do índice único significa que outra confirmação chegou antes.
    // Não é erro para o usuário: o resultado que ele queria já aconteceu.
    if (String(error).includes("UNIQUE")) {
      const confirmed = await confirmedOccurrence(userId, recurrenceId, competence);
      if (confirmed) return { ...confirmed, alreadyConfirmed: true };
    }
    throw error;
  }

  return { transactionId: transaction.id, amountCents: amount, alreadyConfirmed: false };
}
