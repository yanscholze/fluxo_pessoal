/**
 * Metas.
 *
 * Uma meta responde **quando isso fica pronto**. O valor guardado e o alvo são
 * só o insumo; o que muda decisão é a data prevista e o quanto falta por mês
 * para chegar no prazo desejado.
 */

import { type Cents, clampToZero, subtract } from "../../kernel/money.ts";
import { type Competence, competenceOf, shift } from "../../time/competence.ts";
import type { LocalDate } from "../../time/local-date.ts";

export type GoalStatus = "active" | "achieved" | "cancelled";

export type Goal = {
  readonly id: string;
  readonly userId: string;
  readonly name: string;
  readonly target: Cents;
  readonly monthlyContribution: Cents;
  readonly targetDate: LocalDate | null;
  /** Conta que lastreia a meta. Quando existe, o acumulado é o saldo dela. */
  readonly accountId: string | null;
  readonly color: string;
  readonly status: GoalStatus;
};

export type GoalProgress = {
  readonly goalId: string;
  readonly name: string;
  readonly target: Cents;
  readonly current: Cents;
  readonly remaining: Cents;
  readonly percent: number;
  readonly isAchieved: boolean;
  readonly monthlyContribution: Cents;
  /** Meses que faltam no ritmo atual. `null` quando não há aporte definido. */
  readonly monthsRemaining: number | null;
  /** Competência prevista de conclusão. `null` quando não dá para prever. */
  readonly forecast: Competence | null;
  readonly targetDate: LocalDate | null;
  /**
   * Quanto precisaria aportar por mês para fechar no prazo desejado.
   * `null` quando não há prazo.
   */
  readonly requiredMonthly: Cents | null;
  /** Verdadeiro quando o ritmo atual não alcança o prazo. */
  readonly behindSchedule: boolean;
};

export function goalProgress(goal: Goal, current: Cents, today: LocalDate): GoalProgress {
  const remaining = clampToZero(subtract(goal.target, current));
  const isAchieved = remaining === 0 && goal.target > 0;
  const hoje = competenceOf(today);

  const monthsRemaining =
    isAchieved ? 0 : goal.monthlyContribution > 0 ? Math.ceil(remaining / goal.monthlyContribution) : null;

  const monthsToDeadline = goal.targetDate ? monthsBetween(hoje, competenceOf(goal.targetDate)) : null;

  const requiredMonthly =
    monthsToDeadline !== null && monthsToDeadline > 0 && !isAchieved
      ? (Math.ceil(remaining / monthsToDeadline) as Cents)
      : monthsToDeadline !== null && !isAchieved
        ? remaining // prazo já venceu: falta tudo, agora
        : null;

  return {
    goalId: goal.id,
    name: goal.name,
    target: goal.target,
    current,
    remaining,
    percent: goal.target > 0 ? Math.min(100, (current / goal.target) * 100) : 0,
    isAchieved,
    monthlyContribution: goal.monthlyContribution,
    monthsRemaining,
    forecast: monthsRemaining === null ? null : shift(hoje, monthsRemaining),
    targetDate: goal.targetDate,
    requiredMonthly,
    behindSchedule:
      !isAchieved &&
      monthsToDeadline !== null &&
      monthsRemaining !== null &&
      monthsRemaining > monthsToDeadline,
  };
}

function monthsBetween(from: Competence, to: Competence): number {
  const [fromYear, fromMonth] = from.split("-").map(Number);
  const [toYear, toMonth] = to.split("-").map(Number);
  return (toYear - fromYear) * 12 + (toMonth - fromMonth);
}

export type GoalTotals = {
  readonly targetCents: Cents;
  readonly currentCents: Cents;
  readonly remainingCents: Cents;
  readonly monthlyCommitmentCents: Cents;
  readonly achievedCount: number;
  readonly activeCount: number;
};

export function summarizeGoals(progresses: readonly GoalProgress[]): GoalTotals {
  const total = (pick: (item: GoalProgress) => Cents, items: readonly GoalProgress[] = progresses): Cents =>
    items.reduce<number>((soma, item) => soma + pick(item), 0) as Cents;

  const emAberto = progresses.filter((item) => !item.isAchieved);

  return {
    targetCents: total((item) => item.target),
    currentCents: total((item) => item.current),
    remainingCents: total((item) => item.remaining),
    // O que as metas somadas exigem por mês — dinheiro que já tem destino.
    monthlyCommitmentCents: total((item) => item.monthlyContribution, emAberto),
    achievedCount: progresses.filter((item) => item.isAchieved).length,
    activeCount: emAberto.length,
  };
}
