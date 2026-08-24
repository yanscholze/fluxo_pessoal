/**
 * Repositório de parcelamentos.
 *
 * O plano guarda o que a compra foi; as parcelas são lançamentos de verdade,
 * ligados por `installment_plan_id` e numerados por um **inteiro**. A versão
 * anterior guardava `"3/12"` como texto e reconstruía o grupo com expressão
 * regular sobre o identificador.
 */

import { and, asc, eq, isNull } from "drizzle-orm";

import type { InstallmentPlan, ScheduledInstallment } from "../../core/domain/installment/plan.ts";
import { dueDateFor } from "../../core/domain/card/invoice-cycle.ts";
import { cents } from "../../core/kernel/money.ts";
import { competence } from "../../core/time/competence.ts";
import { localDate } from "../../core/time/local-date.ts";
import { getDatabase } from "../db/client.ts";
import { installmentPlans, transactions } from "../db/schema/index.ts";
import { type CardRecord, listCards } from "./catalog.ts";

function toPlan(row: typeof installmentPlans.$inferSelect): InstallmentPlan {
  return {
    id: row.id,
    userId: row.userId,
    cardId: row.cardId,
    description: row.description,
    categoryId: row.categoryId,
    totalAmount: cents(row.totalAmountCents),
    installmentCount: row.installmentCount,
    purchaseDate: localDate(row.purchaseDate),
    firstCompetence: competence(row.firstCompetence),
    monthlyInterestBasisPoints: row.monthlyInterestBasisPoints,
    label: row.label,
    status: row.status,
  };
}

export type PlanWithSchedule = {
  readonly plan: InstallmentPlan;
  readonly card: CardRecord | null;
  /**
   * Parcelas como estão no banco, não recalculadas.
   *
   * O usuário pode ter editado uma parcela ou antecipado outra; o cronograma
   * de verdade é o que está gravado.
   */
  readonly schedule: readonly ScheduledInstallment[];
  readonly transactionIdByNumber: ReadonlyMap<number, string>;
};

export async function listPlans(userId: string): Promise<PlanWithSchedule[]> {
  const database = getDatabase();

  const [planRows, parcelRows, cards] = await Promise.all([
    database.select().from(installmentPlans).where(eq(installmentPlans.userId, userId)),
    database
      .select({
        id: transactions.id,
        planId: transactions.installmentPlanId,
        number: transactions.installmentNumber,
        amountCents: transactions.amountCents,
        occurredOn: transactions.occurredOn,
        competence: transactions.competence,
      })
      .from(transactions)
      .where(and(eq(transactions.userId, userId), isNull(transactions.deletedAt)))
      .orderBy(asc(transactions.installmentNumber)),
    listCards(userId),
  ]);

  const cardById = new Map(cards.map((card) => [card.id, card]));
  const parcelsByPlan = new Map<string, typeof parcelRows>();
  for (const row of parcelRows) {
    if (!row.planId || row.number === null) continue;
    const lista = parcelsByPlan.get(row.planId) ?? [];
    lista.push(row);
    parcelsByPlan.set(row.planId, lista);
  }

  return planRows.map((row) => {
    const plan = toPlan(row);
    const card = cardById.get(plan.cardId) ?? null;
    const parcels = (parcelsByPlan.get(plan.id) ?? []).sort((left, right) => (left.number ?? 0) - (right.number ?? 0));

    return {
      plan,
      card,
      schedule: parcels.map((parcel) => ({
        number: parcel.number as number,
        competence: competence(parcel.competence),
        occurredOn: localDate(parcel.occurredOn),
        dueDate: card ? dueDateFor(card, competence(parcel.competence)) : localDate(parcel.occurredOn),
        amount: cents(parcel.amountCents),
      })),
      transactionIdByNumber: new Map(parcels.map((parcel) => [parcel.number as number, parcel.id])),
    };
  });
}

export async function findPlan(userId: string, planId: string): Promise<PlanWithSchedule | null> {
  const todos = await listPlans(userId);
  return todos.find((item) => item.plan.id === planId) ?? null;
}

export async function renamePlan(userId: string, planId: string, label: string | null): Promise<void> {
  await getDatabase()
    .update(installmentPlans)
    .set({ label: label?.slice(0, 80) ?? null, updatedAt: new Date().toISOString() })
    .where(and(eq(installmentPlans.userId, userId), eq(installmentPlans.id, planId)));
}

export async function setPlanStatus(
  userId: string,
  planId: string,
  status: InstallmentPlan["status"],
): Promise<void> {
  await getDatabase()
    .update(installmentPlans)
    .set({ status, updatedAt: new Date().toISOString() })
    .where(and(eq(installmentPlans.userId, userId), eq(installmentPlans.id, planId)));
}
