/**
 * Serviço de parcelamentos.
 *
 * Responde as duas perguntas que o usuário faz: "quanto disso ainda devo, mês
 * a mês?" e "e se eu antecipar?".
 */

import { activeCompetence } from "../../core/domain/card/invoice-cycle.ts";
import { simulateAnticipation, anticipationLadder } from "../../core/domain/installment/anticipation.ts";
import {
  type InstallmentProgress,
  type ScheduledInstallment,
  futureCommitmentByCompetence,
  installmentStatus,
  summarizeProgress,
} from "../../core/domain/installment/plan.ts";
import { overdueCompetences } from "../../core/domain/ledger/balance.ts";
import { notFound } from "../../core/kernel/errors.ts";
import { type Competence, competenceOf } from "../../core/time/competence.ts";
import { type LocalDate, todayIn } from "../../core/time/local-date.ts";
import { listPlans } from "../repositories/installments.ts";
import { loadLedger } from "../repositories/ledger.ts";

export type InstallmentEntryView = {
  readonly number: number;
  readonly competence: Competence;
  readonly dueDate: LocalDate;
  readonly amountCents: number;
  readonly status: "paid" | "overdue" | "open";
  readonly transactionId: string | null;
};

export type PlanView = InstallmentProgress & {
  readonly cardId: string;
  readonly cardName: string;
  readonly purchaseDate: LocalDate;
  readonly monthlyInterestBasisPoints: number;
  readonly entries: readonly InstallmentEntryView[];
};

export type InstallmentsView = {
  readonly today: LocalDate;
  readonly active: readonly PlanView[];
  readonly settled: readonly PlanView[];
  readonly totals: {
    readonly totalCents: number;
    readonly paidCents: number;
    readonly openCents: number;
    readonly percentPaid: number;
  };
  /** Quanto de parcela já está comprometido em cada mês à frente. */
  readonly commitment: readonly { competence: Competence; amountCents: number }[];
};

const COMMITMENT_MONTHS = 12;

export async function buildInstallmentsView(userId: string, now: Date = new Date()): Promise<InstallmentsView> {
  const today = todayIn(now);
  const [plans, entries] = await Promise.all([listPlans(userId), loadLedger(userId)]);

  const overdueByCard = new Map<string, Set<Competence>>();
  const views: PlanView[] = plans.map(({ plan, card, schedule, transactionIdByNumber }) => {
    const active = card ? activeCompetence(card, today) : competenceOf(today);

    let overdue = overdueByCard.get(plan.cardId);
    if (!overdue) {
      overdue = new Set(card ? overdueCompetences(entries, card.id, active) : []);
      overdueByCard.set(plan.cardId, overdue);
    }

    const progress = summarizeProgress(plan, schedule, active, overdue);

    return {
      ...progress,
      cardId: plan.cardId,
      cardName: card?.name ?? "Cartão removido",
      purchaseDate: plan.purchaseDate,
      monthlyInterestBasisPoints: plan.monthlyInterestBasisPoints,
      entries: schedule.map((item) => ({
        number: item.number,
        competence: item.competence,
        dueDate: item.dueDate,
        amountCents: item.amount,
        status: installmentStatus(item.competence, active, overdue),
        transactionId: transactionIdByNumber.get(item.number) ?? null,
      })),
    };
  });

  const ordenar = (lista: PlanView[]) =>
    [...lista].sort((left, right) => (left.nextDueDate ?? "9999").localeCompare(right.nextDueDate ?? "9999"));

  const active = ordenar(views.filter((item) => !item.isSettled));
  const settled = ordenar(views.filter((item) => item.isSettled));

  const totalCents = views.reduce((soma, item) => soma + item.totalAmount, 0);
  const paidCents = views.reduce((soma, item) => soma + item.paidAmount, 0);

  return {
    today,
    active,
    settled,
    totals: {
      totalCents,
      paidCents,
      openCents: totalCents - paidCents,
      percentPaid: totalCents > 0 ? (paidCents / totalCents) * 100 : 0,
    },
    commitment: futureCommitmentByCompetence(
      // Só o que ainda está em aberto pesa no comprometimento futuro.
      plans.map(({ schedule }) => schedule),
      competenceOf(today),
      COMMITMENT_MONTHS,
    ).map((item) => ({ competence: item.competence, amountCents: item.amount })),
  };
}

export type AnticipationScenario = {
  readonly count: number;
  readonly nominalCents: number;
  readonly dueTodayCents: number;
  readonly savingsCents: number;
  readonly newEndCompetence: Competence | null;
  readonly monthsShortened: number;
  readonly averageMonthlyReliefCents: number;
};

/**
 * Cenários de antecipação de um plano.
 *
 * Numa compra sem juros a economia é zero — e o simulador diz isso, em vez de
 * inventar desconto. O ganho real ali é liberar limite e encurtar o
 * compromisso, que também aparecem no resultado.
 */
export async function simulatePlanAnticipation(
  userId: string,
  planId: string,
  now: Date = new Date(),
): Promise<{ plan: PlanView; scenarios: readonly AnticipationScenario[] }> {
  const view = await buildInstallmentsView(userId, now);
  const plan = [...view.active, ...view.settled].find((item) => item.planId === planId);
  if (!plan) throw notFound("Parcelamento", planId);

  const abertas: ScheduledInstallment[] = plan.entries
    .filter((entry) => entry.status !== "paid")
    .map((entry) => ({
      number: entry.number,
      competence: entry.competence,
      occurredOn: entry.dueDate,
      dueDate: entry.dueDate,
      amount: entry.amountCents as never,
    }));

  if (!abertas.length) return { plan, scenarios: [] };

  const cenarios = anticipationLadder(
    {
      openInstallments: abertas,
      anticipationCompetence: competenceOf(view.today),
      monthlyInterestBasisPoints: plan.monthlyInterestBasisPoints,
    },
    Math.min(abertas.length, 12),
  );

  return {
    plan,
    scenarios: cenarios.map((cenario) => ({
      count: cenario.anticipated.length,
      nominalCents: cenario.nominalAmount,
      dueTodayCents: cenario.amountDueToday,
      savingsCents: cenario.savings,
      newEndCompetence: cenario.newEndCompetence,
      monthsShortened: cenario.monthsShortened,
      averageMonthlyReliefCents: cenario.averageMonthlyRelief,
    })),
  };
}

export { simulateAnticipation };
