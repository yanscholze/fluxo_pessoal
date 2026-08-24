/**
 * Importação de extrato e fatura.
 *
 * A revisão é um **estado do banco**, não do navegador. Quem envia um extrato
 * de trezentas linhas não revisa tudo de uma vez: fecha a aba, volta amanhã e
 * espera encontrar o lote onde parou. Guardar isso em memória do cliente
 * perderia o trabalho no primeiro recarregamento.
 */

import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { accounts, cards, categories } from "./catalog.ts";
import { users } from "./identity.ts";
import { transactions } from "./ledger.ts";

export const importBatches = sqliteTable(
  "import_batches",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    filename: text("filename").notNull(),
    format: text("format", { enum: ["ofx", "csv"] }).notNull(),

    /** Destino: exatamente uma das duas colunas é preenchida. */
    targetAccountId: text("target_account_id").references(() => accounts.id, { onDelete: "cascade" }),
    targetCardId: text("target_card_id").references(() => cards.id, { onDelete: "cascade" }),
    /** Competência da fatura, quando o destino é cartão. */
    competence: text("competence"),

    status: text("status", { enum: ["review", "committed", "discarded"] }).notNull().default("review"),

    // Contadores congelados no momento do envio, para a tela de revisão não
    // precisar recontar a cada abertura.
    foundCount: integer("found_count").notNull().default(0),
    freshCount: integer("fresh_count").notNull().default(0),
    duplicateCount: integer("duplicate_count").notNull().default(0),
    withoutCategoryCount: integer("without_category_count").notNull().default(0),
    possibleTransferCount: integer("possible_transfer_count").notNull().default(0),
    discardedCount: integer("discarded_count").notNull().default(0),

    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    committedAt: text("committed_at"),
  },
  (table) => [
    index("import_batches_user_status_idx").on(table.userId, table.status),
    index("import_batches_user_created_idx").on(table.userId, table.createdAt),
  ],
);

export const importItems = sqliteTable(
  "import_items",
  {
    id: text("id").primaryKey(),
    batchId: text("batch_id")
      .notNull()
      .references(() => importBatches.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    /** Trecho original do arquivo, para o usuário conferir o que foi lido. */
    rawText: text("raw_text").notNull(),
    externalId: text("external_id"),
    occurredOn: text("occurred_on").notNull(),
    description: text("description").notNull(),
    /** Com sinal, como o arquivo trouxe: negativo é saída. */
    amountCents: integer("amount_cents").notNull(),
    installmentCurrent: integer("installment_current"),
    installmentTotal: integer("installment_total"),

    fingerprint: text("fingerprint").notNull(),
    verdict: text("verdict", {
      enum: ["novo", "duplicado", "possivel_transferencia", "sem_categoria"],
    }).notNull(),
    categoryId: text("category_id").references(() => categories.id, { onDelete: "set null" }),
    transferCounterpartId: text("transfer_counterpart_id").references(() => accounts.id, {
      onDelete: "set null",
    }),

    decision: text("decision", { enum: ["pendente", "aceitar", "ignorar"] }).notNull().default("pendente"),
    /** Preenchido quando o lote é confirmado e a linha vira lançamento. */
    transactionId: text("transaction_id").references(() => transactions.id, { onDelete: "set null" }),

    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [
    index("import_items_batch_idx").on(table.batchId, table.sortOrder),
    uniqueIndex("import_items_batch_fingerprint_unq").on(table.batchId, table.fingerprint),
    index("import_items_user_idx").on(table.userId),
  ],
);
