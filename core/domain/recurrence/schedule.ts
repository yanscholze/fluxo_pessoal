/**
 * Recorrências.
 *
 * Uma recorrência é uma **regra**, e as ocorrências dela são derivadas —
 * calculadas na hora, não gravadas. A versão anterior inseria treze meses de
 * lançamentos previstos no banco como efeito colateral de uma leitura: o
 * `GET` do painel escrevia. Isso enchia a tabela de linhas que ninguém pediu,
 * e editar a regra deixava para trás as projeções antigas, erradas.
 *
 * Aqui a projeção é sempre fruto da regra atual. Só vira linha no banco quando
 * o usuário confirma que aconteceu.
 */

import { validationError } from "../../kernel/errors.ts";
import { type Cents, multiply } from "../../kernel/money.ts";
import {
  type BusinessDayAdjustment,
  adjustToBusinessDay,
  businessDaysInMonth,
  nthBusinessDayOfMonth,
} from "../../time/brazilian-calendar.ts";
import {
  type Competence,
  competenceMonth,
  competenceYear,
  firstDay,
  range,
  shift,
} from "../../time/competence.ts";
import { type LocalDate, day as dayOf, fromParts, lastDayOfMonth, month } from "../../time/local-date.ts";

/** O papel muda como a recorrência é apresentada — nunca como é agendada. */
export type RecurrenceRole = "standard" | "salary" | "benefit" | "subscription";

/**
 * `fixed`: o valor é o valor.
 * `per_business_day`: valor × dias úteis do mês. É como funciona o
 * vale-alimentação — o crédito varia com o calendário.
 */
export type AmountMode = "fixed" | "per_business_day";

/**
 * `day_of_month`: dia fixo, ajustado ao dia útil.
 * `business_day_of_month`: o N-ésimo dia útil — o caso do salário.
 */
export type ScheduleMode = "day_of_month" | "business_day_of_month";

export type RecurrenceInterval = "monthly" | "yearly";

export type Recurrence = {
  readonly id: string;
  readonly userId: string;
  readonly role: RecurrenceRole;
  readonly kind: "expense" | "income" | "transfer";
  readonly description: string;
  readonly categoryId: string | null;
  readonly accountId: string | null;
  readonly cardId: string | null;
  readonly destinationAccountId: string | null;
  readonly amount: Cents;
  readonly amountMode: AmountMode;
  readonly scheduleMode: ScheduleMode;
  /** Dia do mês, ou o ordinal do dia útil, conforme `scheduleMode`. */
  readonly scheduleDay: number;
  readonly dayAdjustment: BusinessDayAdjustment;
  readonly interval: RecurrenceInterval;
  readonly startsOn: LocalDate;
  readonly endsOn: LocalDate | null;
  readonly isActive: boolean;
};

/** Uma execução prevista da regra numa competência. */
export type Occurrence = {
  readonly recurrenceId: string;
  readonly competence: Competence;
  readonly date: LocalDate;
  readonly amount: Cents;
};

export function assertValidSchedule(input: Pick<Recurrence, "scheduleMode" | "scheduleDay">): void {
  const limite = input.scheduleMode === "business_day_of_month" ? 23 : 31;
  if (!Number.isInteger(input.scheduleDay) || input.scheduleDay < 1 || input.scheduleDay > limite) {
    throw validationError(
      input.scheduleMode === "business_day_of_month"
        ? "O dia útil precisa estar entre 1 e 23"
        : "O dia do mês precisa estar entre 1 e 31",
      [{ path: "scheduleDay", message: `Informe de 1 a ${limite}` }],
    );
  }
}

/** Data em que a regra cai numa competência. */
export function occurrenceDate(rule: Recurrence, competence: Competence): LocalDate {
  const ano = competenceYear(competence);
  const mes = competenceMonth(competence);

  if (rule.scheduleMode === "business_day_of_month") {
    return nthBusinessDayOfMonth(ano, mes, rule.scheduleDay);
  }

  const referencia = firstDay(competence);
  const ultimoDia = dayOf(lastDayOfMonth(referencia));
  const nominal = fromParts(ano, mes, Math.min(rule.scheduleDay, ultimoDia));
  return adjustToBusinessDay(nominal, rule.dayAdjustment);
}

/**
 * Valor da regra numa competência.
 *
 * No modo por dia útil, o valor é multiplicado pelos dias úteis daquele mês —
 * um mês com feriado credita menos, e é isso que faz o vale-alimentação bater
 * com o extrato.
 */
export function occurrenceAmount(rule: Recurrence, competence: Competence): Cents {
  if (rule.amountMode === "fixed") return rule.amount;
  return multiply(rule.amount, businessDaysInMonth(competenceYear(competence), competenceMonth(competence)));
}

/** Verdadeiro quando a regra vale para a competência. */
export function appliesTo(rule: Recurrence, competence: Competence): boolean {
  if (!rule.isActive) return false;

  const data = occurrenceDate(rule, competence);
  if (data < rule.startsOn) return false;
  if (rule.endsOn && data > rule.endsOn) return false;

  // Anual só cai no mês em que começou.
  if (rule.interval === "yearly" && competenceMonth(competence) !== month(rule.startsOn)) return false;

  return true;
}

/** Ocorrências da regra no intervalo de competências, inclusive. */
export function occurrencesBetween(
  rule: Recurrence,
  from: Competence,
  to: Competence,
): Occurrence[] {
  return range(from, to)
    .filter((competence) => appliesTo(rule, competence))
    .map((competence) => ({
      recurrenceId: rule.id,
      competence,
      date: occurrenceDate(rule, competence),
      amount: occurrenceAmount(rule, competence),
    }));
}

/** Ocorrências de várias regras, ordenadas por data. */
export function projectOccurrences(
  rules: readonly Recurrence[],
  from: Competence,
  to: Competence,
): Occurrence[] {
  return rules
    .flatMap((rule) => occurrencesBetween(rule, from, to))
    .sort((left, right) => left.date.localeCompare(right.date));
}

/**
 * Chave natural de uma ocorrência.
 *
 * É o que torna a confirmação idempotente: confirmar o salário de agosto duas
 * vezes gera a mesma chave e a segunda não cria nada. Substitui o
 * `recurring:<id>:<mês>` que a versão anterior montava à mão em vários lugares.
 */
export function occurrenceKey(recurrenceId: string, competence: Competence): string {
  return `recurrence:${recurrenceId}:${competence}`;
}

/** Próxima ocorrência a partir de uma data, olhando `monthsAhead` meses. */
export function nextOccurrence(
  rule: Recurrence,
  after: LocalDate,
  monthsAhead = 24,
): Occurrence | null {
  const inicio = after.slice(0, 7) as Competence;
  const fim = shiftCompetence(inicio, monthsAhead);
  return occurrencesBetween(rule, inicio, fim).find((item) => item.date >= after) ?? null;
}

function shiftCompetence(competence: Competence, months: number): Competence {
  return shift(competence, months);
}
