export type BusinessDayAdjustment = "previous" | "next";

function isoFromDate(date: Date) { return date.toISOString().slice(0, 10); }

function easterSunday(year: number) {
  const a = year % 19; const b = Math.floor(year / 100); const c = year % 100; const d = Math.floor(b / 4); const e = b % 4;
  const f = Math.floor((b + 8) / 25); const g = Math.floor((b - f + 1) / 3); const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4); const k = c % 4; const l = (32 + 2 * e + 2 * i - h - k) % 7; const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function offsetDate(date: Date, days: number) { const result = new Date(date); result.setUTCDate(result.getUTCDate() + days); return result; }

function bankHolidays(year: number) {
  const easter = easterSunday(year);
  const fixed = ["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "11-20", "12-25"];
  return new Set([...fixed.map((day) => `${year}-${day}`), ...[-48, -47, -2, 60].map((days) => isoFromDate(offsetDate(easter, days)))]);
}

export function isBusinessDay(date: Date) {
  const weekday = date.getUTCDay();
  return weekday !== 0 && weekday !== 6 && !bankHolidays(date.getUTCFullYear()).has(isoFromDate(date));
}

export function adjustToBusinessDay(value: string, direction: BusinessDayAdjustment = "next") {
  const date = new Date(`${value.slice(0, 10)}T12:00:00Z`); const step = direction === "previous" ? -1 : 1;
  while (!isBusinessDay(date)) date.setUTCDate(date.getUTCDate() + step);
  return isoFromDate(date);
}

export function effectiveCardDate(month: string, day: number, adjustment: BusinessDayAdjustment = "next") {
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return adjustToBusinessDay(`${month}-${String(Math.min(Math.max(1, day), lastDay)).padStart(2, "0")}`, adjustment);
}
