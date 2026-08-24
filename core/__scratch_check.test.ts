import { describe, it } from "node:test";

import { cents } from "./kernel/money.ts";
import { competence } from "./time/competence.ts";
import { localDate, weekday, format } from "./time/local-date.ts";
import type { Account } from "./domain/account/types.ts";
import type { CycleConfig } from "./domain/card/invoice-cycle.ts";
import { closingDateFor, competenceForPurchase, dueDateFor } from "./domain/card/invoice-cycle.ts";
import { scheduleInstallments } from "./domain/installment/plan.ts";
import { simulateAnticipation } from "./domain/installment/anticipation.ts";
import { postTransaction } from "./domain/ledger/posting.ts";
import { type LedgerEntry, type Transaction, accountParty, cardParty } from "./domain/ledger/types.ts";
import {
  type PositionCard,
  computeFinancialPosition,
  computeFreeToSpend,
  projectCashflow,
} from "./domain/position/financial-position.ts";

const fecha13: CycleConfig = { closingDay: 13, dueDay: 20, dueAdjustment: "next" };

function conta(overrides: Partial<Account> & Pick<Account, "id" | "kind">): Account {
  return {
    userId: "u", name: "C", institution: "B", currency: "BRL",
    openingBalance: cents(0), openedOn: localDate("2026-01-01"), goalAmount: null,
    monthlyYieldBasisPoints: 0, includeInTotals: true, isProtected: false,
    color: "#000", sortOrder: 0, archivedAt: null, ...overrides,
  };
}

function lanc(o: Partial<Transaction> & Pick<Transaction, "kind" | "amount" | "id">): Transaction {
  return {
    userId: "u", state: "confirmed", source: "manual", description: "L", categoryId: "c",
    currency: "BRL", occurredOn: localDate("2026-08-05"), origin: accountParty("CONTA"),
    destination: null, competence: competence("2026-08"), tripId: null,
    installmentPlanId: null, installmentNumber: null, recurrenceId: null, notes: null, ...o,
  };
}
function razao(...ts: Transaction[]): LedgerEntry[] {
  return ts.flatMap((t, i) => postTransaction(t).map((d, j) => ({ ...d, id: `e-${i}-${j}` })));
}

describe("scratch", () => {
  it("A: occurredOn vs competencia", () => {
    console.log("13/09/2026 weekday:", weekday(localDate("2026-09-13")));
    console.log("closing 2026-09:", closingDateFor(fecha13, competence("2026-09")));
    console.log("closing 2026-10:", closingDateFor(fecha13, competence("2026-10")));
    const s = scheduleInstallments({
      totalAmount: cents(120000), installmentCount: 4,
      purchaseDate: localDate("2026-09-13"), cycle: fecha13,
    });
    for (const it of s) {
      console.log(
        `parc ${it.number} occurredOn=${it.occurredOn} competence=${it.competence}` +
        ` competenciaDaData=${competenceForPurchase(fecha13, it.occurredOn)} due=${it.dueDate}`,
      );
    }
  });

  it("B: moeda estrangeira no patrimonio", () => {
    const contas = [
      conta({ id: "CONTA", kind: "checking", openingBalance: cents(300000) }),
      conta({ id: "USD", kind: "checking", currency: "USD", openingBalance: cents(100000) }),
    ];
    const p = computeFinancialPosition({ accounts: contas, cards: [], entries: [], today: localDate("2026-08-05") });
    console.log("currentBalance", p.currentBalance, "investments", p.investments, "totalAssets", p.totalAssets, "netWorth", p.netWorth);
  });

  it("C: projectCashflow com pagamento planejado de fatura atrasada", () => {
    const cartao: PositionCard = { id: "CARD", kind: "credit", isPrimary: true, sortOrder: 0, ...fecha13 };
    const contas = [conta({ id: "CONTA", kind: "checking", openingBalance: cents(1000000) })];

    const semPlano = razao(
      lanc({ id: "atrasada", kind: "expense", amount: cents(150000), origin: cardParty("CARD"),
        occurredOn: localDate("2026-06-20"), competence: competence("2026-07") }),
    );
    const comPlano = razao(
      lanc({ id: "atrasada", kind: "expense", amount: cents(150000), origin: cardParty("CARD"),
        occurredOn: localDate("2026-06-20"), competence: competence("2026-07") }),
      lanc({ id: "pgto", kind: "invoice_payment", amount: cents(150000), state: "planned",
        origin: accountParty("CONTA"), destination: cardParty("CARD"),
        occurredOn: localDate("2026-09-10"), competence: competence("2026-07") }),
    );

    const base = { accounts: contas, cards: [cartao], today: localDate("2026-08-31"),
      competences: [competence("2026-09"), competence("2026-10")] };
    console.log("sem plano:", JSON.stringify(projectCashflow({ ...base, entries: semPlano })));
    console.log("com plano:", JSON.stringify(projectCashflow({ ...base, entries: comPlano })));
  });

  it("D: freeToSpend com pagamento planejado fora da janela", () => {
    const cartao: PositionCard = { id: "CARD", kind: "credit", isPrimary: true, sortOrder: 0, ...fecha13 };
    const contas = [conta({ id: "CONTA", kind: "checking", openingBalance: cents(300000) })];
    const entries = razao(
      lanc({ id: "compra", kind: "expense", amount: cents(120000), origin: cardParty("CARD"),
        occurredOn: localDate("2026-07-20"), competence: competence("2026-08") }),
      lanc({ id: "pgto", kind: "invoice_payment", amount: cents(120000), state: "planned",
        origin: accountParty("CONTA"), destination: cardParty("CARD"),
        occurredOn: localDate("2026-08-20"), competence: competence("2026-08") }),
    );
    const livre = computeFreeToSpend({ accounts: contas, cards: [cartao], entries, today: localDate("2026-08-05") });
    console.log("livre:", JSON.stringify(livre));
  });

  it("E: antecipacao com dois planos misturados", () => {
    const a = scheduleInstallments({ totalAmount: cents(120000), installmentCount: 12,
      purchaseDate: localDate("2026-08-10"), cycle: fecha13 });
    const b = scheduleInstallments({ totalAmount: cents(60000), installmentCount: 6,
      purchaseDate: localDate("2026-08-10"), cycle: fecha13 });
    const r = simulateAnticipation({
      openInstallments: [...a, ...b], count: 3,
      anticipationCompetence: competence("2026-08"), monthlyInterestBasisPoints: 0,
    });
    console.log("total aberto:", a.length + b.length, "anticipated:", r.anticipated.length,
      "remaining:", r.remaining.length, "nominal:", r.nominalAmount,
      "numbers antecipados:", JSON.stringify(r.anticipated.map((i) => i.number)));
  });

  it("F: monthsShortened antecipando tudo", () => {
    const a = scheduleInstallments({ totalAmount: cents(120000), installmentCount: 12,
      purchaseDate: localDate("2026-08-10"), cycle: fecha13 });
    const r = simulateAnticipation({ openInstallments: a, count: 12,
      anticipationCompetence: competence("2026-08"), monthlyInterestBasisPoints: 0 });
    console.log("newEnd", r.newEndCompetence, "monthsShortened", r.monthsShortened);
    const r2 = simulateAnticipation({ openInstallments: a, count: 6, target: "next",
      anticipationCompetence: competence("2026-08"), monthlyInterestBasisPoints: 0 });
    console.log("next6 newEnd", r2.newEndCompetence, "monthsShortened", r2.monthsShortened);
  });

  it("G: fim de mes grampeado", () => {
    for (const dia of ["2026-01-29", "2026-01-30", "2026-01-31", "2026-03-31", "2026-05-31"]) {
      const s = scheduleInstallments({ totalAmount: cents(120000), installmentCount: 4,
        purchaseDate: localDate(dia), cycle: { closingDay: 31, dueDay: 10, dueAdjustment: "next" } });
      console.log(dia, s.map((i) => `${i.number}:${i.occurredOn}->${i.competence}(data seria ${competenceForPurchase({ closingDay: 31, dueDay: 10, dueAdjustment: "next" }, i.occurredOn)})`).join(" | "));
    }
  });
});
