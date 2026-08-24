/**
 * Ciclo de fatura — a regra mais importante do Fluxo.
 *
 * Um cartão que fecha dia 13 divide o tempo em janelas que não coincidem com o
 * mês civil: a competência de agosto vai de 14/07 a 13/08. Uma compra em 13/08
 * entra na fatura de agosto; em 14/08, na de setembro. Toda tela que fale de
 * fatura, parcela, comprometimento ou livre para gastar depende desta regra —
 * por isso ela existe uma única vez, aqui.
 */

import { validationError } from "../../kernel/errors.ts";
import {
  type BusinessDayAdjustment,
  adjustToBusinessDay,
} from "../../time/brazilian-calendar.ts";
import {
  type Competence,
  competenceOf,
  firstDay,
  next,
  previous,
  series,
  shift,
} from "../../time/competence.ts";
import {
  type LocalDate,
  addDays,
  day as dayOf,
  daysBetween,
  fromParts,
  lastDayOfMonth,
  month,
  year,
} from "../../time/local-date.ts";

/** O que um cartão precisa expor para que seu ciclo seja calculável. */
export type CycleConfig = {
  /** Dia do fechamento (1–31). Dias inexistentes no mês caem no último dia. */
  readonly closingDay: number;
  /** Dia do vencimento (1–31). */
  readonly dueDay: number;
  /** Como resolver um vencimento que cai em dia não útil. */
  readonly dueAdjustment: BusinessDayAdjustment;
};

/** Janela de datas cobertas por uma competência. Início e fim inclusivos. */
export type CycleWindow = {
  readonly competence: Competence;
  /** Dia seguinte ao fechamento anterior. */
  readonly start: LocalDate;
  /** Data efetiva de fechamento. */
  readonly end: LocalDate;
};

export function assertValidCycle(config: CycleConfig): void {
  const issues = [];
  if (!Number.isInteger(config.closingDay) || config.closingDay < 1 || config.closingDay > 31) {
    issues.push({ path: "closingDay", message: "O dia de fechamento deve estar entre 1 e 31" });
  }
  if (!Number.isInteger(config.dueDay) || config.dueDay < 1 || config.dueDay > 31) {
    issues.push({ path: "dueDay", message: "O dia de vencimento deve estar entre 1 e 31" });
  }
  if (config.dueAdjustment !== "previous" && config.dueAdjustment !== "next") {
    issues.push({ path: "dueAdjustment", message: "Ajuste de vencimento inválido" });
  }
  if (issues.length) throw validationError("Configuração de ciclo inválida", issues);
}

/** Aplica um dia nominal a um mês, grampeando no último dia existente. */
function dayInMonth(competence: Competence, nominalDay: number): LocalDate {
  const reference = firstDay(competence);
  const lastDay = dayOf(lastDayOfMonth(reference));
  return fromParts(year(reference), month(reference), Math.min(Math.max(1, nominalDay), lastDay));
}

/**
 * Data em que a fatura de uma competência fecha.
 *
 * Fechamento em dia não útil **recua** para o dia útil anterior: o emissor não
 * processa a virada num sábado, então a compra de sábado já é do ciclo
 * seguinte.
 */
export function closingDateFor(config: CycleConfig, competence: Competence): LocalDate {
  return adjustToBusinessDay(dayInMonth(competence, config.closingDay), "previous");
}

/**
 * Data em que a fatura de uma competência vence.
 *
 * Quando o dia de vencimento é anterior ou igual ao de fechamento, o
 * vencimento cai no mês seguinte — é o caso comum de "fecha dia 13, vence dia
 * 5". Quando é posterior, vence no próprio mês da competência.
 */
export function dueDateFor(config: CycleConfig, competence: Competence): LocalDate {
  const dueCompetence = config.dueDay <= config.closingDay ? next(competence) : competence;
  return adjustToBusinessDay(dayInMonth(dueCompetence, config.dueDay), config.dueAdjustment);
}

/**
 * A competência a que uma compra pertence.
 *
 * É a mesma função que decide qual é a fatura ativa hoje — porque são a mesma
 * pergunta: "uma compra feita nesta data cai em qual fatura?".
 */
export function competenceForPurchase(config: CycleConfig, purchaseDate: LocalDate): Competence {
  // A competência certa é a primeira cujo fechamento ainda não passou.
  //
  // Um único passo à frente não basta: com fechamento no dia 1 ou 2, o
  // fechamento efetivo recua para o mês anterior, e a compra do fim do mês
  // fica depois do fechamento de **duas** competências seguidas. Dar um passo
  // só jogava a compra numa fatura já fechada.
  let candidate = competenceOf(purchaseDate);
  for (let guard = 0; guard < 4; guard += 1) {
    if (purchaseDate <= closingDateFor(config, candidate)) return candidate;
    candidate = next(candidate);
  }
  return candidate;
}

/** A fatura que está aberta e recebendo compras na data informada. */
export function activeCompetence(config: CycleConfig, today: LocalDate): Competence {
  return competenceForPurchase(config, today);
}

/** Janela `(fechamento anterior, fechamento]` de uma competência. */
export function cycleWindowFor(config: CycleConfig, competence: Competence): CycleWindow {
  return {
    competence,
    start: addDays(closingDateFor(config, previous(competence)), 1),
    end: closingDateFor(config, competence),
  };
}

/** Janela do ciclo que está aberto na data informada. */
export function activeCycleWindow(config: CycleConfig, today: LocalDate): CycleWindow {
  return cycleWindowFor(config, activeCompetence(config, today));
}

/** Verdadeiro quando a data cai dentro da janela do ciclo. */
export function isWithinCycle(window: CycleWindow, date: LocalDate): boolean {
  return date >= window.start && date <= window.end;
}

/**
 * Quantos dias faltam para o fechamento da fatura **ativa**.
 *
 * Ancorar no mês civil devolvia número negativo para uma fatura diferente da
 * que a tela mostra ao lado: com fechamento dia 13 e hoje dia 20, a fatura
 * aberta é a do mês seguinte, mas a contagem olhava o fechamento que já
 * passou e exibia "em −7 dias".
 */
export function daysUntilClosing(config: CycleConfig, today: LocalDate): number {
  return daysBetween(today, closingDateFor(config, activeCompetence(config, today)));
}

/**
 * Competência de cada parcela de uma compra parcelada.
 *
 * A parcela 1 cai na competência da própria compra; as demais avançam um mês
 * por vez. É por isso que `installment_number` é um inteiro no banco, e não o
 * texto `"3/12"`.
 */
export function installmentCompetences(
  config: CycleConfig,
  purchaseDate: LocalDate,
  count: number,
): Competence[] {
  return series(competenceForPurchase(config, purchaseDate), count);
}

/** As `count` próximas competências a partir da fatura ativa, inclusive. */
export function upcomingCompetences(config: CycleConfig, today: LocalDate, count: number): Competence[] {
  return series(activeCompetence(config, today), count);
}

/** Datas de fechamento e vencimento juntas, para exibição. */
export type InvoiceSchedule = {
  readonly competence: Competence;
  readonly closingDate: LocalDate;
  readonly dueDate: LocalDate;
  readonly window: CycleWindow;
};

export function scheduleFor(config: CycleConfig, competence: Competence): InvoiceSchedule {
  return {
    competence,
    closingDate: closingDateFor(config, competence),
    dueDate: dueDateFor(config, competence),
    window: cycleWindowFor(config, competence),
  };
}

/** Agenda das próximas `count` faturas a partir da ativa. */
export function upcomingSchedules(config: CycleConfig, today: LocalDate, count: number): InvoiceSchedule[] {
  const active = activeCompetence(config, today);
  return Array.from({ length: count }, (_unused, index) => scheduleFor(config, shift(active, index)));
}
