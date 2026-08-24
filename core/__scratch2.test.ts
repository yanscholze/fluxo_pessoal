import { describe, it } from "node:test";
import { cents, sum } from "./kernel/money.ts";
import { competence } from "./time/competence.ts";
import { localDate } from "./time/local-date.ts";
import type { CycleConfig } from "./domain/card/invoice-cycle.ts";
import { scheduleInstallments } from "./domain/installment/plan.ts";
import { simulateAnticipation } from "./domain/installment/anticipation.ts";

const fecha13: CycleConfig = { closingDay: 13, dueDay: 20, dueAdjustment: "next" };

describe("scratch2", () => {
  it("colisao de numero entre dois planos", () => {
    const a = scheduleInstallments({ totalAmount: cents(120000), installmentCount: 12,
      purchaseDate: localDate("2026-08-10"), cycle: fecha13 });
    const b = scheduleInstallments({ totalAmount: cents(600000), installmentCount: 12,
      purchaseDate: localDate("2026-08-10"), cycle: fecha13 });
    const abertas = [...a, ...b];
    const r = simulateAnticipation({
      openInstallments: abertas, count: 3,
      anticipationCompetence: competence("2026-08"), monthlyInterestBasisPoints: 0,
    });
    console.log("abertas:", abertas.length);
    console.log("anticipated:", r.anticipated.map((i) => `${i.number}@${i.competence}=${i.amount}`));
    console.log("nominalAmount:", r.nominalAmount);
    console.log("remaining count:", r.remaining.length, "(esperado", abertas.length - 2, ")");
    console.log("soma remaining:", sum(r.remaining.map((i) => i.amount)));
    console.log("total original:", sum(abertas.map((i) => i.amount)));
    console.log("nominal + remaining:", r.nominalAmount + sum(r.remaining.map((i) => i.amount)));
    console.log("newEndCompetence:", r.newEndCompetence, "monthsShortened:", r.monthsShortened);
  });
});
