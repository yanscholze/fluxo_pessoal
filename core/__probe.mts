import { closingDateFor, competenceForPurchase, cycleWindowFor, isWithinCycle, dueDateFor, daysUntilClosing } from "./domain/card/invoice-cycle.ts";
import { competence } from "./time/competence.ts";
import { localDate } from "./time/local-date.ts";

const c1: any = { closingDay: 1, dueDay: 10, dueAdjustment: "next" };
console.log("closing 2026-10 =", closingDateFor(c1, competence("2026-10")));
console.log("closing 2026-11 =", closingDateFor(c1, competence("2026-11")));
console.log("closing 2026-12 =", closingDateFor(c1, competence("2026-12")));
const p = localDate("2026-10-31");
console.log("competenceForPurchase(2026-10-31) =", competenceForPurchase(c1, p));
console.log("window 2026-11 =", JSON.stringify(cycleWindowFor(c1, competence("2026-11"))));
console.log("window 2026-12 =", JSON.stringify(cycleWindowFor(c1, competence("2026-12"))));
console.log("in win 2026-11? ", isWithinCycle(cycleWindowFor(c1, competence("2026-11")), p));
console.log("in win 2026-12? ", isWithinCycle(cycleWindowFor(c1, competence("2026-12")), p));
console.log("dueDateFor 2026-11 =", dueDateFor(c1, competence("2026-11")));
console.log("daysUntilClosing at 2026-10-31 =", daysUntilClosing(c1, p));
