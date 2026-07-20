export type BusinessDayAdjustment = "previous" | "next";
export type ScheduleMode = "day-of-month" | "business-day-of-month";

function isoFromDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function easterSunday(year: number) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function offsetDate(date: Date, days: number) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export function brazilianBankHolidays(year: number) {
  const easter = easterSunday(year);
  const movable = [
    offsetDate(easter, -48), // Segunda de Carnaval
    offsetDate(easter, -47), // Terça de Carnaval
    offsetDate(easter, -2), // Sexta-feira da Paixão
    offsetDate(easter, 60), // Corpus Christi
  ];
  const fixed = ["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "11-20", "12-25"];
  return new Set([...fixed.map((day) => `${year}-${day}`), ...movable.map(isoFromDate)]);
}

export function isBusinessDay(date: Date) {
  const weekday = date.getUTCDay();
  if (weekday === 0 || weekday === 6) return false;
  return !brazilianBankHolidays(date.getUTCFullYear()).has(isoFromDate(date));
}

export function adjustToBusinessDay(value: string, direction: BusinessDayAdjustment = "next") {
  const date = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  const step = direction === "previous" ? -1 : 1;
  while (!isBusinessDay(date)) date.setUTCDate(date.getUTCDate() + step);
  return isoFromDate(date);
}

export function businessDaysInMonth(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  let count = 0;
  for (let day = 1; day <= lastDay; day += 1) {
    if (isBusinessDay(new Date(Date.UTC(year, monthNumber - 1, day)))) count += 1;
  }
  return count;
}

export function nthBusinessDayOfMonth(month: string, ordinal: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  let seen = 0;
  for (let day = 1; day <= lastDay; day += 1) {
    const date = new Date(Date.UTC(year, monthNumber - 1, day));
    if (!isBusinessDay(date)) continue;
    seen += 1;
    if (seen === Math.max(1, ordinal)) return isoFromDate(date);
  }
  return adjustToBusinessDay(`${month}-${String(lastDay).padStart(2, "0")}`, "previous");
}

export function effectiveRecurringDate(
  month: string,
  day: number,
  scheduleMode: ScheduleMode,
  adjustment: BusinessDayAdjustment,
) {
  if (scheduleMode === "business-day-of-month") return nthBusinessDayOfMonth(month, day);
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return adjustToBusinessDay(`${month}-${String(Math.min(Math.max(1, day), lastDay)).padStart(2, "0")}`, adjustment);
}
