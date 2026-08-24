/**
 * Fronteira entre banco e domínio.
 *
 * O banco guarda `number` e `string`; o domínio fala em `Cents`, `LocalDate` e
 * `Competence`. A marcação (branding) desses tipos só tem valor se houver um
 * ponto único onde ela é aplicada — é aqui. Fora deste arquivo ninguém faz
 * `as Cents`.
 */

import type { Account, AccountKind, CurrencyCode } from "../../core/domain/account/types.ts";
import type { PositionCard } from "../../core/domain/position/financial-position.ts";
import type { LedgerEntry, Party, Transaction } from "../../core/domain/ledger/types.ts";
import { type Cents, cents } from "../../core/kernel/money.ts";
import { type Competence, competence } from "../../core/time/competence.ts";
import { type LocalDate, localDate } from "../../core/time/local-date.ts";

type AccountRow = {
  id: string;
  userId: string;
  name: string;
  institution: string;
  kind: string;
  currency: string;
  openingBalanceCents: number;
  openedOn: string;
  goalCents: number | null;
  monthlyYieldBasisPoints: number;
  includeInTotals: boolean;
  isProtected: boolean;
  color: string;
  sortOrder: number;
  archivedAt: string | null;
};

export function toAccount(row: AccountRow): Account {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    institution: row.institution,
    kind: row.kind as AccountKind,
    currency: row.currency as CurrencyCode,
    openingBalance: cents(row.openingBalanceCents),
    openedOn: localDate(row.openedOn),
    goalAmount: row.goalCents === null ? null : cents(row.goalCents),
    monthlyYieldBasisPoints: row.monthlyYieldBasisPoints,
    includeInTotals: row.includeInTotals,
    isProtected: row.isProtected,
    color: row.color,
    sortOrder: row.sortOrder,
    archivedAt: row.archivedAt,
  };
}

type CardRow = {
  id: string;
  kind: string;
  isPrimary: boolean;
  sortOrder: number;
  closingDay: number;
  dueDay: number;
  dueAdjustment: string;
};

export function toPositionCard(row: CardRow): PositionCard {
  return {
    id: row.id,
    kind: row.kind as "credit" | "debit",
    isPrimary: row.isPrimary,
    sortOrder: row.sortOrder,
    closingDay: row.closingDay,
    dueDay: row.dueDay,
    dueAdjustment: row.dueAdjustment as "previous" | "next",
  };
}

type LedgerEntryRow = {
  id: string;
  userId: string;
  transactionId: string;
  accountId: string | null;
  cardId: string | null;
  amountCents: number;
  effectiveOn: string;
  competence: string;
  state: string;
  kind: string;
};

export function toLedgerEntry(row: LedgerEntryRow): LedgerEntry {
  return {
    id: row.id,
    userId: row.userId,
    transactionId: row.transactionId,
    party: partyOf(row.accountId, row.cardId),
    amount: cents(row.amountCents),
    effectiveOn: localDate(row.effectiveOn),
    competence: competence(row.competence),
    state: row.state as LedgerEntry["state"],
    kind: row.kind as LedgerEntry["kind"],
  };
}

/**
 * Uma movimentação aponta para uma conta **ou** para um cartão, nunca para as
 * duas nem para nenhuma. O schema não consegue expressar isso em SQLite, então
 * a invariante é verificada aqui, na leitura — uma linha inconsistente vira
 * erro explícito em vez de um saldo silenciosamente errado.
 */
function partyOf(accountId: string | null, cardId: string | null): Party {
  if (accountId && cardId) {
    throw new Error(`Movimentação aponta para conta e cartão ao mesmo tempo: ${accountId}/${cardId}`);
  }
  if (accountId) return { kind: "account", accountId };
  if (cardId) return { kind: "card", cardId };
  throw new Error("Movimentação sem conta nem cartão");
}

type TransactionRow = {
  id: string;
  userId: string;
  kind: string;
  state: string;
  source: string;
  description: string;
  categoryId: string | null;
  amountCents: number;
  currency: string;
  occurredOn: string;
  competence: string;
  originAccountId: string | null;
  originCardId: string | null;
  destinationAccountId: string | null;
  destinationCardId: string | null;
  tripId: string | null;
  installmentPlanId: string | null;
  installmentNumber: number | null;
  recurrenceId: string | null;
  notes: string | null;
};

export function toTransaction(row: TransactionRow): Transaction {
  return {
    id: row.id,
    userId: row.userId,
    kind: row.kind as Transaction["kind"],
    state: row.state as Transaction["state"],
    source: row.source as Transaction["source"],
    description: row.description,
    categoryId: row.categoryId,
    amount: cents(row.amountCents),
    currency: row.currency,
    occurredOn: localDate(row.occurredOn),
    competence: competence(row.competence),
    origin: partyOf(row.originAccountId, row.originCardId),
    destination:
      row.destinationAccountId || row.destinationCardId
        ? partyOf(row.destinationAccountId, row.destinationCardId)
        : null,
    tripId: row.tripId,
    installmentPlanId: row.installmentPlanId,
    installmentNumber: row.installmentNumber,
    recurrenceId: row.recurrenceId,
    notes: row.notes,
  };
}

/** Decompõe uma parte em par de colunas, para escrita. */
export function partyColumns(party: Party | null): {
  accountId: string | null;
  cardId: string | null;
} {
  if (!party) return { accountId: null, cardId: null };
  return party.kind === "account"
    ? { accountId: party.accountId, cardId: null }
    : { accountId: null, cardId: party.cardId };
}

export type { Cents, Competence, LocalDate };
