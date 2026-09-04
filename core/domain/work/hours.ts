/**
 * Horas de trabalho.
 *
 * A unidade é o **milésimo de hora**, inteiro. Meia hora é 500, um quarto de
 * hora é 250, e a soma de quatro quartos dá exatamente 1000. Guardar horas
 * como decimal parece inofensivo até somar oito sessões de 0,1h e obter
 * 0,7999999999999999 — que, multiplicado pelo valor/hora, cobra um centavo a
 * menos do cliente e não fecha com nada.
 *
 * É a mesma decisão do dinheiro em centavos, pelo mesmo motivo: a unidade
 * mínima do domínio é inteira, e a conversão para a forma legível acontece só
 * na borda.
 */

import { validationError } from "../../kernel/errors.ts";
import type { Cents } from "../../kernel/money.ts";

declare const hoursBrand: unique symbol;

/** Duração em milésimos de hora. Sempre inteiro, nunca negativo. */
export type Milli = number & { readonly [hoursBrand]: true };

export const ZERO_MILLI = 0 as Milli;

/** Uma hora cheia. */
export const HOUR = 1000 as Milli;

export function milli(value: number): Milli {
  if (!Number.isInteger(value)) {
    throw validationError("Duração deve ser um inteiro em milésimos de hora", [
      { path: "duration", message: "Use milésimos de hora, sem casas decimais" },
    ]);
  }
  if (value < 0) {
    throw validationError("Duração não pode ser negativa", [
      { path: "duration", message: "Informe uma duração maior que zero" },
    ]);
  }
  return value as Milli;
}

/**
 * Converte horas decimais em milésimos, arredondando ao milésimo mais próximo.
 *
 * É a porta de entrada do que o usuário digita: "1,5" vira 1500, "0,33" vira
 * 330. O arredondamento acontece **uma vez**, aqui, e nunca mais.
 */
export function fromHours(hours: number): Milli {
  if (!Number.isFinite(hours) || hours < 0) {
    throw validationError("Informe uma duração válida", [
      { path: "hours", message: "Use um número de horas maior ou igual a zero" },
    ]);
  }
  return Math.round(hours * 1000) as Milli;
}

/** Converte uma duração em minutos para milésimos de hora. */
export function fromMinutes(minutes: number): Milli {
  return fromHours(minutes / 60);
}

export function sumMilli(values: readonly Milli[]): Milli {
  let total = 0;
  for (const value of values) total += value;
  return total as Milli;
}

export function subtractMilli(left: Milli, right: Milli): number {
  return left - right;
}

/** Horas decimais, para exibição. Nunca use o resultado em cálculo. */
export function toHours(value: Milli): number {
  return value / 1000;
}

/**
 * Quanto vale um tempo trabalhado a um dado valor/hora.
 *
 * `rate` é o preço de **uma hora** em centavos. A multiplicação acontece em
 * inteiros e arredonda no fim: `1500 milli × 12000 centavos / 1000` são
 * exatamente 18000 centavos, sem passar por decimal em nenhum momento.
 */
export function amountFor(duration: Milli, rate: Cents): Cents {
  return Math.round((duration * rate) / 1000) as Cents;
}

/**
 * Valor/hora efetivo: o que de fato se ganhou por hora.
 *
 * É sempre um **cálculo**, nunca um dado guardado: a receita do projeto
 * dividida pelo tempo que ele custou. Congelar o preço em cada sessão faria
 * este número depender de quando cada hora foi lançada em vez do que o projeto
 * rendeu — e receber uma parcela a mais não mudaria um número que deveria
 * mudar.
 *
 * Devolve `null` quando não houve tempo registrado — dividir por zero daria
 * infinito, e "infinito por hora" não é uma informação, é um bug na tela.
 */
export function effectiveRate(amount: Cents, duration: Milli): Cents | null {
  if (duration <= 0) return null;
  return Math.round((amount * 1000) / duration) as Cents;
}
