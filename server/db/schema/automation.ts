/**
 * Automações: recorrências e seu histórico de execução.
 *
 * Salário, vale-alimentação e assinatura não são tabelas nem identificadores
 * reservados no código: são recorrências com um `role` diferente. O
 * agendamento é a regra mais delicada do sistema e existe uma vez só.
 */

import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { accounts, cards, categories } from "./catalog.ts";
import { users } from "./identity.ts";
import { transactions } from "./ledger.ts";

/**
 * Classificações de assinatura.
 *
 * Criadas pelo usuário: streaming, IA, anuidade, academia — o recorte que faz
 * sentido para ele. Vêm com um conjunto inicial sugerido, porque uma lista
 * vazia obriga a inventar a taxonomia antes de registrar a primeira assinatura,
 * e aí ninguém classifica nada.
 */
export const subscriptionLabels = sqliteTable(
  "subscription_labels",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull().default("#6366f1"),
    sortOrder: integer("sort_order").notNull().default(0),
    archivedAt: text("archived_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex("subscription_labels_user_name_unq").on(table.userId, table.name)],
);

export const recurrences = sqliteTable(
  "recurrences",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    /**
     * Papel da recorrência. Muda como ela é apresentada — nunca como é
     * agendada.
     */
    role: text("role", { enum: ["standard", "salary", "benefit", "subscription"] })
      .notNull()
      .default("standard"),
    kind: text("kind", { enum: ["expense", "income", "transfer"] }).notNull(),

    description: text("description").notNull(),
    categoryId: text("category_id").references(() => categories.id, { onDelete: "set null" }),
    /**
     * Classificação da assinatura: streaming, IA, anuidade do cartão.
     *
     * É um **eixo diferente** da categoria. A categoria responde "que tipo de
     * gasto é" para o orçamento inteiro; a classificação responde "que tipo de
     * assinatura é" dentro do bolo de assinaturas. Usar categoria para os dois
     * misturaria os eixos: ou o orçamento ganha seis categorias de assinatura,
     * ou o relatório de assinaturas fica sem detalhe.
     */
    subscriptionLabelId: text("subscription_label_id").references(() => subscriptionLabels.id, {
      onDelete: "set null",
    }),
    accountId: text("account_id").references(() => accounts.id, { onDelete: "cascade" }),
    cardId: text("card_id").references(() => cards.id, { onDelete: "cascade" }),
    destinationAccountId: text("destination_account_id").references(() => accounts.id, { onDelete: "cascade" }),

    amountCents: integer("amount_cents").notNull(),
    /**
     * `fixed`: o valor é o valor.
     * `per_business_day`: valor × dias úteis do mês — é como funciona o VA.
     */
    amountMode: text("amount_mode", { enum: ["fixed", "per_business_day"] }).notNull().default("fixed"),

    /**
     * `day_of_month`: dia fixo, ajustado ao dia útil conforme `dayAdjustment`.
     * `business_day_of_month`: o N-ésimo dia útil — o caso do salário.
     */
    scheduleMode: text("schedule_mode", { enum: ["day_of_month", "business_day_of_month"] })
      .notNull()
      .default("day_of_month"),
    /** Dia do mês, ou o ordinal do dia útil, conforme `scheduleMode`. */
    scheduleDay: integer("schedule_day").notNull(),
    dayAdjustment: text("day_adjustment", { enum: ["previous", "next"] }).notNull().default("next"),

    /** Frequência da cobrança. Assinatura anual não gera lançamento mensal. */
    interval: text("interval", { enum: ["monthly", "yearly"] }).notNull().default("monthly"),

    startsOn: text("starts_on").notNull(),
    endsOn: text("ends_on"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    /**
     * Quando verdadeiro, a execução gera lançamento já confirmado. Quando
     * falso, gera previsto e espera confirmação do usuário.
     */
    autoConfirm: integer("auto_confirm", { mode: "boolean" }).notNull().default(false),

    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("recurrences_user_active_idx").on(table.userId, table.isActive),
    index("recurrences_user_role_idx").on(table.userId, table.role),
  ],
);

/**
 * Regras de categorização por estabelecimento.
 *
 * Aprendidas do uso: quando o usuário categoriza uma linha importada, o texto
 * do estabelecimento vira regra e as próximas importações já chegam
 * categorizadas. É o que faz a revisão ficar mais rápida a cada arquivo.
 */
export const categorizationRules = sqliteTable(
  "categorization_rules",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Texto normalizado do estabelecimento, sem acento e em minúscula. */
    matchText: text("match_text").notNull(),
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    /** Quantas vezes a regra já acertou. Serve para ordenar e para limpar. */
    hitCount: integer("hit_count").notNull().default(0),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("categorization_rules_user_match_unq").on(table.userId, table.matchText),
    index("categorization_rules_user_idx").on(table.userId),
  ],
);

/**
 * Histórico de execução.
 *
 * Uma linha por competência processada, com o lançamento que ela gerou. É o
 * que torna a execução **idempotente**: a chave natural é
 * `(recurrence_id, competence)`, então rodar duas vezes não duplica nada.
 */
export const recurrenceRuns = sqliteTable(
  "recurrence_runs",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    recurrenceId: text("recurrence_id")
      .notNull()
      .references(() => recurrences.id, { onDelete: "cascade" }),
    competence: text("competence").notNull(),
    transactionId: text("transaction_id").references(() => transactions.id, { onDelete: "set null" }),
    /** `projected` = gerou previsto. `confirmed` = o usuário confirmou. */
    outcome: text("outcome", { enum: ["projected", "confirmed", "skipped"] }).notNull(),
    scheduledFor: text("scheduled_for").notNull(),
    amountCents: integer("amount_cents").notNull(),
    ranAt: text("ran_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    // Chave natural: rodar a mesma competência duas vezes não duplica nada.
    uniqueIndex("recurrence_runs_recurrence_competence_unq").on(table.recurrenceId, table.competence),
    index("recurrence_runs_user_idx").on(table.userId, table.competence),
  ],
);
