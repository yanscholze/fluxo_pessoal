/**
 * Situação de um projeto: dinheiro, tempo e prazo.
 *
 * As três perguntas que um projeto precisa responder são "quanto ainda tenho a
 * receber", "está dando o lucro que eu previa" e "vai atrasar". Todas as três
 * são derivadas — de parcelas, de sessões de trabalho e de datas — e nenhuma
 * delas pode ser um campo guardado, pelo mesmo motivo que saldo não é coluna:
 * um número mantido à mão desanda e ninguém sabe quando.
 */

import { type Cents, ZERO, clampToZero, sum } from "../../kernel/money.ts";
import { type LocalDate, daysBetween } from "../../time/local-date.ts";
import { type Milli, ZERO_MILLI, amountFor, effectiveRate, sumMilli } from "./hours.ts";

/** Uma parcela do contrato. */
export type PaymentLike = {
  readonly amount: Cents;
  readonly dueOn: LocalDate;
  /** Preenchido quando o dinheiro entrou de verdade. */
  readonly receivedOn: LocalDate | null;
};

/** Uma sessão de trabalho. */
export type TimeEntryLike = {
  readonly duration: Milli;
  readonly billable: boolean;
  /** Valor/hora congelado no momento do registro. */
  readonly rate: Cents;
};

export type ProjectFinance = {
  /** O que foi combinado. */
  readonly contracted: Cents;
  /** O que já entrou. */
  readonly received: Cents;
  /** O que falta receber e ainda não venceu. */
  readonly pending: Cents;
  /** O que falta receber e já venceu. */
  readonly overdue: Cents;
  /**
   * Diferença entre o contrato e a soma das parcelas.
   *
   * Positivo significa contrato sem parcela correspondente — dinheiro
   * combinado que ninguém agendou para cobrar. É o vazamento mais comum de
   * quem trabalha por projeto, e por isso é um número, não uma nota de rodapé.
   */
  readonly unscheduled: Cents;
  readonly nextDueOn: LocalDate | null;
  readonly percentReceived: number;
};

export function summarizeFinance(
  contracted: Cents,
  payments: readonly PaymentLike[],
  today: LocalDate,
): ProjectFinance {
  let received = 0;
  let pending = 0;
  let overdue = 0;
  let agendado = 0;
  let proximo: LocalDate | null = null;

  for (const payment of payments) {
    agendado += payment.amount;

    if (payment.receivedOn) {
      received += payment.amount;
      continue;
    }

    if (payment.dueOn < today) {
      overdue += payment.amount;
    } else {
      pending += payment.amount;
      // A próxima é a mais cedo entre as que ainda vão vencer.
      if (proximo === null || payment.dueOn < proximo) proximo = payment.dueOn;
    }
  }

  return {
    contracted,
    received: received as Cents,
    pending: pending as Cents,
    overdue: overdue as Cents,
    unscheduled: clampToZero((contracted - agendado) as Cents),
    nextDueOn: proximo,
    percentReceived: contracted > 0 ? Math.min(100, (received / contracted) * 100) : 0,
  };
}

export type ProjectEffort = {
  readonly estimated: Milli;
  readonly worked: Milli;
  /** Só o tempo que pode ser cobrado. */
  readonly billableWorked: Milli;
  /** Quanto ainda cabe na estimativa. Negativo quando estourou. */
  readonly remaining: number;
  /** Quanto do estimado já foi consumido, em pontos percentuais. */
  readonly percentUsed: number;
  readonly overrun: boolean;
  /** O que o tempo cobrável vale, aos valores/hora congelados. */
  readonly billableAmount: Cents;
  /** O que se combinou por hora. */
  readonly plannedRate: Cents;
  /**
   * O que de fato se ganhou por hora — o recebido dividido pelo tempo **todo**,
   * cobrável ou não.
   *
   * Dividir só pelas horas cobráveis inflaria o número justamente nos projetos
   * que deram mais retrabalho, escondendo o prejuízo que se quer enxergar.
   */
  readonly effectiveRate: Cents | null;
};

export function summarizeEffort(
  estimated: Milli,
  entries: readonly TimeEntryLike[],
  plannedRate: Cents,
  received: Cents,
): ProjectEffort {
  const worked = sumMilli(entries.map((entry) => entry.duration));
  const cobravel = entries.filter((entry) => entry.billable);
  const billableWorked = sumMilli(cobravel.map((entry) => entry.duration));
  const billableAmount = sum(cobravel.map((entry) => amountFor(entry.duration, entry.rate)));

  return {
    estimated,
    worked,
    billableWorked,
    remaining: estimated - worked,
    percentUsed: estimated > 0 ? (worked / estimated) * 100 : 0,
    overrun: estimated > 0 && worked > estimated,
    billableAmount,
    plannedRate,
    effectiveRate: effectiveRate(received, worked),
  };
}

export type DeadlineStatus = "sem-prazo" | "no-prazo" | "perto" | "atrasado" | "entregue";

export type ProjectDeadline = {
  readonly status: DeadlineStatus;
  /** Dias até o prazo. Negativo quando já passou. `null` sem prazo. */
  readonly daysLeft: number | null;
  readonly dueOn: LocalDate | null;
};

/** Quantos dias antes do prazo o projeto passa a pedir atenção. */
const JANELA_DE_ALERTA = 7;

export function evaluateDeadline(
  dueOn: LocalDate | null,
  deliveredOn: LocalDate | null,
  today: LocalDate,
): ProjectDeadline {
  if (deliveredOn) return { status: "entregue", daysLeft: null, dueOn };
  if (!dueOn) return { status: "sem-prazo", daysLeft: null, dueOn: null };

  const dias = daysBetween(today, dueOn);
  const status: DeadlineStatus = dias < 0 ? "atrasado" : dias <= JANELA_DE_ALERTA ? "perto" : "no-prazo";

  return { status, daysLeft: dias, dueOn };
}

export type ProjectHealth = {
  readonly finance: ProjectFinance;
  readonly effort: ProjectEffort;
  readonly deadline: ProjectDeadline;
  /**
   * O projeto está dando o retorno combinado.
   *
   * `null` quando não há valor/hora combinado — sem base, comparar não diz
   * nada. Preferir `null` a assumir zero evita a tela afirmar "abaixo do
   * combinado" para quem nunca combinou nada.
   */
  readonly meetsRate: boolean | null;
};

export function evaluateProject(input: {
  readonly contracted: Cents;
  readonly estimated: Milli;
  readonly plannedRate: Cents;
  readonly payments: readonly PaymentLike[];
  readonly entries: readonly TimeEntryLike[];
  readonly dueOn: LocalDate | null;
  readonly deliveredOn: LocalDate | null;
  readonly today: LocalDate;
}): ProjectHealth {
  const finance = summarizeFinance(input.contracted, input.payments, input.today);
  const effort = summarizeEffort(input.estimated, input.entries, input.plannedRate, finance.received);
  const deadline = evaluateDeadline(input.dueOn, input.deliveredOn, input.today);

  const meetsRate =
    input.plannedRate > 0 && effort.effectiveRate !== null
      ? effort.effectiveRate >= input.plannedRate
      : null;

  return { finance, effort, deadline, meetsRate };
}

export const EMPTY_EFFORT: ProjectEffort = {
  estimated: ZERO_MILLI,
  worked: ZERO_MILLI,
  billableWorked: ZERO_MILLI,
  remaining: 0,
  percentUsed: 0,
  overrun: false,
  billableAmount: ZERO,
  plannedRate: ZERO,
  effectiveRate: null,
};
