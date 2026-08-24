/**
 * Serviço de cartões e faturas.
 *
 * A fatura é entidade própria: tem competência, fechamento, vencimento,
 * situação e as compras que caíram nela. Tratá-la como uma categoria de
 * despesa — o que a versão anterior fazia — impedia responder "quanto ainda
 * devo desta fatura" sem refazer a conta em cada tela.
 */

import {
  activeCompetence,
  closingDateFor,
  dueDateFor,
} from "../../core/domain/card/invoice-cycle.ts";
import {
  accountBalance,
  availableLimit,
  cardDebt,
  committedLimit,
  invoiceTotals,
  overdueCompetences,
  select,
} from "../../core/domain/ledger/balance.ts";
import type { Cents } from "../../core/kernel/money.ts";
import { type Competence, competenceOf, range, shift } from "../../core/time/competence.ts";
import { type LocalDate, todayIn } from "../../core/time/local-date.ts";
import { type CardRecord, listAccounts, listCards } from "../repositories/catalog.ts";
import { listInvoices } from "../repositories/invoices.ts";
import { loadLedger, transactionIndex } from "../repositories/ledger.ts";

export type InvoiceView = {
  readonly competence: Competence;
  readonly closingDate: LocalDate;
  readonly dueDate: LocalDate;
  readonly chargesCents: number;
  readonly paymentsCents: number;
  readonly outstandingCents: number;
  readonly status: "paga" | "em_aberto" | "atrasada" | "futura";
  readonly isActive: boolean;
};

export type CardView = {
  readonly id: string;
  readonly name: string;
  readonly kind: "credit" | "debit";
  readonly brand: string;
  readonly last4: string;
  readonly color: string;
  readonly isPrimary: boolean;
  readonly paymentAccountId: string;
  readonly paymentAccountName: string;
  readonly limitCents: number;
  readonly usedLimitCents: number;
  readonly availableLimitCents: number;
  readonly debtCents: number;
  readonly activeCompetence: Competence;
  readonly invoices: readonly InvoiceView[];
};

export type InvoiceLine = {
  readonly transactionId: string;
  readonly description: string;
  readonly occurredOn: LocalDate;
  readonly amountCents: number;
  readonly categoryId: string | null;
  readonly isPayment: boolean;
};

export type CardsView = {
  readonly today: LocalDate;
  readonly cards: readonly CardView[];
  readonly accounts: readonly { id: string; name: string; balanceCents: number }[];
};

/** Quantas faturas passadas mostrar além das em aberto. */
const HISTORY_MONTHS = 3;
const FUTURE_MONTHS = 3;

export async function buildCardsView(userId: string, now: Date = new Date()): Promise<CardsView> {
  const today = todayIn(now);
  const [cards, accounts, entries, storedInvoices] = await Promise.all([
    listCards(userId),
    listAccounts(userId),
    loadLedger(userId),
    listInvoices(userId),
  ]);

  const accountName = new Map(accounts.map((account) => [account.id, account.name]));

  // Datas congeladas por fatura: se o usuário mudou o dia de fechamento, as
  // faturas passadas precisam continuar dizendo a data que realmente tiveram.
  const frozen = new Map(
    storedInvoices.map((invoice) => [`${invoice.cardId}|${invoice.competence}`, invoice]),
  );

  return {
    today,
    cards: cards.map((card) => toCardView(card, entries, today, frozen, accountName)),
    // O saldo vem junto para o formulário de pagamento poder avisar antes de
    // enviar que a conta escolhida não cobre a fatura.
    accounts: accounts
      .filter((account) => account.currency === "BRL")
      .map((account) => ({
        id: account.id,
        name: account.name,
        balanceCents: accountBalance(entries, account.id, today, account.openingBalance),
      })),
  };
}

function toCardView(
  card: CardRecord,
  entries: Parameters<typeof invoiceTotals>[0],
  today: LocalDate,
  frozen: ReadonlyMap<string, { closingDate: LocalDate; dueDate: LocalDate }>,
  accountName: ReadonlyMap<string, string>,
): CardView {
  const active = card.kind === "credit" ? activeCompetence(card, today) : competenceOf(today);
  const atrasadas = card.kind === "credit" ? overdueCompetences(entries, card.id, active) : [];

  // Janela: histórico recente, tudo que está atrasado, a ativa e as próximas.
  const inicio = atrasadas.length
    ? [...atrasadas].sort()[0]
    : shift(active, -HISTORY_MONTHS);
  const competences = range(inicio, shift(active, FUTURE_MONTHS));

  const invoices: InvoiceView[] = competences
    .map((competence) => {
      const totals = invoiceTotals(entries, card.id, competence);
      const congelada = frozen.get(`${card.id}|${competence}`);
      const closingDate = congelada?.closingDate ?? closingDateFor(card, competence);
      const dueDate = congelada?.dueDate ?? dueDateFor(card, competence);

      const status: InvoiceView["status"] =
        competence > active
          ? "futura"
          : totals.outstanding === 0
            ? "paga"
            : competence < active
              ? "atrasada"
              : "em_aberto";

      return {
        competence,
        closingDate,
        dueDate,
        chargesCents: totals.charges,
        paymentsCents: totals.payments,
        outstandingCents: totals.outstanding,
        status,
        isActive: competence === active,
      };
    })
    // Fatura futura sem compra nenhuma não diz nada: só polui a lista.
    .filter((invoice) => invoice.chargesCents > 0 || invoice.isActive);

  const usado = card.kind === "credit" ? committedLimit(entries, card.id) : 0;

  return {
    id: card.id,
    name: card.name,
    kind: card.kind,
    brand: card.brand,
    last4: card.last4,
    color: card.color,
    isPrimary: card.isPrimary,
    paymentAccountId: card.paymentAccountId,
    paymentAccountName: accountName.get(card.paymentAccountId) ?? "Conta removida",
    limitCents: card.limitCents,
    usedLimitCents: usado,
    availableLimitCents:
      card.kind === "credit" ? availableLimit(entries, card.id, card.limitCents as Cents) : 0,
    debtCents: card.kind === "credit" ? cardDebt(entries, card.id) : 0,
    activeCompetence: active,
    invoices,
  };
}

/** Compras e pagamentos de uma fatura, para o extrato detalhado. */
export async function buildInvoiceLines(
  userId: string,
  cardId: string,
  competence: Competence,
): Promise<InvoiceLine[]> {
  const [entries, index] = await Promise.all([loadLedger(userId), transactionIndex(userId)]);

  return select(entries, { party: { kind: "card", cardId }, competence })
    .map((entry) => {
      const meta = index.get(entry.transactionId);
      return {
        transactionId: entry.transactionId,
        description: meta?.description ?? "Lançamento",
        occurredOn: entry.effectiveOn,
        amountCents: Math.abs(entry.amount),
        categoryId: meta?.categoryId ?? null,
        // Valor positivo no cartão reduz a dívida: é pagamento ou estorno.
        isPayment: entry.amount > 0,
      };
    })
    .sort((left, right) => right.occurredOn.localeCompare(left.occurredOn));
}
