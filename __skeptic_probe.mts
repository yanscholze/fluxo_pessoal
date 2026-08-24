import {
  competenceForPurchase, closingDateFor, cycleWindowFor, isWithinCycle,
  activeCompetence, daysUntilClosing, dueDateFor,
} from "./core/domain/card/invoice-cycle.ts";
import type { LocalDate } from "./core/time/local-date.ts";
import type { Competence } from "./core/time/competence.ts";

const d = (s: string) => s as unknown as LocalDate;
const c = (s: string) => s as unknown as Competence;

const cfg1 = { closingDay: 1, dueDay: 10, dueAdjustment: "next" as const };

console.log("=== ACHADO 1 ===");
console.log("closing 2026-01:", closingDateFor(cfg1, c("2026-01")));
console.log("closing 2026-02:", closingDateFor(cfg1, c("2026-02")));
console.log("closing 2026-03:", closingDateFor(cfg1, c("2026-03")));
console.log("window 2026-02:", cycleWindowFor(cfg1, c("2026-02")));
console.log("window 2026-03:", cycleWindowFor(cfg1, c("2026-03")));
console.log("competenceForPurchase 2026-01-31:", competenceForPurchase(cfg1, d("2026-01-31")));
console.log("isWithinCycle(win 2026-02, 2026-01-31):", isWithinCycle(cycleWindowFor(cfg1, c("2026-02")), d("2026-01-31")));
console.log("dueDate 2026-02:", dueDateFor(cfg1, c("2026-02")));

console.log("=== ACHADO 2 ===");
const cfg2 = { closingDay: 13, dueDay: 20, dueAdjustment: "next" as const };
console.log("activeCompetence(2026-08-20):", activeCompetence(cfg2, d("2026-08-20")));
console.log("closing of active:", closingDateFor(cfg2, activeCompetence(cfg2, d("2026-08-20"))));
console.log("daysUntilClosing:", daysUntilClosing(cfg2, d("2026-08-20")));
console.log("cfg1 daysUntilClosing 2025-11-15:", daysUntilClosing(cfg1, d("2025-11-15")), "active:", activeCompetence(cfg1, d("2025-11-15")), "closing active:", closingDateFor(cfg1, activeCompetence(cfg1, d("2025-11-15"))));
