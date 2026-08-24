import { closingDateFor, competenceForPurchase, cycleWindowFor } from "./domain/card/invoice-cycle.ts";
import { competence, competenceOf } from "./time/competence.ts";
import { localDate, addDays, fromParts } from "./time/local-date.ts";

// scan: for every closingDay 1..31, every day 2024-01-01..2030-12-31,
// check that competenceForPurchase(d) === the competence whose window contains d
let report = new Map<number, string[]>();
for (let cd = 1; cd <= 31; cd++) {
  const cfg: any = { closingDay: cd, dueDay: 10, dueAdjustment: "next" };
  const bad: string[] = [];
  let d = localDate("2024-02-01");
  const end = localDate("2030-12-01");
  while (d <= end) {
    const assigned = competenceForPurchase(cfg, d);
    const w = cycleWindowFor(cfg, assigned);
    if (!(d >= w.start && d <= w.end)) bad.push(`${d} -> ${assigned} (window ${w.start}..${w.end})`);
    d = addDays(d, 1);
  }
  if (bad.length) report.set(cd, bad);
}
for (const [cd, bad] of report) console.log("closingDay", cd, "->", bad.length, "inconsistências, ex:", bad.slice(0, 4));
if (!report.size) console.log("nenhuma inconsistência");
