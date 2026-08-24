import {
  type CycleConfig,
  closingDateFor,
  competenceForPurchase,
  activeCompetence,
  activeCycleWindow,
  cycleWindowFor,
  isWithinCycle,
  daysUntilClosing,
  dueDateFor,
  installmentCompetences,
  upcomingCompetences,
} from "../core/domain/card/invoice-cycle.ts";
import { competence, shift } from "../core/time/competence.ts";
import { localDate, addDays } from "../core/time/local-date.ts";

const c1: CycleConfig = { closingDay: 1, dueDay: 10, dueAdjustment: "next" };

console.log("--- SCENARIO A: purchase 2026-01-31, closingDay=1 ---");
const buy = localDate("2026-01-31");
console.log("competenceForPurchase =", competenceForPurchase(c1, buy));
console.log("closing of that competence =", closingDateFor(c1, competenceForPurchase(c1, buy)));
console.log("due of that competence    =", dueDateFor(c1, competenceForPurchase(c1, buy)));
console.log("window of 2026-02 =", JSON.stringify(cycleWindowFor(c1, competence("2026-02"))));
console.log("window of 2026-03 =", JSON.stringify(cycleWindowFor(c1, competence("2026-03"))));
console.log("date inside window(2026-03)?", isWithinCycle(cycleWindowFor(c1, competence("2026-03")), buy));

console.log("\n--- SCENARIO B: activeCycleWindow ends before today ---");
for (const t of ["2026-01-30", "2026-01-31", "2026-02-28"]) {
  const today = localDate(t);
  const w = activeCycleWindow(c1, today);
  console.log("today", t, "active =", activeCompetence(c1, today), "window", w.start, "..", w.end,
    "| today inside window?", isWithinCycle(w, today));
}

console.log("\n--- count how many days in 2024-2032 have activeCycleWindow NOT containing today ---");
for (const cd of [1, 2, 3, 13, 31]) {
  const cfg: CycleConfig = { closingDay: cd, dueDay: 10, dueAdjustment: "next" };
  let bad = 0; const s: string[] = [];
  let d = localDate("2024-01-01");
  while (d <= localDate("2032-12-31")) {
    const w = activeCycleWindow(cfg, d);
    if (!isWithinCycle(w, d)) { bad++; if (s.length < 5) s.push(`${d}: ${w.competence} ${w.start}..${w.end}`); }
    d = addDays(d, 1);
  }
  console.log(`closingDay=${cd}`, bad, s);
}

console.log("\n--- SCENARIO C: daysUntilClosing after the calendar-month closing passed ---");
const c13: CycleConfig = { closingDay: 13, dueDay: 20, dueAdjustment: "next" };
for (const t of ["2026-08-13", "2026-08-14", "2026-08-31"]) {
  const today = localDate(t);
  const act = activeCompetence(c13, today);
  console.log("today", t, "| daysUntilClosing =", daysUntilClosing(c13, today),
    "| active invoice =", act, "| its closing =", closingDateFor(c13, act));
}
console.log("closingDay=1 card, every day of 2026-08:");
{
  let d = localDate("2026-08-01");
  const out: string[] = [];
  while (d <= localDate("2026-08-31")) { out.push(`${d.slice(8)}:${daysUntilClosing(c1, d)}`); d = addDays(d, 1); }
  console.log(out.join(" "));
  console.log("active on 2026-08-20 =", activeCompetence(c1, localDate("2026-08-20")),
    "closing =", closingDateFor(c1, activeCompetence(c1, localDate("2026-08-20"))));
}

console.log("\n--- SCENARIO D: 48 installments across year boundary ---");
const comps = installmentCompetences(c13, localDate("2026-11-10"), 48);
console.log(comps[0], comps[1], comps[13], comps[14], comps[47], "len", comps.length);
console.log("upcoming 48 from 2026-12-20:", upcomingCompetences(c13, localDate("2026-12-20"), 48).slice(0, 3),
  upcomingCompetences(c13, localDate("2026-12-20"), 48).at(-1));

console.log("\n--- full 31x31 due<closing scan ---");
let violations = 0;
for (let cd = 1; cd <= 31; cd++) for (let dd = 1; dd <= 31; dd++) for (const adj of ["next", "previous"] as const) {
  const cfg: CycleConfig = { closingDay: cd, dueDay: dd, dueAdjustment: adj };
  let cur = competence("2024-01");
  for (let i = 0; i < 120; i++) {
    if (dueDateFor(cfg, cur) < closingDateFor(cfg, cur)) { violations++; if (violations < 6) console.log("VIOL", cd, dd, adj, cur); }
    cur = shift(cur, 1);
  }
}
console.log("due<closing violations:", violations);
