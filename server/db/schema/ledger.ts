/**
 * Razão: lançamentos, movimentações, faturas e parcelamentos.
 *
 * `transactions` guarda o fato que o usuário registrou. `ledger_entries`
 * guarda o efeito daquele fato sobre o dinheiro. Saldo, fatura, dívida e
 * projeção saem sempre de `ledger_entries` — nunca de uma coluna de saldo
 * mantida à mão.
 */

import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { accounts, cards, categories, trips } from "./catalog.ts";
import { users } from "./identity.ts";

export const installmentPlans = sqliteTable(
  "installment_plans",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    cardId: text("card_id")
      .notNull()
      .references(() => cards.id, { onDelete: "cascade" }),
    categoryId: text("category_id").references(() => categories.id, { onDelete: "set null" }),
    description: text("description").notNull(),
    /** Valor da compra. A soma das parcelas bate exatamente com ele. */
    totalAmountCents: integer("total_amount_cents").notNull(),
    installmentCount: integer("installment_count").notNull(),
    purchaseDate: text("purchase_date").notNull(),
    firstCompetence: text("first_competence").notNull(),
    /** Juros embutidos ao mês, em pontos-base. 0 = compra sem juros. */
    monthlyInterestBasisPoints: integer("monthly_interest_basis_points").notNull().default(0),
    /** Apelido dado pelo usuário ao parcelamento. */
    label: text("label"),
    status: text("status", { enum: ["active", "settled", "cancelled"] }).notNull().default("active"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("installment_plans_user_status_idx").on(table.userId, table.status),
    index("installment_plans_card_idx").on(table.cardId),
  ],
);

/**
 * Fatura como entidade própria.
 *
 * Os totais continuam derivados do razão, mas as datas de fechamento e
 * vencimento são **congeladas** aqui: se o usuário mudar o dia de fechamento
 * do cartão, as faturas passadas precisam manter as datas que realmente
 * tiveram.
 */
export const invoices = sqliteTable(
  "invoices",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    cardId: text("card_id")
      .notNull()
      .references(() => cards.id, { onDelete: "cascade" }),
    competence: text("competence").notNull(),
    closingDate: text("closing_date").notNull(),
    dueDate: text("due_date").notNull(),
    status: text("status", { enum: ["open", "closed", "partial", "paid"] }).notNull().default("open"),
    closedAt: text("closed_at"),
    paidAt: text("paid_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("invoices_card_competence_unq").on(table.cardId, table.competence),
    index("invoices_user_due_idx").on(table.userId, table.dueDate),
  ],
);

export const transactions = sqliteTable(
  "transactions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    kind: text("kind", { enum: ["expense", "income", "transfer", "invoice_payment"] }).notNull(),
    state: text("state", { enum: ["confirmed", "planned", "review"] }).notNull().default("confirmed"),
    source: text("source", {
      enum: ["manual", "import", "recurrence", "installment", "invoice_payment", "capture"],
    })
      .notNull()
      .default("manual"),

    description: text("description").notNull(),
    categoryId: text("category_id").references(() => categories.id, { onDelete: "restrict" }),
    /** Sempre positivo. O sinal do dinheiro vem de `kind`. */
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("BRL"),
    occurredOn: text("occurred_on").notNull(),
    /** Competência: em compra no crédito é a fatura; nos demais, o mês da data. */
    competence: text("competence").notNull(),

    // Origem: exatamente uma das duas colunas é preenchida.
    originAccountId: text("origin_account_id").references(() => accounts.id, { onDelete: "restrict" }),
    originCardId: text("origin_card_id").references(() => cards.id, { onDelete: "restrict" }),
    // Destino: transferência preenche a conta; pagamento de fatura, o cartão.
    destinationAccountId: text("destination_account_id").references(() => accounts.id, { onDelete: "restrict" }),
    destinationCardId: text("destination_card_id").references(() => cards.id, { onDelete: "restrict" }),

    tripId: text("trip_id").references(() => trips.id, { onDelete: "set null" }),
    installmentPlanId: text("installment_plan_id").references(() => installmentPlans.id, { onDelete: "cascade" }),
    /** 1-based. Inteiro, nunca o texto "3/12". */
    installmentNumber: integer("installment_number"),
    /** Preenchido quando o lançamento quita uma fatura específica. */
    invoiceId: text("invoice_id").references(() => invoices.id, { onDelete: "set null" }),

    notes: text("notes"),
    /** Identidade canônica para deduplicação de importação e recorrência. */
    fingerprint: text("fingerprint"),

    // Sincronização
    version: integer("version").notNull().default(1),
    deletedAt: text("deleted_at"),
    lastMutationId: text("last_mutation_id"),
    deviceId: text("device_id"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("transactions_user_fingerprint_unq").on(table.userId, table.fingerprint),
    index("transactions_user_occurred_idx").on(table.userId, table.occurredOn),
    index("transactions_user_competence_idx").on(table.userId, table.competence),
    index("transactions_user_updated_idx").on(table.userId, table.updatedAt),
    index("transactions_plan_idx").on(table.installmentPlanId, table.installmentNumber),
    index("transactions_invoice_idx").on(table.invoiceId),
    index("transactions_trip_idx").on(table.userId, table.tripId),
  ],
);

/**
 * Movimentação de dinheiro.
 *
 * Imutável: editar um lançamento apaga as suas movimentações e gera outras, no
 * mesmo lote de escrita. `amount_cents` é **com sinal** — positivo entra,
 * negativo sai; num cartão, negativo é dívida maior.
 */
export const ledgerEntries = sqliteTable(
  "ledger_entries",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    transactionId: text("transaction_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "cascade" }),

    // Exatamente uma das duas é preenchida.
    accountId: text("account_id").references(() => accounts.id, { onDelete: "cascade" }),
    cardId: text("card_id").references(() => cards.id, { onDelete: "cascade" }),

    amountCents: integer("amount_cents").notNull(),
    effectiveOn: text("effective_on").notNull(),
    competence: text("competence").notNull(),
    state: text("state", { enum: ["confirmed", "planned"] }).notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("ledger_account_date_idx").on(table.userId, table.accountId, table.effectiveOn),
    index("ledger_card_competence_idx").on(table.userId, table.cardId, table.competence),
    index("ledger_transaction_idx").on(table.transactionId),
    index("ledger_user_state_date_idx").on(table.userId, table.state, table.effectiveOn),
  ],
);
