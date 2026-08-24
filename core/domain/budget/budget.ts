/**
 * Orçamentos.
 *
 * Um orçamento responde uma pergunta só: **quanto ainda posso gastar nesta
 * categoria neste mês?** O resto — quanto já foi, qual o percentual — existe
 * para dar contexto a essa resposta, não para substituí-la.
 */

import { type Cents, ZERO, clampToZero, subtract } from "../../kernel/money.ts";
import { type Competence, competenceMonth, competenceYear, firstDay, lastDay } from "../../time/competence.ts";
import { type LocalDate, day as dayOf, daysBetween } from "../../time/local-date.ts";

export type Budget = {
  readonly id: string;
  readonly userId: string;
  readonly categoryId: string;
  readonly amount: Cents;
  readonly startsOn: LocalDate;
  readonly endsOn: LocalDate | null;
};

/** Verdadeiro quando o orçamento vale para a competência. */
export function appliesTo(budget: Budget, competence: Competence): boolean {
  if (lastDay(competence) < budget.startsOn) return false;
  if (budget.endsOn && firstDay(competence) > budget.endsOn) return false;
  return true;
}

export type BudgetStatus = {
  readonly categoryId: string;
  readonly amount: Cents;
  readonly spent: Cents;
  /** Nunca negativo: estourar o orçamento deixa zero disponível, não dívida. */
  readonly available: Cents;
  readonly percentUsed: number;
  /**
   * Quanto o mês deve fechar mantendo o ritmo atual.
   *
   * Extrapola o gasto pelos dias já decorridos. É o número que avisa antes de
   * estourar — o percentual sozinho só conta o que já aconteceu, e quem gastou
   * 60% no dia 10 já está em rota de estouro sem que nada fique vermelho.
   */
  readonly projected: Cents;
  readonly willExceed: boolean;
  readonly daysElapsed: number;
  readonly daysInMonth: number;
};

/**
 * Situação de um orçamento numa competência.
 *
 * `today` recorta o ritmo: numa competência já encerrada, a projeção é o
 * próprio gasto, porque não há mais dias para gastar.
 *
 * `transactionCount` decide se faz sentido extrapolar. Um aluguel de R$1.800
 * pago no dia 10 projetaria R$2.325 até o fim do mês — e ele não vai acontecer
 * de novo. Um gasto isolado é um evento, não um ritmo.
 */
export function budgetStatus(
  budget: Budget,
  competence: Competence,
  spent: Cents,
  today: LocalDate,
  transactionCount = 2,
): BudgetStatus {
  const inicio = firstDay(competence);
  const fim = lastDay(competence);
  const daysInMonth = dayOf(fim);

  // Dias decorridos: o mês inteiro se já passou, nenhum se ainda não começou.
  const daysElapsed =
    today > fim ? daysInMonth : today < inicio ? 0 : Math.max(1, daysBetween(inicio, today) + 1);

  const projected =
    daysElapsed === 0 || daysElapsed >= daysInMonth || transactionCount < 2
      ? spent
      : (Math.round((spent / daysElapsed) * daysInMonth) as Cents);

  return {
    categoryId: budget.categoryId,
    amount: budget.amount,
    spent,
    available: clampToZero(subtract(budget.amount, spent)),
    percentUsed: budget.amount > 0 ? (spent / budget.amount) * 100 : 0,
    projected,
    willExceed: projected > budget.amount,
    daysElapsed,
    daysInMonth,
  };
}

export type BudgetTotals = {
  readonly amount: Cents;
  readonly spent: Cents;
  readonly available: Cents;
  readonly percentUsed: number;
  readonly exceededCount: number;
  readonly atRiskCount: number;
};

export function summarizeBudgets(statuses: readonly BudgetStatus[]): BudgetTotals {
  const amount = statuses.reduce((soma, item) => soma + item.amount, 0) as Cents;
  const spent = statuses.reduce((soma, item) => soma + item.spent, 0) as Cents;

  return {
    amount,
    spent,
    available: clampToZero(subtract(amount, spent)),
    percentUsed: amount > 0 ? (spent / amount) * 100 : 0,
    exceededCount: statuses.filter((item) => item.spent > item.amount).length,
    // Em risco: ainda não estourou, mas o ritmo leva lá.
    atRiskCount: statuses.filter((item) => item.spent <= item.amount && item.willExceed).length,
  };
}

export const NO_BUDGET: Cents = ZERO;

/** Só para exibição: o mês da competência, em número. */
export function monthOf(competence: Competence): { year: number; month: number } {
  return { year: competenceYear(competence), month: competenceMonth(competence) };
}
