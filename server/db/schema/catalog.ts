/**
 * Cadastros: contas, categorias, cartões e viagens.
 *
 * Tudo aqui é referenciado por **id**, nunca por nome. Renomear uma conta é
 * um `UPDATE` numa linha — não uma cascata por cinco tabelas.
 */

import { sql } from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { users } from "./identity.ts";

export const accounts = sqliteTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    institution: text("institution").notNull().default("manual"),
    kind: text("kind", { enum: ["checking", "savings", "cash", "benefit", "investment"] }).notNull(),
    currency: text("currency").notNull().default("BRL"),
    /**
     * Saldo com que a conta entrou no Fluxo. O saldo atual **não** é coluna:
     * é este valor mais a soma das movimentações do razão.
     */
    openingBalanceCents: integer("opening_balance_cents").notNull().default(0),
    openedOn: text("opened_on").notNull(),
    goalCents: integer("goal_cents"),
    monthlyYieldBasisPoints: integer("monthly_yield_basis_points").notNull().default(0),
    includeInTotals: integer("include_in_totals", { mode: "boolean" }).notNull().default(true),
    isProtected: integer("is_protected", { mode: "boolean" }).notNull().default(false),
    color: text("color").notNull().default("#6b7280"),
    sortOrder: integer("sort_order").notNull().default(0),
    archivedAt: text("archived_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("accounts_user_name_unq").on(table.userId, table.name),
    index("accounts_user_idx").on(table.userId),
  ],
);

export const categories = sqliteTable(
  "categories",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: text("kind", { enum: ["expense", "income"] }).notNull(),
    /** Subcategoria. `null` na raiz. Apagar a mãe promove as filhas à raiz. */
    parentId: text("parent_id").references((): AnySQLiteColumn => categories.id, { onDelete: "set null" }),
    color: text("color").notNull().default("#6b7280"),
    icon: text("icon").notNull().default("tag"),
    /** Alimenta o cálculo da reserva de emergência. */
    isEssential: integer("is_essential", { mode: "boolean" }).notNull().default(false),
    /**
     * Quando verdadeiro, gastos desta categoria não pesam no "livre para
     * gastar" (ex.: empréstimo de cartão, que é movimentação de caixa e não
     * consumo). Substitui a lista de nomes fixa no código.
     */
    excludeFromFreeToSpend: integer("exclude_from_free_to_spend", { mode: "boolean" }).notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    archivedAt: text("archived_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("categories_user_name_kind_unq").on(table.userId, table.name, table.kind),
    index("categories_user_parent_idx").on(table.userId, table.parentId),
  ],
);

export const cards = sqliteTable(
  "cards",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Conta que paga a fatura. Referência por id, não pelo nome da conta. */
    paymentAccountId: text("payment_account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    kind: text("kind", { enum: ["credit", "debit"] }).notNull(),
    brand: text("brand").notNull().default(""),
    tier: text("tier").notNull().default(""),
    last4: text("last4").notNull().default(""),
    limitCents: integer("limit_cents").notNull().default(0),
    closingDay: integer("closing_day").notNull(),
    dueDay: integer("due_day").notNull(),
    dueAdjustment: text("due_adjustment", { enum: ["previous", "next"] }).notNull().default("next"),

    // Recompensas
    rewardMode: text("reward_mode", { enum: ["none", "points", "cashback", "both"] }).notNull().default("none"),
    /** Pontos por dólar, em milésimos (1500 = 1,5 ponto por USD). */
    pointsPerDollarMilli: integer("points_per_dollar_milli").notNull().default(0),
    cashbackBasisPoints: integer("cashback_basis_points").notNull().default(0),
    pointsGoal: integer("points_goal").notNull().default(0),
    /** Cotação de contingência quando a PTAX não está disponível, em micros. */
    manualUsdRateMicros: integer("manual_usd_rate_micros").notNull().default(0),

    color: text("color").notNull().default("#6b7280"),
    imageUrl: text("image_url"),
    /** Define a janela de referência do "livre para gastar". */
    isPrimary: integer("is_primary", { mode: "boolean" }).notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    archivedAt: text("archived_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("cards_user_name_unq").on(table.userId, table.name),
    index("cards_user_idx").on(table.userId),
    index("cards_payment_account_idx").on(table.paymentAccountId),
  ],
);

export const trips = sqliteTable(
  "trips",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    startDate: text("start_date").notNull(),
    endDate: text("end_date").notNull(),
    currency: text("currency").notNull().default("BRL"),
    /** Cotação em micros: 5_430_000 = R$ 5,43 por unidade. */
    exchangeRateMicros: integer("exchange_rate_micros").notNull().default(1_000_000),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("trips_user_name_start_unq").on(table.userId, table.name, table.startDate),
    index("trips_user_period_idx").on(table.userId, table.startDate),
  ],
);
