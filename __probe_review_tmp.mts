import {
  computeFinancialPosition,
  computeFreeToSpend,
  projectCashflow,
} from "./core/domain/position/financial-position.ts";
import { competenceOf, series, shift } from "./core/time/competence.ts";
import { activeCompetence, closingDateFor, dueDateFor } from "./core/domain/card/invoice-cycle.ts";

const account = (over: any) => ({
  id: "a1",
  userId: "u",
  name: "Conta",
  institution: "X",
  kind: "checking",
  currency: "BRL",
  openingBalance: 0,
  openedOn: "2020-01-01",
  goalAmount: null,
  monthlyYieldBasisPoints: 0,
  includeInTotals: true,
  isProtected: false,
  color: "#fff",
  sortOrder: 0,
  archivedAt: null,
  ...over,
});

const card = (over: any = {}) => ({
  id: "c1",
  kind: "credit",
  isPrimary: true,
  sortOrder: 0,
  closingDay: 13,
  dueDay: 20,
  dueAdjustment: "next",
  ...over,
});

const entry = (over: any) => ({
  id: Math.random().toString(36).slice(2),
  userId: "u",
  transactionId: "t" + Math.random().toString(36).slice(2),
  party: { kind: "account", accountId: "a1" },
  amount: 0,
  effectiveOn: "2026-08-01",
  competence: "2026-08",
  state: "confirmed",
  ...over,
});

const today = "2026-08-24" as any;

console.log("=== cycle sanity ===");
console.log("activeCompetence", activeCompetence(card() as any, today));
console.log("closing 2026-08", closingDateFor(card() as any, "2026-08" as any));
console.log("due 2026-08", dueDateFor(card() as any, "2026-08" as any));

// ---------- Achado 1: moeda estrangeira ----------
{
  const accounts = [
    account({ id: "brl", openingBalance: 300000 }),
    account({ id: "usd", currency: "USD", openingBalance: 100000 }),
  ];
  const p = computeFinancialPosition({ accounts: accounts as any, cards: [], entries: [], today });
  console.log("\n=== A1 ===", {
    currentBalance: p.currentBalance,
    investments: p.investments,
    totalAssets: p.totalAssets,
    netWorth: p.netWorth,
  });
}

// ---------- Achado 2: previstos da competência corrente somem ----------
{
  const accounts = [account({ id: "a1", openingBalance: 0 })];
  const entries = [
    entry({ amount: 100000, effectiveOn: "2026-08-01", competence: "2026-08", state: "confirmed" }),
    entry({ amount: 500000, effectiveOn: "2026-08-28", competence: "2026-08", state: "planned" }),
  ];
  const competences = series(shift(competenceOf(today), 1) as any, 6);
  const points = projectCashflow({ accounts: accounts as any, cards: [card()] as any, entries: entries as any, today, competences });
  console.log("\n=== A2 ===", points.map((p) => [p.competence, p.inflow, p.outflow, p.projectedBalance]));
  const fts = computeFreeToSpend({ accounts: accounts as any, cards: [card()] as any, entries: entries as any, today });
  console.log("A2 freeToSpend", { amount: fts.amount, pendingIncome: fts.pendingIncome, win: [fts.windowStart, fts.windowEnd] });
}

// ---------- Achado 3: pagamento com data futura ----------
{
  const accounts = [account({ id: "a1", openingBalance: 500000 })];
  const entries = [
    // compra no cartão, competência 2026-08
    entry({ party: { kind: "card", cardId: "c1" }, amount: -120000, effectiveOn: "2026-08-05", competence: "2026-08" }),
  ];
  const before = computeFinancialPosition({ accounts: accounts as any, cards: [card()] as any, entries: entries as any, today });
  console.log("\n=== A3 antes ===", {
    currentBalance: before.currentBalance,
    cardDebt: before.cardDebt,
    netWorth: before.netWorth,
    openInvoices: before.freeToSpend.openInvoices,
    free: before.freeToSpend.amount,
  });

  const paid = [
    ...entries,
    entry({ party: { kind: "account", accountId: "a1" }, amount: -120000, effectiveOn: "2026-09-05", competence: "2026-09" }),
    entry({ party: { kind: "card", cardId: "c1" }, amount: 120000, effectiveOn: "2026-09-05", competence: "2026-08" }),
  ];
  const after = computeFinancialPosition({ accounts: accounts as any, cards: [card()] as any, entries: paid as any, today });
  console.log("=== A3 depois (paidOn futuro) ===", {
    currentBalance: after.currentBalance,
    cardDebt: after.cardDebt,
    netWorth: after.netWorth,
    openInvoices: after.freeToSpend.openInvoices,
    free: after.freeToSpend.amount,
  });
}

// ---------- Achado 4: comprometido sem parcelas futuras ----------
{
  const t2 = "2026-08-05" as any;
  const accounts = [account({ id: "a1", openingBalance: 300000 })];
  const entries: any[] = [];
  const comps = ["2026-08", "2026-09", "2026-10", "2026-11", "2026-12", "2027-01"];
  comps.forEach((c, i) =>
    entries.push(
      entry({
        party: { kind: "card", cardId: "c1" },
        amount: -100000,
        effectiveOn: "2026-08-10",
        competence: c,
        state: i === 0 ? "confirmed" : "planned",
      }),
    ),
  );
  const p = computeFinancialPosition({ accounts: accounts as any, cards: [card()] as any, entries: entries as any, today: t2 });
  console.log("\n=== A4 ===", {
    activeCompetence: activeCompetence(card() as any, t2),
    committed: p.committed,
    openInvoices: p.freeToSpend.openInvoices,
    other: p.freeToSpend.otherCommitments,
    cardDebt: p.cardDebt,
  });
}
