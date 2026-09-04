/**
 * Formatação para exibição.
 *
 * A UI recebe centavos inteiros e só aqui vira texto. Nenhum componente faz
 * `valor / 100` por conta própria — é assim que arredondamento inconsistente
 * aparece em uma tela e não em outra.
 */

import { type Cents, cents, format, formatCompact } from "../../core/kernel/money.ts";
import {
  type Competence,
  formatLong as formatCompetenceLong,
  formatShort as formatCompetenceShort,
} from "../../core/time/competence.ts";
import {
  type LocalDate,
  daysBetween,
  format as formatDate,
  formatShort as formatDateShort,
  formatWeekdayShort,
} from "../../core/time/local-date.ts";

export function money(value: number, options: { currency?: string; signed?: boolean } = {}): string {
  return format(cents(value), {
    currency: options.currency ?? "BRL",
    ...(options.signed ? { signDisplay: "always" as const } : {}),
  });
}

export function moneyCompact(value: number, currency = "BRL"): string {
  return formatCompact(cents(value), { currency });
}

/** Número decimal em pt-BR: `10,1`. `toFixed` devolveria `10.1`. */
export function decimal(value: number, fractionDigits = 1): string {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

export function percent(value: number, fractionDigits = 0): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "percent",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value / 100);
}

export function date(value: LocalDate): string {
  return formatDate(value);
}

export function dateShort(value: LocalDate): string {
  return formatDateShort(value);
}

export function weekdayShort(value: LocalDate): string {
  return formatWeekdayShort(value);
}

export function competenceShort(value: Competence): string {
  return formatCompetenceShort(value);
}

export function competenceLong(value: Competence): string {
  return formatCompetenceLong(value);
}

/**
 * Distância em linguagem natural: "hoje", "amanhã", "em 5 dias".
 *
 * Uma data absoluta obriga o leitor a fazer a conta de cabeça para saber se é
 * urgente. "Vence em 2 dias" já é a resposta.
 */
export function relativeDay(target: LocalDate, today: LocalDate): string {
  const days = daysBetween(today, target);
  if (days === 0) return "hoje";
  if (days === 1) return "amanhã";
  if (days === -1) return "ontem";
  if (days > 1) return `em ${days} dias`;
  return `há ${Math.abs(days)} dias`;
}

/** Classe de cor conforme o sinal do valor. */
export function toneOf(value: number): "positive" | "negative" | "neutral" {
  if (value > 0) return "positive";
  if (value < 0) return "negative";
  return "neutral";
}

export type { Cents };
