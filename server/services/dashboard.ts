/**
 * Serviço da Visão geral.
 *
 * Todo indicador sai daqui já calculado, pelo domínio. O cliente **exibe** — não
 * recalcula saldo, fatura nem livre para gastar. Era exatamente essa
 * recalculagem espalhada que fazia dashboard, relatório e faturas discordarem
 * entre si na versão anterior.
 */

import { liquidAccounts } from "../../core/domain/account/types.ts";
import { activeCompetence, daysUntilClosing, scheduleFor } from "../../core/domain/card/invoice-cycle.ts";
import {
  accountBalance,
  availableLimit,
  flow,
  invoiceTotals,
  overdueCompetences,
} from "../../core/domain/ledger/balance.ts";
import type { LedgerEntry } from "../../core/domain/ledger/types.ts";
import {
  computeFinancialPosition,
  projectCashflow,
} from "../../core/domain/position/financial-position.ts";
import { type Cents, sum } from "../../core/kernel/money.ts";
import { type Competence, competenceOf, series, shift } from "../../core/time/competence.ts";
import { type LocalDate, addDays, todayIn } from "../../core/time/local-date.ts";
import {
  type CardRecord,
  type CategoryRecord,
  freeToSpendExclusions,
  listAccounts,
  listCards,
  listCategories,
} from "../repositories/catalog.ts";
import {
  type TransactionMeta,
  categoriesFrom,
  listTransactions,
  loadLedger,
  transactionIndex,
} from "../repositories/ledger.ts";

export type AccountSummary = {
  readonly id: string;
  readonly name: string;
  readonly institution: string;
  readonly kind: string;
  readonly currency: string;
  readonly color: string;
  readonly balanceCents: number;
  readonly goalCents: number | null;
  readonly includeInTotals: boolean;
};

export type InvoiceSummary = {
  readonly competence: Competence;
  readonly closingDate: LocalDate;
  readonly dueDate: LocalDate;
  readonly chargesCents: number;
  readonly paymentsCents: number;
  readonly outstandingCents: number;
  readonly isSettled: boolean;
};

export type CardSummary = {
  readonly id: string;
  readonly name: string;
  readonly kind: "credit" | "debit";
  readonly brand: string;
  readonly last4: string;
  readonly color: string;
  readonly isPrimary: boolean;
  readonly limitCents: number;
  readonly availableLimitCents: number;
  readonly daysUntilClosing: number;
  readonly currentInvoice: InvoiceSummary | null;
  readonly overdueInvoices: readonly InvoiceSummary[];
  readonly upcomingInvoices: readonly InvoiceSummary[];
};

export type UpcomingItem = {
  readonly transactionId: string;
  readonly description: string;
  readonly dueOn: LocalDate;
  readonly amountCents: number;
  readonly kind: "expense" | "income";
  readonly categoryId: string | null;
};

export type CategorySpend = {
  readonly categoryId: string | null;
  readonly name: string;
  readonly color: string;
  readonly amountCents: number;
  readonly percent: number;
};

export type Dashboard = {
  readonly today: LocalDate;
  readonly competence: Competence;
  readonly position: {
    readonly currentBalanceCents: number;
    readonly investmentsCents: number;
    readonly totalAssetsCents: number;
    readonly cardDebtCents: number;
    readonly netWorthCents: number;
    readonly committedCents: number;
  };
  readonly freeToSpend: {
    readonly amountCents: number;
    readonly liquidBalanceCents: number;
    readonly pendingIncomeCents: number;
    readonly openInvoicesCents: number;
    readonly otherCommitmentsCents: number;
    readonly windowStart: LocalDate;
    readonly windowEnd: LocalDate;
  };
  readonly monthFlow: {
    readonly incomeCents: number;
    readonly expenseCents: number;
    readonly netCents: number;
  };
  readonly accounts: readonly AccountSummary[];
  readonly cards: readonly CardSummary[];
  readonly upcoming: readonly UpcomingItem[];
  readonly categorySpend: readonly CategorySpend[];
  readonly cashflow: readonly {
    competence: Competence;
    inflowCents: number;
    outflowCents: number;
    projectedBalanceCents: number;
  }[];
  readonly recentTransactions: readonly {
    id: string;
    description: string;
    occurredOn: LocalDate;
    amountCents: number;
    kind: string;
    categoryId: string | null;
  }[];
};

const UPCOMING_DAYS = 30;
const UPCOMING_LIMIT = 8;
const CATEGORY_LIMIT = 6;
const CASHFLOW_MONTHS = 6;
const UPCOMING_INVOICES = 3;

export async function buildDashboard(userId: string, now: Date = new Date()): Promise<Dashboard> {
  const today = todayIn(now);

  const [accounts, cards, categories, entries, excludedCategoryIds, index, recent] = await Promise.all([
    listAccounts(userId),
    listCards(userId),
    listCategories(userId),
    loadLedger(userId),
    freeToSpendExclusions(userId),
    transactionIndex(userId),
    listTransactions(userId, { limit: 10 }),
  ]);

  const positionInput = {
    accounts,
    cards,
    entries,
    categoryByTransaction: categoriesFrom(index),
    today,
    policy: { excludedCategoryIds },
  };

  const position = computeFinancialPosition(positionInput);
  const competence = competenceOf(today);

  return {
    today,
    competence,
    position: {
      currentBalanceCents: position.currentBalance,
      investmentsCents: position.investments,
      totalAssetsCents: position.totalAssets,
      cardDebtCents: position.cardDebt,
      netWorthCents: position.netWorth,
      committedCents: position.committed,
    },
    freeToSpend: {
      amountCents: position.freeToSpend.amount,
      liquidBalanceCents: position.freeToSpend.liquidBalance,
      pendingIncomeCents: position.freeToSpend.pendingIncome,
      openInvoicesCents: position.freeToSpend.openInvoices,
      otherCommitmentsCents: position.freeToSpend.otherCommitments,
      windowStart: position.freeToSpend.windowStart,
      windowEnd: position.freeToSpend.windowEnd,
    },
    monthFlow: monthFlow(entries, accounts, competence),
    accounts: summarizeAccounts(accounts, entries, today),
    cards: cards.map((card) => summarizeCard(card, entries, today)),
    upcoming: upcomingCommitments(entries, index, today),
    categorySpend: spendByCategory(entries, index, categories, competence),
    cashflow: projectCashflow({
      ...positionInput,
      competences: series(shift(competence, 1), CASHFLOW_MONTHS),
    }).map((point) => ({
      competence: point.competence,
      inflowCents: point.inflow,
      outflowCents: point.outflow,
      projectedBalanceCents: point.projectedBalance,
    })),
    recentTransactions: recent.map((transaction) => ({
      id: transaction.id,
      description: transaction.description,
      occurredOn: transaction.occurredOn,
      amountCents: transaction.amount,
      kind: transaction.kind,
      categoryId: transaction.categoryId,
    })),
  };
}

function summarizeAccounts(
  accounts: Awaited<ReturnType<typeof listAccounts>>,
  entries: readonly LedgerEntry[],
  today: LocalDate,
): AccountSummary[] {
  return accounts.map((account) => ({
    id: account.id,
    name: account.name,
    institution: account.institution,
    kind: account.kind,
    currency: account.currency,
    color: account.color,
    balanceCents: accountBalance(entries, account.id, today, account.openingBalance),
    goalCents: account.goalAmount,
    includeInTotals: account.includeInTotals,
  }));
}

function toInvoiceSummary(card: CardRecord, entries: readonly LedgerEntry[], competence: Competence): InvoiceSummary {
  const schedule = scheduleFor(card, competence);
  const totals = invoiceTotals(entries, card.id, competence);
  return {
    competence,
    closingDate: schedule.closingDate,
    dueDate: schedule.dueDate,
    chargesCents: totals.charges,
    paymentsCents: totals.payments,
    outstandingCents: totals.outstanding,
    isSettled: totals.isSettled,
  };
}

function summarizeCard(card: CardRecord, entries: readonly LedgerEntry[], today: LocalDate): CardSummary {
  const isCredit = card.kind === "credit";
  const active = activeCompetence(card, today);

  return {
    id: card.id,
    name: card.name,
    kind: card.kind,
    brand: card.brand,
    last4: card.last4,
    color: card.color,
    isPrimary: card.isPrimary,
    limitCents: card.limitCents,
    availableLimitCents: isCredit ? availableLimit(entries, card.id, card.limitCents as Cents, active) : 0,
    daysUntilClosing: isCredit ? daysUntilClosing(card, today) : 0,
    currentInvoice: isCredit ? toInvoiceSummary(card, entries, active) : null,
    overdueInvoices: isCredit
      ? overdueCompetences(entries, card.id, active).map((competence) => toInvoiceSummary(card, entries, competence))
      : [],
    upcomingInvoices: isCredit
      ? series(shift(active, 1), UPCOMING_INVOICES)
          .map((competence) => toInvoiceSummary(card, entries, competence))
          .filter((invoice) => invoice.chargesCents > 0)
      : [],
  };
}

function monthFlow(
  entries: readonly LedgerEntry[],
  accounts: Awaited<ReturnType<typeof listAccounts>>,
  competence: Competence,
): Dashboard["monthFlow"] {
  const accountIds = new Set(liquidAccounts(accounts).map((account) => account.id));
  const totals = flow(entries, { accountIds, competence, states: ["confirmed"] });
  return { incomeCents: totals.inflow, expenseCents: totals.outflow, netCents: totals.net };
}

/** Compromissos previstos dos próximos dias — a agenda da saúde financeira. */
function upcomingCommitments(
  entries: readonly LedgerEntry[],
  index: ReadonlyMap<string, TransactionMeta>,
  today: LocalDate,
): UpcomingItem[] {
  const horizon = addDays(today, UPCOMING_DAYS);

  return entries
    .filter(
      (entry) =>
        entry.state === "planned" && entry.effectiveOn >= today && entry.effectiveOn <= horizon && entry.amount !== 0,
    )
    .sort((left, right) => left.effectiveOn.localeCompare(right.effectiveOn))
    .slice(0, UPCOMING_LIMIT)
    .map((entry) => {
      const meta = index.get(entry.transactionId);
      return {
        transactionId: entry.transactionId,
        description: meta?.description ?? "Lançamento previsto",
        dueOn: entry.effectiveOn,
        amountCents: Math.abs(entry.amount),
        kind: entry.amount > 0 ? ("income" as const) : ("expense" as const),
        categoryId: meta?.categoryId ?? null,
      };
    });
}

function spendByCategory(
  entries: readonly LedgerEntry[],
  index: ReadonlyMap<string, TransactionMeta>,
  categories: readonly CategoryRecord[],
  competence: Competence,
): CategorySpend[] {
  const byCategory = new Map<string | null, number>();

  for (const entry of entries) {
    if (entry.state !== "confirmed" || entry.competence !== competence || entry.amount >= 0) continue;
    const meta = index.get(entry.transactionId);
    // Transferência e pagamento de fatura movem dinheiro mas não são consumo:
    // contá-los aqui inflaria o gasto do mês com o mesmo dinheiro duas vezes.
    if (meta?.kind === "transfer" || meta?.kind === "invoice_payment") continue;
    byCategory.set(meta?.categoryId ?? null, (byCategory.get(meta?.categoryId ?? null) ?? 0) - entry.amount);
  }

  const total = sum([...byCategory.values()].map((value) => value as Cents));
  const lookup = new Map(categories.map((category) => [category.id, category]));

  return [...byCategory.entries()]
    .sort(([, left], [, right]) => right - left)
    .slice(0, CATEGORY_LIMIT)
    .map(([categoryId, amount]) => {
      const category = categoryId ? lookup.get(categoryId) : undefined;
      return {
        categoryId,
        name: category?.name ?? "Sem categoria",
        color: category?.color ?? "#6b7280",
        amountCents: amount,
        percent: total > 0 ? (amount / total) * 100 : 0,
      };
    });
}
