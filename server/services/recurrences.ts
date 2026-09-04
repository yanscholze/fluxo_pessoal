/**
 * Serviço de recorrências.
 *
 * Criar uma regra **não** grava lançamento nenhum: a projeção é derivada dela.
 * Só a confirmação de que a ocorrência aconteceu vira linha no banco, e é
 * idempotente por `(regra, competência)`.
 */

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
import { type LocalDate, todayIn } from "../../core/time/local-date.ts";
import { getDatabase } from "../db/client.ts";
import { recurrences } from "../db/schema/index.ts";
import { findAccount, findCard, listCategories } from "../repositories/catalog.ts";
import { ensureInvoices } from "../repositories/invoices.ts";
import { saveTransactionBatch } from "../repositories/ledger.ts";
import { findRecurrence, recordRun } from "../repositories/recurrences.ts";

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
  const rule = await findRecurrence(userId, recurrenceId);
  if (!rule) throw notFound("Recorrência", recurrenceId);
  if (!appliesTo(rule, competence)) {
    throw conflict("Esta recorrência não vale para a competência informada", { competence });
  }

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
    await saveTransactionBatch([{ transaction, options: { fingerprint: chave, recurrenceId: rule.id } }]);
  } catch (error) {
    // Violação do índice único significa que outra confirmação chegou antes.
    // Não é erro para o usuário: o resultado que ele queria já aconteceu.
    if (String(error).includes("UNIQUE") || String(error).includes("constraint")) {
      return { transactionId: transaction.id, amountCents: amount, alreadyConfirmed: true };
    }
    throw error;
  }

  await recordRun({
    id: newId(now.getTime()),
    userId,
    recurrenceId: rule.id,
    competence,
    transactionId: transaction.id,
    outcome: "confirmed",
    scheduledFor: occurredOn,
    amountCents: amount as number,
  });

  return { transactionId: transaction.id, amountCents: amount, alreadyConfirmed: false };
}
