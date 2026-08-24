import {
  type CycleConfig,
  closingDateFor,
  competenceForPurchase,
  cycleWindowFor,
  isWithinCycle,
  dueDateFor,
} from "../core/domain/card/invoice-cycle.ts";
import { competence, shift } from "../core/time/competence.ts";
import { localDate, addDays } from "../core/time/local-date.ts";

const c1: CycleConfig = { closingDay: 1, dueDay: 10, dueAdjustment: "next" };

console.log("=== closingDay=1 around Jan/Feb 2026 ===");
for (const m of ["2025-12", "2026-01", "2026-02", "2026-03"]) {
  const comp = competence(m);
  const w = cycleWindowFor(c1, comp);
  console.log(m, "closing=", closingDateFor(c1, comp), "window=", w.start, "..", w.end, "valid=", w.start <= w.end);
}

console.log("\n=== attribution vs window, closingDay=1 ===");
for (const d of ["2026-01-29", "2026-01-30", "2026-01-31", "2026-02-01", "2026-02-02"]) {
  const date = localDate(d);
  const comp = competenceForPurchase(c1, date);
  const w = cycleWindowFor(c1, comp);
  console.log(d, "-> competence", comp, "| window:", w.start, "..", w.end, "| inside?", isWithinCycle(w, date));
}

console.log("\n=== exhaustive scan: assigned competence window does NOT contain the date ===");
function scan(cfg: CycleConfig, label: string) {
  let bad = 0;
  const samples: string[] = [];
  let d = localDate("2024-01-01");
  const end = localDate("2032-12-31");
  while (d <= end) {
    const comp = competenceForPurchase(cfg, d);
    const w = cycleWindowFor(cfg, comp);
    if (!isWithinCycle(w, d)) {
      bad++;
      if (samples.length < 10) samples.push(`${d} -> ${comp} (window ${w.start}..${w.end})`);
    }
    d = addDays(d, 1);
  }
  console.log(label, "mismatches:", bad, samples);
}
for (const cd of [1, 2, 3, 5, 10, 13, 20, 28, 29, 30, 31]) {
  scan({ closingDay: cd, dueDay: 10, dueAdjustment: "next" }, `closingDay=${cd}`);
}

console.log("\n=== window chaining / validity ===");
for (const cd of [1, 2, 3, 5, 13, 28, 29, 30, 31]) {
  const cfg: CycleConfig = { closingDay: cd, dueDay: 10, dueAdjustment: "next" };
  let issues = 0;
  const invalid: string[] = [];
  let cur = competence("2024-01");
  for (let i = 0; i < 120; i++) {
    const a = cycleWindowFor(cfg, cur);
    const b = cycleWindowFor(cfg, shift(cur, 1));
    if (addDays(a.end, 1) !== b.start) issues++;
    if (a.start > a.end) invalid.push(`${cur}: ${a.start}..${a.end}`);
    cur = shift(cur, 1);
  }
  console.log(`closingDay=${cd}`, "chain issues:", issues, "invalid:", invalid.slice(0, 5));
}

console.log("\n=== due vs effective closing ===");
const seenBefore = new Set<string>();
const seenEqual = new Set<string>();
for (const cd of [1, 2, 3, 5, 10, 13, 20, 25, 28, 29, 30, 31]) {
  for (const dd of [1, 2, 3, 5, 10, 13, 20, 25, 28, 30, 31]) {
    for (const adj of ["next", "previous"] as const) {
      const cfg: CycleConfig = { closingDay: cd, dueDay: dd, dueAdjustment: adj };
      let cur = competence("2024-01");
      for (let i = 0; i < 84; i++) {
        const close = closingDateFor(cfg, cur);
        const due = dueDateFor(cfg, cur);
        const key = `${cd}/${dd}/${adj}`;
        if (due < close && !seenBefore.has(key)) {
          seenBefore.add(key);
          console.log("DUE < CLOSING", key, cur, "close=", close, "due=", due);
        } else if (due === close && !seenEqual.has(key)) {
          seenEqual.add(key);
          console.log("DUE == CLOSING", key, cur, close);
        }
        cur = shift(cur, 1);
      }
    }
  }
}
