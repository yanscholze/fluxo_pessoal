import { activeCompetence, dueDateFor, closingDateFor } from "./core/domain/card/invoice-cycle.ts";
import { classifyInvoices, buildAlerts } from "./core/domain/advice/alerts.ts";

const card = { closingDay: 12, dueDay: 20, closingAdjustment: "none", dueAdjustment: "next" } as any;
const today = "2026-09-18" as any;
const active = activeCompetence(card, today);
console.log("active", active, "closing 2026-09", closingDateFor(card, "2026-09" as any), "due 2026-09", dueDateFor(card, "2026-09" as any));

const emAberto = [{ cardName: "Nubank", dueDate: dueDateFor(card, "2026-09" as any), amountCents: 431200 }];
const f = classifyInvoices(emAberto, today);
console.log("overdue", f.overdue.length, "next", f.next);
console.log(buildAlerts({
  today, pendingCaptures: 0, freeToSpendCents: 100000, incomeThisMonthCents: 0, committedCents: 0,
  overdueInvoices: f.overdue.length, overdueInvoiceCents: f.overdueCents, nextInvoice: f.next, incomeToday: null,
} as any));
