/**
 * Competência (`YYYY-MM`) — o mês financeiro a que um lançamento pertence.
 *
 * Não confundir com o mês civil da data. Uma compra no crédito feita em 14/08,
 * com cartão que fecha dia 13, tem competência 2026-09: é em setembro que ela
 * vira obrigação. A regra que faz essa atribuição está em
 * `core/domain/card/invoice-cycle.ts`; aqui ficam apenas o tipo e sua
 * aritmética.
 */

import { businessDaysInMonth } from "./brazilian-calendar.ts";
import { type LocalDate, DateError, fromParts, lastDayOfMonth } from "./local-date.ts";

declare const competenceBrand: unique symbol;

export type Competence = string & { readonly [competenceBrand]: true };

const ISO_MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function isCompetence(value: unknown): value is Competence {
  return typeof value === "string" && ISO_MONTH.test(value);
}

export function competence(value: string): Competence {
  if (!isCompetence(value)) throw new DateError(`Competência inválida: ${value}`);
  return value;
}

export function parseCompetence(value: unknown): Competence | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, 7);
  return isCompetence(trimmed) ? trimmed : null;
}

export function competenceOf(date: LocalDate): Competence {
  return date.slice(0, 7) as Competence;
}

export function competenceFromParts(fullYear: number, monthNumber: number): Competence {
  const normalized = new Date(Date.UTC(fullYear, monthNumber - 1, 1, 12));
  const y = String(normalized.getUTCFullYear()).padStart(4, "0");
  const m = String(normalized.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}` as Competence;
}

export function competenceYear(value: Competence): number {
  return Number(value.slice(0, 4));
}

export function competenceMonth(value: Competence): number {
  return Number(value.slice(5, 7));
}

/** Desloca a competência em meses. Aceita deslocamento negativo. */
export function shift(value: Competence, months: number): Competence {
  return competenceFromParts(competenceYear(value), competenceMonth(value) + months);
}

export function next(value: Competence): Competence {
  return shift(value, 1);
}

export function previous(value: Competence): Competence {
  return shift(value, -1);
}

export function compareCompetence(left: Competence, right: Competence): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Diferença em meses: `distance("2026-08", "2026-11")` = 3. */
export function distance(from: Competence, to: Competence): number {
  return (competenceYear(to) - competenceYear(from)) * 12 + (competenceMonth(to) - competenceMonth(from));
}

export function firstDay(value: Competence): LocalDate {
  return fromParts(competenceYear(value), competenceMonth(value), 1);
}

export function lastDay(value: Competence): LocalDate {
  return lastDayOfMonth(firstDay(value));
}

/** Verdadeiro quando a data cai dentro do mês civil da competência. */
export function containsDate(value: Competence, date: LocalDate): boolean {
  return competenceOf(date) === value;
}

/** Sequência de competências de `from` até `to`, inclusive. */
export function range(from: Competence, to: Competence): Competence[] {
  const total = distance(from, to);
  if (total < 0) return [];
  return Array.from({ length: total + 1 }, (_unused, index) => shift(from, index));
}

/** `count` competências a partir de `from`, inclusive. Base do parcelamento. */
export function series(from: Competence, count: number): Competence[] {
  if (!Number.isInteger(count) || count < 1) throw new DateError(`Quantidade inválida: ${count}`);
  return Array.from({ length: count }, (_unused, index) => shift(from, index));
}

const labelCache = new Map<string, string>();

/** `ago/2026` — para eixos de gráfico e listas compactas. */
export function formatShort(value: Competence, locale = "pt-BR"): string {
  const key = `short|${locale}|${value}`;
  const cached = labelCache.get(key);
  if (cached) return cached;
  const label = new Intl.DateTimeFormat(locale, { month: "short", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(competenceYear(value), competenceMonth(value) - 1, 15)))
    .replace(/\./g, "");
  labelCache.set(key, label);
  return label;
}

/** `agosto de 2026` — para títulos. */
export function formatLong(value: Competence, locale = "pt-BR"): string {
  const key = `long|${locale}|${value}`;
  const cached = labelCache.get(key);
  if (cached) return cached;
  const label = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(competenceYear(value), competenceMonth(value) - 1, 15)),
  );
  labelCache.set(key, label);
  return label;
}

/** Dias úteis do mês da competência. Base do cálculo de vale-alimentação. */
export function businessDayCount(value: Competence): number {
  return businessDaysInMonth(competenceYear(value), competenceMonth(value));
}
