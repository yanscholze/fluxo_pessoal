/**
 * Captura automática por notificação.
 *
 * A fila é estado do banco, não do aparelho: o usuário revisa no computador o
 * que o celular capturou, e o que ficou pendente ontem precisa estar lá hoje.
 */

import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { accounts, cards, categories } from "./catalog.ts";
import { users } from "./identity.ts";
import { transactions } from "./ledger.ts";

/**
 * O que fazer com cada app que emite notificação.
 *
 * O padrão é **não** capturar: ler notificação de todo app instalado seria
 * invasivo. Os bancos conhecidos passam sem configuração; o resto só entra se
 * o usuário permitir.
 */
export const captureSources = sqliteTable(
  "capture_sources",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Pacote do app, ex.: `com.nu.production`. */
    sourceApp: text("source_app").notNull(),
    /** Nome legível, quando o aparelho consegue informar. */
    label: text("label"),
    action: text("action", { enum: ["allow", "ignore"] }).notNull().default("ignore"),

    /** Destino padrão do que vier deste app. */
    defaultAccountId: text("default_account_id").references(() => accounts.id, { onDelete: "set null" }),
    defaultCardId: text("default_card_id").references(() => cards.id, { onDelete: "set null" }),
    defaultCategoryId: text("default_category_id").references(() => categories.id, { onDelete: "set null" }),

    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex("capture_sources_user_app_unq").on(table.userId, table.sourceApp)],
);

export const captureEvents = sqliteTable(
  "capture_events",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    sourceApp: text("source_app").notNull(),
    /** Texto original, para o usuário conferir o que foi lido. */
    rawText: text("raw_text").notNull(),
    description: text("description").notNull(),
    merchant: text("merchant"),
    amountCents: integer("amount_cents").notNull(),
    kind: text("kind", { enum: ["expense", "income"] }).notNull(),
    method: text("method", { enum: ["credit", "debit", "cash", "unknown"] }).notNull().default("unknown"),
    installmentCurrent: integer("installment_current"),
    installmentTotal: integer("installment_total"),
    /** 0 a 1000 (milésimos). Inteiro para não guardar float. */
    confidenceMilli: integer("confidence_milli").notNull().default(0),

    /**
     * Categoria adivinhada pelo nome do estabelecimento.
     *
     * Separada da categoria que a regra do app determina: uma é decisão do
     * usuário, outra é palpite da heurística, e guardá-las no mesmo campo
     * apagaria a diferença — a tela precisa poder dizer "achamos que é
     * Alimentação" em vez de afirmar que é.
     */
    suggestedCategoryId: text("suggested_category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    categoryConfidenceMilli: integer("category_confidence_milli").notNull().default(0),
    /** Instante em que o Android recebeu a notificação. */
    postedAt: integer("posted_at").notNull(),
    occurredOn: text("occurred_on").notNull(),

    status: text("status", { enum: ["pendente", "confirmado", "ignorado", "duplicado"] })
      .notNull()
      .default("pendente"),
    /** Preenchido quando o usuário confirma e a sugestão vira lançamento. */
    transactionId: text("transaction_id").references(() => transactions.id, { onDelete: "set null" }),

    /**
     * Identidade da notificação no aparelho.
     *
     * O Android reenvia a fila inteira quando reconecta; sem isso, cada
     * sincronização recriaria as mesmas sugestões.
     */
    deviceEventId: text("device_event_id"),

    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("capture_events_user_status_idx").on(table.userId, table.status, table.postedAt),
    uniqueIndex("capture_events_user_device_event_unq").on(table.userId, table.deviceEventId),
  ],
);
