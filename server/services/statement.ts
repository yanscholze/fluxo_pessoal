/**
 * Extrato.
 *
 * Monta a lista de lançamentos já resolvida: nome da conta, do cartão e da
 * categoria no lugar dos identificadores. A tela não faz junção nenhuma — ela
 * exibe.
 */

import { competenceOf } from "../../core/time/competence.ts";
import type { Competence } from "../../core/time/competence.ts";
import { type LocalDate, firstDayOfMonth, lastDayOfMonth, todayIn } from "../../core/time/local-date.ts";
import { listAccounts, listCards, listCategories } from "../repositories/catalog.ts";
import { listTransactions } from "../repositories/ledger.ts";

export type StatementRow = {
  readonly id: string;
  readonly kind: "expense" | "income" | "transfer" | "invoice_payment";
  readonly state: "confirmed" | "planned" | "review";
  readonly description: string;
  readonly amountCents: number;
  readonly occurredOn: LocalDate;
  readonly competence: Competence;
  readonly categoryName: string | null;
  readonly categoryColor: string | null;
  /** Onde o dinheiro saiu ou entrou, já com nome legível. */
  readonly originName: string;
  readonly originKind: "account" | "card";
  readonly destinationName: string | null;
  readonly installmentLabel: string | null;
};

export type StatementFilters = {
  readonly competence?: Competence;
  readonly limit?: number;
};

export type Statement = {
  readonly competence: Competence;
  readonly rows: readonly StatementRow[];
  readonly incomeCents: number;
  readonly expenseCents: number;
  readonly options: {
    readonly accounts: readonly { id: string; name: string; currency: string }[];
    readonly cards: readonly { id: string; name: string; kind: "credit" | "debit" }[];
    readonly categories: readonly { id: string; name: string; kind: "expense" | "income" }[];
  };
};

export async function buildStatement(
  userId: string,
  filters: StatementFilters = {},
  now: Date = new Date(),
): Promise<Statement> {
  const competence = filters.competence ?? competenceOf(todayIn(now));
  const reference = `${competence}-01` as LocalDate;

  const [transactions, accounts, cards, categories] = await Promise.all([
    listTransactions(userId, {
      from: firstDayOfMonth(reference),
      to: lastDayOfMonth(reference),
      limit: filters.limit ?? 300,
    }),
    listAccounts(userId),
    listCards(userId),
    listCategories(userId),
  ]);

  const accountName = new Map(accounts.map((account) => [account.id, account.name]));
  const cardName = new Map(cards.map((card) => [card.id, card.name]));
  const categoryById = new Map(categories.map((category) => [category.id, category]));

  const rows: StatementRow[] = transactions.map((transaction) => {
    const category = transaction.categoryId ? categoryById.get(transaction.categoryId) : undefined;
    const origin =
      transaction.origin.kind === "account"
        ? (accountName.get(transaction.origin.accountId) ?? "Conta removida")
        : (cardName.get(transaction.origin.cardId) ?? "Cartão removido");

    const destination = transaction.destination
      ? transaction.destination.kind === "account"
        ? (accountName.get(transaction.destination.accountId) ?? null)
        : (cardName.get(transaction.destination.cardId) ?? null)
      : null;

    return {
      id: transaction.id,
      kind: transaction.kind,
      state: transaction.state,
      description: transaction.description,
      amountCents: transaction.amount,
      occurredOn: transaction.occurredOn,
      competence: transaction.competence,
      categoryName: category?.name ?? null,
      categoryColor: category?.color ?? null,
      originName: origin,
      originKind: transaction.origin.kind,
      destinationName: destination,
      installmentLabel: transaction.installmentNumber ? `Parcela ${transaction.installmentNumber}` : null,
    };
  });

  // Transferência e pagamento de fatura movem dinheiro entre lugares que já são
  // do usuário: contá-los como entrada ou saída inflaria os dois totais com o
  // mesmo dinheiro.
  const consumo = rows.filter((row) => row.kind === "expense" || row.kind === "income");

  return {
    competence,
    rows,
    incomeCents: consumo.filter((row) => row.kind === "income").reduce((soma, row) => soma + row.amountCents, 0),
    expenseCents: consumo.filter((row) => row.kind === "expense").reduce((soma, row) => soma + row.amountCents, 0),
    options: {
      accounts: accounts.map((account) => ({ id: account.id, name: account.name, currency: account.currency })),
      cards: cards.map((card) => ({ id: card.id, name: card.name, kind: card.kind })),
      categories: categories.map((category) => ({ id: category.id, name: category.name, kind: category.kind })),
    },
  };
}
