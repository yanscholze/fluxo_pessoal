/**
 * Simulação de antecipação de parcelas.
 *
 * Antecipar só compensa quando há juros embutidos: pagar hoje uma parcela que
 * venceria em seis meses economiza exatamente os juros desses seis meses. Numa
 * compra sem juros a economia é zero, e o simulador precisa dizer isso em vez
 * de inventar um desconto — o efeito real ali é só liberar limite e encurtar o
 * compromisso.
 */

import { validationError } from "../../kernel/errors.ts";
import { type Cents, ZERO, subtract, sum } from "../../kernel/money.ts";
import { type Competence, compareCompetence, distance } from "../../time/competence.ts";
import type { ScheduledInstallment } from "./plan.ts";

/** Quais parcelas antecipar. */
export type AnticipationTarget =
  /** As últimas em aberto — carregam mais juros, é o padrão do mercado. */
  | "last"
  /** As próximas a vencer. */
  | "next";

export type AnticipationInput = {
  /** Parcelas ainda em aberto, em ordem crescente de competência. */
  readonly openInstallments: readonly ScheduledInstallment[];
  /** Quantas antecipar. */
  readonly count: number;
  /** Competência em que o pagamento antecipado acontece. */
  readonly anticipationCompetence: Competence;
  /** Juros embutidos ao mês, em pontos-base. 0 = compra sem juros. */
  readonly monthlyInterestBasisPoints: number;
  readonly target?: AnticipationTarget;
};

export type AnticipationResult = {
  /** Parcelas que seriam quitadas. */
  readonly anticipated: readonly ScheduledInstallment[];
  /** Soma nominal das parcelas antecipadas. */
  readonly nominalAmount: Cents;
  /** Quanto sairia do bolso hoje, já descontados os juros futuros. */
  readonly amountDueToday: Cents;
  /** Economia obtida. Zero quando a compra é sem juros. */
  readonly savings: Cents;
  /** Parcelas que continuam em aberto. */
  readonly remaining: readonly ScheduledInstallment[];
  /** Competência da última parcela restante. `null` se quitar tudo. */
  readonly newEndCompetence: Competence | null;
  /** Quanto deixa de sair por mês, competência a competência. */
  readonly monthlyRelief: readonly { competence: Competence; amount: Cents }[];
  /** Média mensal liberada nos meses afetados. */
  readonly averageMonthlyRelief: Cents;
  /** Quantos meses o parcelamento encurta. */
  readonly monthsShortened: number;
};

/**
 * Valor presente de uma parcela que vence daqui a `months` meses.
 *
 * Desconto composto: `valor / (1 + i)^n`. Com juros zero, devolve o próprio
 * valor.
 */
function presentValue(amount: Cents, months: number, monthlyRate: number): Cents {
  if (monthlyRate <= 0 || months <= 0) return amount;
  return Math.round(amount / (1 + monthlyRate) ** months) as Cents;
}

export function simulateAnticipation(input: AnticipationInput): AnticipationResult {
  const { openInstallments, count, anticipationCompetence, monthlyInterestBasisPoints } = input;
  const target = input.target ?? "last";

  if (!Number.isInteger(count) || count < 1) {
    throw validationError("Informe quantas parcelas antecipar", [
      { path: "count", message: "Escolha ao menos uma parcela" },
    ]);
  }
  if (count > openInstallments.length) {
    throw validationError("O parcelamento não tem tantas parcelas em aberto", [
      { path: "count", message: `Há ${openInstallments.length} parcela(s) em aberto` },
    ]);
  }

  const ordered = [...openInstallments].sort((left, right) => compareCompetence(left.competence, right.competence));
  const anticipated = target === "last" ? ordered.slice(-count) : ordered.slice(0, count);
  const anticipatedIds = new Set(anticipated.map((item) => item.number));
  const remaining = ordered.filter((item) => !anticipatedIds.has(item.number));

  const monthlyRate = monthlyInterestBasisPoints / 10_000;
  const nominalAmount = sum(anticipated.map((item) => item.amount));
  const amountDueToday = sum(
    anticipated.map((item) =>
      presentValue(item.amount, Math.max(0, distance(anticipationCompetence, item.competence)), monthlyRate),
    ),
  );

  const monthlyRelief = anticipated
    .map((item) => ({ competence: item.competence, amount: item.amount }))
    .sort((left, right) => compareCompetence(left.competence, right.competence));

  const previousEnd = ordered.at(-1)?.competence ?? null;
  const newEndCompetence = remaining.at(-1)?.competence ?? null;

  return {
    anticipated,
    nominalAmount,
    amountDueToday,
    savings: subtract(nominalAmount, amountDueToday),
    remaining,
    newEndCompetence,
    monthlyRelief,
    averageMonthlyRelief: monthlyRelief.length
      ? (Math.round(nominalAmount / monthlyRelief.length) as Cents)
      : ZERO,
    monthsShortened:
      previousEnd && newEndCompetence
        ? Math.max(0, distance(newEndCompetence, previousEnd))
        : previousEnd
          ? Math.max(0, distance(anticipationCompetence, previousEnd))
          : 0,
  };
}

/**
 * Compara antecipar 1, 2, … N parcelas de uma vez.
 *
 * É o que a tela mostra: uma linha por cenário, para o usuário escolher quanto
 * quer antecipar vendo o efeito de cada opção.
 */
export function anticipationLadder(
  input: Omit<AnticipationInput, "count">,
  maxScenarios = 12,
): AnticipationResult[] {
  const total = Math.min(input.openInstallments.length, maxScenarios);
  return Array.from({ length: total }, (_unused, index) =>
    simulateAnticipation({ ...input, count: index + 1 }),
  );
}
