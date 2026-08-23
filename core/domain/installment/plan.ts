/**
 * Parcelamento.
 *
 * Um parcelamento é uma **compra** que se desdobra em N obrigações, cada uma
 * numa competência. Parcela não é texto: é um inteiro `installmentNumber`
 * dentro de um plano identificado. A soma das parcelas é exatamente o valor da
 * compra — a divisão distribui o resto centavo a centavo em vez de arredondar
 * cada parcela isoladamente.
 */

import { validationError } from "../../kernel/errors.ts";
import { type Cents, allocate, sum } from "../../kernel/money.ts";
import { type Competence, compareCompetence, distance } from "../../time/competence.ts";
import { type LocalDate, addMonths } from "../../time/local-date.ts";
import { type CycleConfig, dueDateFor, installmentCompetences } from "../card/invoice-cycle.ts";

/** Teto de parcelas aceito pelo produto. */
export const MAX_INSTALLMENTS = 48;

export type InstallmentPlanStatus = "active" | "settled" | "cancelled";

export type InstallmentPlan = {
  readonly id: string;
  readonly userId: string;
  readonly cardId: string;
  readonly description: string;
  readonly categoryId: string | null;
  /** Valor da compra. A soma das parcelas bate exatamente com ele. */
  readonly totalAmount: Cents;
  readonly installmentCount: number;
  readonly purchaseDate: LocalDate;
  readonly firstCompetence: Competence;
  /**
   * Juros embutidos ao mês, em pontos-base (100 = 1,00%). Zero em compra sem
   * juros — o caso comum. É o que dá sentido a "economia" na antecipação.
   */
  readonly monthlyInterestBasisPoints: number;
  /** Apelido dado pelo usuário. */
  readonly label: string | null;
  readonly status: InstallmentPlanStatus;
};

/** Uma parcela do cronograma, antes de virar lançamento. */
export type ScheduledInstallment = {
  readonly number: number;
  readonly competence: Competence;
  /** Data atribuída à parcela, para exibição no extrato. */
  readonly occurredOn: LocalDate;
  /** Vencimento da fatura em que a parcela cai. */
  readonly dueDate: LocalDate;
  readonly amount: Cents;
};

export function assertValidInstallmentCount(count: number): void {
  if (!Number.isInteger(count) || count < 1 || count > MAX_INSTALLMENTS) {
    throw validationError(`O número de parcelas deve estar entre 1 e ${MAX_INSTALLMENTS}`, [
      { path: "installmentCount", message: `Informe de 1 a ${MAX_INSTALLMENTS} parcelas` },
    ]);
  }
}

/**
 * Monta o cronograma de uma compra parcelada.
 *
 * A parcela 1 cai na competência da própria compra (conforme o ciclo do
 * cartão); as seguintes avançam um mês por vez. A data de cada parcela
 * acompanha a competência para que o extrato faça sentido, e o vencimento sai
 * da agenda da fatura correspondente.
 */
export function scheduleInstallments(input: {
  readonly totalAmount: Cents;
  readonly installmentCount: number;
  readonly purchaseDate: LocalDate;
  readonly cycle: CycleConfig;
}): ScheduledInstallment[] {
  assertValidInstallmentCount(input.installmentCount);

  const competences = installmentCompetences(input.cycle, input.purchaseDate, input.installmentCount);
  const amounts = allocate(input.totalAmount, input.installmentCount);

  return competences.map((competence, index) => ({
    number: index + 1,
    competence,
    occurredOn: addMonths(input.purchaseDate, index),
    dueDate: dueDateFor(input.cycle, competence),
    amount: amounts[index],
  }));
}

/** Confere que o cronograma não perdeu nem inventou centavos. */
export function scheduleTotal(schedule: readonly ScheduledInstallment[]): Cents {
  return sum(schedule.map((item) => item.amount));
}

export type InstallmentStatus = "paid" | "overdue" | "open";

/**
 * Situação de uma parcela.
 *
 * Uma parcela de competência anterior à fatura ativa já deveria ter sido paga:
 * está **paga** se aquela fatura foi quitada, **atrasada** se não. Da fatura
 * ativa em diante está **em aberto**.
 */
export function installmentStatus(
  competence: Competence,
  activeCompetence: Competence,
  overdueCompetences: ReadonlySet<Competence>,
): InstallmentStatus {
  if (compareCompetence(competence, activeCompetence) >= 0) return "open";
  return overdueCompetences.has(competence) ? "overdue" : "paid";
}

/** Visão consolidada de um plano, para a tela de parcelamentos. */
export type InstallmentProgress = {
  readonly planId: string;
  readonly label: string;
  readonly totalAmount: Cents;
  readonly paidAmount: Cents;
  readonly openAmount: Cents;
  readonly paidCount: number;
  readonly openCount: number;
  readonly overdueCount: number;
  readonly totalCount: number;
  readonly percentPaid: number;
  readonly nextDueDate: LocalDate | null;
  readonly lastCompetence: Competence | null;
  readonly isSettled: boolean;
};

export function summarizeProgress(
  plan: InstallmentPlan,
  schedule: readonly ScheduledInstallment[],
  activeCompetence: Competence,
  overdueCompetences: ReadonlySet<Competence>,
): InstallmentProgress {
  const statuses = schedule.map((item) => ({
    item,
    status: installmentStatus(item.competence, activeCompetence, overdueCompetences),
  }));

  const paid = statuses.filter((entry) => entry.status === "paid");
  const open = statuses.filter((entry) => entry.status !== "paid");
  const paidAmount = sum(paid.map((entry) => entry.item.amount));
  const openAmount = sum(open.map((entry) => entry.item.amount));
  const totalAmount = sum(schedule.map((item) => item.amount));

  return {
    planId: plan.id,
    label: plan.label?.trim() || plan.description,
    totalAmount,
    paidAmount,
    openAmount,
    paidCount: paid.length,
    openCount: open.length,
    overdueCount: statuses.filter((entry) => entry.status === "overdue").length,
    totalCount: schedule.length,
    percentPaid: totalAmount > 0 ? Math.min(100, (paidAmount / totalAmount) * 100) : 0,
    nextDueDate: open[0]?.item.dueDate ?? null,
    lastCompetence: schedule.at(-1)?.competence ?? null,
    isSettled: open.length === 0,
  };
}

/**
 * Comprometimento futuro mês a mês.
 *
 * Responde "quanto de parcela eu já devo em cada mês daqui pra frente" — a
 * tabela que o usuário precisa antes de assumir mais uma compra parcelada.
 */
export function futureCommitmentByCompetence(
  schedules: readonly (readonly ScheduledInstallment[])[],
  fromCompetence: Competence,
  monthsAhead: number,
): Array<{ competence: Competence; amount: Cents }> {
  const totals = new Map<Competence, number>();

  for (const schedule of schedules) {
    for (const installment of schedule) {
      const offset = distance(fromCompetence, installment.competence);
      if (offset < 0 || offset >= monthsAhead) continue;
      totals.set(installment.competence, (totals.get(installment.competence) ?? 0) + installment.amount);
    }
  }

  return [...totals.entries()]
    .sort(([left], [right]) => compareCompetence(left, right))
    .map(([competence, amount]) => ({ competence, amount: amount as Cents }));
}
