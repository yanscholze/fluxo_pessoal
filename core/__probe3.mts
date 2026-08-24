import { fromParts, isLocalDate, todayIn, addMonths, localDate, parseLocalDate } from "./time/local-date.ts";
import { bankHolidays, adjustToBusinessDay, businessDaysInMonth, nthBusinessDayOfMonth } from "./time/brazilian-calendar.ts";

console.log("--- easter (sexta-feira da paixao + 2) ---");
for (const y of [2024,2025,2026,2027,2030,2038,1900,2100]) {
  const hs = [...bankHolidays(y)].sort();
  console.log(y, hs.filter(h => !["01-01","04-21","05-01","09-07","10-12","11-02","11-15","11-20","12-25"].some(f=>h.endsWith(f))));
}

console.log("--- fromParts fora de faixa ---");
console.log("fromParts(2026,13,1)", fromParts(2026,13,1));
console.log("fromParts(2026,2,30)", fromParts(2026,2,30));
console.log("fromParts(2026,1,0)", fromParts(2026,1,0));
console.log("fromParts(2026,0,1)", fromParts(2026,0,1));
console.log("fromParts(2026,1,32)", fromParts(2026,1,32));
try { console.log("fromParts(2026,NaN,1)", fromParts(2026,NaN,1)); } catch(e:any){ console.log("throws", e.message); }

console.log("--- isLocalDate edges ---");
for (const v of ["0000-01-01","0001-01-01","0099-12-31","0100-01-01","9999-12-31","10000-01-01","2026-00-10","2026-01-00"]) {
  console.log(JSON.stringify(v), isLocalDate(v));
}

console.log("--- addMonths ---");
console.log("2026-03-31 -1", addMonths(localDate("2026-03-31"), -1));
console.log("2024-02-29 +12", addMonths(localDate("2024-02-29"), 12));
console.log("2024-02-29 -12", addMonths(localDate("2024-02-29"), -12));
console.log("2026-08-13 +0", addMonths(localDate("2026-08-13"), 0));
console.log("2026-01-31 +13", addMonths(localDate("2026-01-31"), 13));

console.log("--- todayIn fallback ---");
const realIntl = Intl.DateTimeFormat;
(globalThis as any).Intl = { ...Intl, DateTimeFormat: function(){ throw new RangeError("no tz"); } };
for (const iso of ["2026-08-14T01:30:00Z","2026-08-14T02:59:59Z","2026-08-14T03:00:00Z","2026-01-01T02:00:00Z","2026-03-01T00:30:00Z"]) {
  console.log(iso, "->", todayIn(new Date(iso)));
}
(globalThis as any).Intl = { ...Intl, DateTimeFormat: realIntl };

console.log("--- businessDaysInMonth / nth ---");
console.log("fev/2026", businessDaysInMonth(2026,2), "nth 25", nthBusinessDayOfMonth(2026,2,25));
console.log("dez/2026", businessDaysInMonth(2026,12));
console.log("nth(2026,8,0)", nthBusinessDayOfMonth(2026,8,0));
console.log("nth(2026,8,-3)", nthBusinessDayOfMonth(2026,8,-3));
console.log("--- adjust long chain ---");
console.log("2025-12-25 next", adjustToBusinessDay(localDate("2025-12-25"),"next"));
console.log("2026-01-01 prev", adjustToBusinessDay(localDate("2026-01-01"),"previous"));
