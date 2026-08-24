/**
 * Recompensas e câmbio.
 *
 * O resgate é registro próprio, não um lançamento: pontos não são dinheiro e
 * não passam pelo razão. Cashback resgatado, sim — ele vira crédito numa conta
 * e por isso gera um lançamento normal, referenciado aqui.
 */

import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { accounts, cards } from "./catalog.ts";
import { users } from "./identity.ts";
import { transactions } from "./ledger.ts";

export const rewardRedemptions = sqliteTable(
  "reward_redemptions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    cardId: text("card_id")
      .notNull()
      .references(() => cards.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["points", "cashback"] }).notNull(),
    /** Pontos em milésimos, ou centavos, conforme `kind`. */
    amount: integer("amount").notNull(),
    /** Conta creditada, quando o resgate é de cashback. */
    accountId: text("account_id").references(() => accounts.id, { onDelete: "set null" }),
    /** Lançamento gerado pelo crédito do cashback. */
    transactionId: text("transaction_id").references(() => transactions.id, { onDelete: "set null" }),
    redeemedOn: text("redeemed_on").notNull(),
    note: text("note"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("reward_redemptions_card_idx").on(table.cardId, table.redeemedOn),
    index("reward_redemptions_user_idx").on(table.userId),
  ],
);

/**
 * Cotações do dia, em cache.
 *
 * A PTAX de uma data passada nunca muda, então guardar evita uma chamada
 * externa por requisição — e mantém o cálculo funcionando quando o Banco
 * Central está fora do ar.
 */
export const exchangeRates = sqliteTable(
  "exchange_rates",
  {
    currency: text("currency").notNull(),
    /** Dia da cotação, `YYYY-MM-DD`. */
    quotedOn: text("quoted_on").notNull(),
    /** Quantos reais vale uma unidade, em micros. */
    rateMicros: integer("rate_micros").notNull(),
    source: text("source").notNull().default("BCB PTAX"),
    fetchedAt: text("fetched_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex("exchange_rates_currency_day_unq").on(table.currency, table.quotedOn)],
);
