/**
 * Planejamento: orçamentos, metas e investimentos.
 *
 * Tudo aqui responde a uma pergunta de decisão, não de registro: "quanto ainda
 * posso gastar nesta categoria?", "quando essa meta fecha?", "quanto do meu
 * patrimônio está rendendo?".
 */

import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { accounts, categories } from "./catalog.ts";
import { users } from "./identity.ts";

export const budgets = sqliteTable(
  "budgets",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    amountCents: integer("amount_cents").notNull(),
    /**
     * Vigência. Um orçamento vale de uma competência até outra (ou para
     * sempre): sem isso, aumentar o orçamento em julho reescreveria a história
     * e faria os meses anteriores parecerem dentro da meta.
     */
    startsOn: text("starts_on").notNull(),
    endsOn: text("ends_on"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("budgets_user_category_idx").on(table.userId, table.categoryId),
    uniqueIndex("budgets_user_category_start_unq").on(table.userId, table.categoryId, table.startsOn),
  ],
);

export const goals = sqliteTable(
  "goals",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    targetCents: integer("target_cents").notNull(),
    /** Aporte que o usuário pretende fazer por mês. Base da previsão. */
    monthlyContributionCents: integer("monthly_contribution_cents").notNull().default(0),
    targetDate: text("target_date"),
    /**
     * Conta que lastreia a meta. Quando informada, o valor acumulado é o saldo
     * dela — não um número mantido à parte que pode divergir do dinheiro real.
     */
    accountId: text("account_id").references(() => accounts.id, { onDelete: "set null" }),
    color: text("color").notNull().default("#7c5cff"),
    status: text("status", { enum: ["active", "achieved", "cancelled"] }).notNull().default("active"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("goals_user_status_idx").on(table.userId, table.status)],
);

/** Aportes manuais, para metas que não têm conta própria. */
export const goalContributions = sqliteTable(
  "goal_contributions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    goalId: text("goal_id")
      .notNull()
      .references(() => goals.id, { onDelete: "cascade" }),
    amountCents: integer("amount_cents").notNull(),
    occurredOn: text("occurred_on").notNull(),
    note: text("note"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("goal_contributions_goal_idx").on(table.goalId, table.occurredOn)],
);

export const investments = sqliteTable(
  "investments",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Conta em que o ativo está custodiado, quando houver. */
    accountId: text("account_id").references(() => accounts.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    institution: text("institution").notNull().default(""),
    assetClass: text("asset_class", {
      enum: ["fixed_income", "variable_income", "fund", "crypto", "real_estate", "other"],
    })
      .notNull()
      .default("fixed_income"),
    liquidity: text("liquidity", { enum: ["daily", "scheduled", "maturity"] }).notNull().default("daily"),
    maturityDate: text("maturity_date"),
    /** Soma dos aportes menos resgates. Derivado dos movimentos. */
    principalCents: integer("principal_cents").notNull().default(0),
    /** Valor de mercado informado pelo usuário, com a data da informação. */
    currentValueCents: integer("current_value_cents").notNull().default(0),
    valuedOn: text("valued_on"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("investments_user_idx").on(table.userId, table.assetClass)],
);

export const investmentMovements = sqliteTable(
  "investment_movements",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    investmentId: text("investment_id")
      .notNull()
      .references(() => investments.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["contribution", "withdrawal", "yield"] }).notNull(),
    amountCents: integer("amount_cents").notNull(),
    occurredOn: text("occurred_on").notNull(),
    note: text("note"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("investment_movements_investment_idx").on(table.investmentId, table.occurredOn)],
);
