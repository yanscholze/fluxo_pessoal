/**
 * Calendário bancário brasileiro.
 *
 * Fechamento de fatura, vencimento, salário no N-ésimo dia útil e o cálculo do
 * vale-alimentação dependem todos de "isto é dia útil?". A resposta é uma só e
 * mora aqui.
 */

import {
  type LocalDate,
  addDays,
  day,
  fromParts,
  isBefore,
  month,
  weekday,
  year,
} from "./local-date.ts";

/** Como resolver uma data que caiu em dia não útil. */
export type BusinessDayAdjustment = "previous" | "next";

/** Feriados nacionais de data fixa, no formato `MM-DD`. */
const FIXED_HOLIDAYS = [
  "01-01", // Confraternização Universal
  "04-21", // Tiradentes
  "05-01", // Dia do Trabalho
  "09-07", // Independência
  "10-12", // Nossa Senhora Aparecida
  "11-02", // Finados
  "11-15", // Proclamação da República
  "11-20", // Consciência Negra
  "12-25", // Natal
] as const;

/**
 * Domingo de Páscoa pelo algoritmo de Meeus/Jones/Butcher (calendário
 * gregoriano). Dele derivam Carnaval, Sexta-feira da Paixão e Corpus Christi.
 */
function easterSunday(fullYear: number): LocalDate {
  const a = fullYear % 19;
  const b = Math.floor(fullYear / 100);
  const c = fullYear % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const monthNumber = Math.floor((h + l - 7 * m + 114) / 31);
  const dayNumber = ((h + l - 7 * m + 114) % 31) + 1;
  return fromParts(fullYear, monthNumber, dayNumber);
}

const holidayCache = new Map<number, ReadonlySet<string>>();

/** Feriados bancários nacionais de um ano, como conjunto de `YYYY-MM-DD`. */
export function bankHolidays(fullYear: number): ReadonlySet<string> {
  const cached = holidayCache.get(fullYear);
  if (cached) return cached;

  const easter = easterSunday(fullYear);
  const holidays = new Set<string>([
    ...FIXED_HOLIDAYS.map((date) => `${fullYear}-${date}`),
    addDays(easter, -48), // Segunda-feira de Carnaval
    addDays(easter, -47), // Terça-feira de Carnaval
    addDays(easter, -2), // Sexta-feira da Paixão
    addDays(easter, 60), // Corpus Christi
  ]);

  holidayCache.set(fullYear, holidays);
  return holidays;
}

export function isHoliday(date: LocalDate): boolean {
  return bankHolidays(year(date)).has(date);
}

export function isWeekend(date: LocalDate): boolean {
  const dayOfWeek = weekday(date);
  return dayOfWeek === 0 || dayOfWeek === 6;
}

export function isBusinessDay(date: LocalDate): boolean {
  return !isWeekend(date) && !isHoliday(date);
}

/**
 * Move a data para o dia útil mais próximo na direção pedida. Devolve a
 * própria data quando ela já é dia útil.
 */
export function adjustToBusinessDay(date: LocalDate, direction: BusinessDayAdjustment): LocalDate {
  const step = direction === "previous" ? -1 : 1;
  let current = date;
  // Nenhuma sequência de feriados brasileiros passa de poucos dias; o teto
  // apenas garante que um erro de dados não vire laço infinito.
  for (let guard = 0; guard < 30; guard += 1) {
    if (isBusinessDay(current)) return current;
    current = addDays(current, step);
  }
  return current;
}

/** Quantidade de dias úteis do mês. Base do vale-alimentação. */
export function businessDaysInMonth(fullYear: number, monthNumber: number): number {
  let count = 0;
  for (let dayNumber = 1; dayNumber <= 31; dayNumber += 1) {
    const date = fromParts(fullYear, monthNumber, dayNumber);
    if (month(date) !== monthNumber) break; // estourou o mês
    if (isBusinessDay(date)) count += 1;
  }
  return count;
}

/** Dias úteis do mês até a data, inclusive. Útil para ritmo de gasto. */
export function businessDaysUntil(date: LocalDate): number {
  let count = 0;
  const target = day(date);
  for (let dayNumber = 1; dayNumber <= target; dayNumber += 1) {
    if (isBusinessDay(fromParts(year(date), month(date), dayNumber))) count += 1;
  }
  return count;
}

/**
 * N-ésimo dia útil do mês (1 = primeiro). Quando o mês tem menos dias úteis
 * que o pedido, devolve o último — é o comportamento esperado de "salário no
 * 5º dia útil" em um mês atípico.
 */
export function nthBusinessDayOfMonth(fullYear: number, monthNumber: number, ordinal: number): LocalDate {
  const wanted = Math.max(1, Math.trunc(ordinal));
  let seen = 0;
  let last: LocalDate | null = null;
  for (let dayNumber = 1; dayNumber <= 31; dayNumber += 1) {
    const date = fromParts(fullYear, monthNumber, dayNumber);
    if (month(date) !== monthNumber) break;
    if (!isBusinessDay(date)) continue;
    seen += 1;
    last = date;
    if (seen === wanted) return date;
  }
  // Mês sem nenhum dia útil não existe no calendário brasileiro, mas o tipo
  // precisa de uma saída.
  return last ?? adjustToBusinessDay(fromParts(fullYear, monthNumber, 1), "next");
}

/** Dias úteis entre duas datas, contando o início e excluindo o fim. */
export function businessDaysBetween(from: LocalDate, to: LocalDate): number {
  let count = 0;
  for (let current = from; isBefore(current, to); current = addDays(current, 1)) {
    if (isBusinessDay(current)) count += 1;
  }
  return count;
}
