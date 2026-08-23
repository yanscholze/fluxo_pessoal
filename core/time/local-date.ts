/**
 * Data civil (`YYYY-MM-DD`), sem hora e sem fuso.
 *
 * Uma compra feita em 13/08 é 13/08 em qualquer lugar do mundo — não é um
 * instante no tempo, é um fato do calendário. Usar `Date` para isso convida
 * bugs de fuso: `new Date().toISOString().slice(0, 10)` devolve o dia seguinte
 * a partir das 21h no horário de Brasília, jogando lançamentos para a
 * competência errada.
 *
 * Toda a aritmética aqui é feita em UTC ao meio-dia, distante o bastante das
 * bordas do dia para que nenhum ajuste de fuso mude o resultado.
 */

declare const localDateBrand: unique symbol;

export type LocalDate = string & { readonly [localDateBrand]: true };

export class DateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DateError";
  }
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Fuso oficial do produto. O Brasil não adota horário de verão desde 2019. */
export const BRAZIL_TIME_ZONE = "America/Sao_Paulo";

export function isLocalDate(value: unknown): value is LocalDate {
  if (typeof value !== "string") return false;
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12));
  return (
    date.getUTCFullYear() === Number(year) &&
    date.getUTCMonth() === Number(month) - 1 &&
    date.getUTCDate() === Number(day)
  );
}

/** Valida e marca uma string como `LocalDate`. Lança se o dia não existir. */
export function localDate(value: string): LocalDate {
  if (!isLocalDate(value)) throw new DateError(`Data inválida: ${value}`);
  return value;
}

/** Versão tolerante: devolve `null` em vez de lançar. Para entrada externa. */
export function parseLocalDate(value: unknown): LocalDate | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, 10);
  return isLocalDate(trimmed) ? trimmed : null;
}

export function fromParts(year: number, month: number, day: number): LocalDate {
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  return toLocalDate(date);
}

function toLocalDate(date: Date): LocalDate {
  if (Number.isNaN(date.getTime())) throw new DateError("Data inválida");
  const year = String(date.getUTCFullYear()).padStart(4, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}` as LocalDate;
}

function toUtcNoon(value: LocalDate): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

/**
 * O dia de hoje no fuso de Brasília.
 *
 * Recebe o instante como parâmetro para que todo cálculo do domínio seja
 * determinístico e testável — nada no domínio lê o relógio sozinho.
 */
export function todayIn(now: Date = new Date(), timeZone: string = BRAZIL_TIME_ZONE): LocalDate {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
    if (isLocalDate(parts)) return parts;
  } catch {
    // Ambiente sem base de fusos: cai no deslocamento fixo abaixo.
  }
  const fallback = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  return toLocalDate(new Date(Date.UTC(fallback.getUTCFullYear(), fallback.getUTCMonth(), fallback.getUTCDate(), 12)));
}

export function year(value: LocalDate): number {
  return Number(value.slice(0, 4));
}

export function month(value: LocalDate): number {
  return Number(value.slice(5, 7));
}

export function day(value: LocalDate): number {
  return Number(value.slice(8, 10));
}

/** 0 = domingo, 6 = sábado. */
export function weekday(value: LocalDate): number {
  return toUtcNoon(value).getUTCDay();
}

export function addDays(value: LocalDate, days: number): LocalDate {
  const date = toUtcNoon(value);
  date.setUTCDate(date.getUTCDate() + days);
  return toLocalDate(date);
}

/**
 * Soma meses preservando o dia quando possível.
 *
 * 31/01 + 1 mês = 28/02 (ou 29/02 em ano bissexto), não 03/03. É a regra que
 * mantém a parcela 2/12 de uma compra feita dia 31 caindo no fim do mês
 * seguinte, e não pulando para o mês subsequente.
 */
export function addMonths(value: LocalDate, months: number): LocalDate {
  const currentYear = year(value);
  const currentMonth = month(value);
  const currentDay = day(value);
  const target = new Date(Date.UTC(currentYear, currentMonth - 1 + months, 1, 12));
  const lastDay = lastDayOfMonthNumber(target.getUTCFullYear(), target.getUTCMonth() + 1);
  target.setUTCDate(Math.min(currentDay, lastDay));
  return toLocalDate(target);
}

function lastDayOfMonthNumber(fullYear: number, monthNumber: number): number {
  return new Date(Date.UTC(fullYear, monthNumber, 0, 12)).getUTCDate();
}

export function lastDayOfMonth(value: LocalDate): LocalDate {
  return fromParts(year(value), month(value), lastDayOfMonthNumber(year(value), month(value)));
}

export function firstDayOfMonth(value: LocalDate): LocalDate {
  return fromParts(year(value), month(value), 1);
}

/** Dias inteiros de `from` até `to`. Negativo quando `to` é anterior. */
export function daysBetween(from: LocalDate, to: LocalDate): number {
  const millis = toUtcNoon(to).getTime() - toUtcNoon(from).getTime();
  return Math.round(millis / 86_400_000);
}

/** Ordenação: negativo, zero ou positivo. Comparação lexicográfica basta em ISO. */
export function compare(left: LocalDate, right: LocalDate): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function isBefore(left: LocalDate, right: LocalDate): boolean {
  return left < right;
}

export function isAfter(left: LocalDate, right: LocalDate): boolean {
  return left > right;
}

export function isSameOrBefore(left: LocalDate, right: LocalDate): boolean {
  return left <= right;
}

export function isSameOrAfter(left: LocalDate, right: LocalDate): boolean {
  return left >= right;
}

/** Verdadeiro quando `value` está no intervalo fechado `[start, end]`. */
export function isWithin(value: LocalDate, start: LocalDate, end: LocalDate): boolean {
  return value >= start && value <= end;
}

export function earliest(values: readonly LocalDate[]): LocalDate | null {
  return values.length ? values.reduce((left, right) => (left <= right ? left : right)) : null;
}

export function latest(values: readonly LocalDate[]): LocalDate | null {
  return values.length ? values.reduce((left, right) => (left >= right ? left : right)) : null;
}

/** Sequência de dias de `start` até `end`, inclusive. */
export function eachDay(start: LocalDate, end: LocalDate): LocalDate[] {
  const result: LocalDate[] = [];
  for (let current = start; current <= end; current = addDays(current, 1)) result.push(current);
  return result;
}

const dateFormatterCache = new Map<string, Intl.DateTimeFormat>();

function dateFormatter(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  const cached = dateFormatterCache.get(key);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" });
  dateFormatterCache.set(key, formatter);
  return formatter;
}

/** `13/08/2026` */
export function format(value: LocalDate, locale = "pt-BR"): string {
  return dateFormatter(locale, { day: "2-digit", month: "2-digit", year: "numeric" }).format(toUtcNoon(value));
}

/** `13 de ago.` — para listas de próximos vencimentos. */
export function formatShort(value: LocalDate, locale = "pt-BR"): string {
  return dateFormatter(locale, { day: "2-digit", month: "short" }).format(toUtcNoon(value));
}

/** `quinta-feira, 13 de agosto de 2026` */
export function formatLong(value: LocalDate, locale = "pt-BR"): string {
  return dateFormatter(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(
    toUtcNoon(value),
  );
}
