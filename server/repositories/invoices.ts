/**
 * Repositório de faturas.
 *
 * Os totais continuam derivados do razão. O que esta tabela guarda é o que
 * **não** é derivável: as datas que a fatura realmente teve. Se o usuário
 * mudar o dia de fechamento do cartão em novembro, a fatura de agosto precisa
 * continuar dizendo que fechou no dia que fechou.
 */

import { and, eq, inArray } from "drizzle-orm";

import { type CycleConfig, scheduleFor } from "../../core/domain/card/invoice-cycle.ts";
import { newId } from "../../core/kernel/id.ts";
import type { Competence } from "../../core/time/competence.ts";
import type { LocalDate } from "../../core/time/local-date.ts";
import { getDatabase } from "../db/client.ts";
import { invoices } from "../db/schema/index.ts";

export type InvoiceRecord = {
  readonly id: string;
  readonly cardId: string;
  readonly competence: Competence;
  readonly closingDate: LocalDate;
  readonly dueDate: LocalDate;
  readonly status: "open" | "closed" | "partial" | "paid";
};

export async function listInvoices(userId: string, cardId?: string): Promise<InvoiceRecord[]> {
  const database = getDatabase();
  const rows = await database
    .select()
    .from(invoices)
    .where(cardId ? and(eq(invoices.userId, userId), eq(invoices.cardId, cardId)) : eq(invoices.userId, userId));

  return rows.map((row) => ({
    id: row.id,
    cardId: row.cardId,
    competence: row.competence as Competence,
    closingDate: row.closingDate as LocalDate,
    dueDate: row.dueDate as LocalDate,
    status: row.status,
  }));
}

/**
 * Garante que existe linha de fatura para cada competência tocada.
 *
 * Idempotente por `(card_id, competence)`: chamar de novo não duplica nem
 * reescreve as datas já congeladas.
 */
export async function ensureInvoices(input: {
  userId: string;
  cardId: string;
  cycle: CycleConfig;
  competences: readonly Competence[];
}): Promise<Map<Competence, string>> {
  const database = getDatabase();
  const wanted = [...new Set(input.competences)];
  if (!wanted.length) return new Map();

  const existing = await database
    .select({ id: invoices.id, competence: invoices.competence })
    .from(invoices)
    .where(and(eq(invoices.cardId, input.cardId), inArray(invoices.competence, wanted)));

  const byCompetence = new Map<Competence, string>(
    existing.map((row) => [row.competence as Competence, row.id]),
  );

  const missing = wanted.filter((competence) => !byCompetence.has(competence));
  if (!missing.length) return byCompetence;

  const rows = missing.map((competence) => {
    const schedule = scheduleFor(input.cycle, competence);
    const id = newId();
    byCompetence.set(competence, id);
    return {
      id,
      userId: input.userId,
      cardId: input.cardId,
      competence: competence as string,
      closingDate: schedule.closingDate as string,
      dueDate: schedule.dueDate as string,
      status: "open" as const,
    };
  });

  await database.insert(invoices).values(rows).onConflictDoNothing();
  return byCompetence;
}

export async function findInvoice(
  userId: string,
  cardId: string,
  competence: Competence,
): Promise<InvoiceRecord | null> {
  const database = getDatabase();
  const [row] = await database
    .select()
    .from(invoices)
    .where(and(eq(invoices.userId, userId), eq(invoices.cardId, cardId), eq(invoices.competence, competence)))
    .limit(1);

  if (!row) return null;
  return {
    id: row.id,
    cardId: row.cardId,
    competence: row.competence as Competence,
    closingDate: row.closingDate as LocalDate,
    dueDate: row.dueDate as LocalDate,
    status: row.status,
  };
}

export async function updateInvoiceStatus(
  invoiceId: string,
  status: InvoiceRecord["status"],
  now: Date = new Date(),
): Promise<void> {
  await getDatabase()
    .update(invoices)
    .set({
      status,
      updatedAt: now.toISOString(),
      ...(status === "paid" ? { paidAt: now.toISOString() } : {}),
    })
    .where(eq(invoices.id, invoiceId));
}
