/**
 * Captura automática por notificação.
 *
 * A fila é estado do banco, não do aparelho: o usuário revisa no computador o
 * que o celular capturou, e o que ficou pendente ontem precisa estar lá hoje.
 */

import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { accounts, cards, categories } from "./catalog.ts";
import { projectPayments, projects } from "./dev.ts";
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

/**
 * Quem paga o quê.
 *
 * Uma linha por pagador reconhecido: o contratante de um projeto, a empresa que
 * deposita o salário, o cartão de benefício que credita saldo. Quando um pix
 * chega, o nome do remetente é comparado com estes.
 *
 * Existe para o usuário **não** precisar montar uma automação por evento. Ele
 * aponta "quem me paga é a Acme" uma vez, e o recebimento passa a ser
 * reconhecido — sem regra de recorrência, sem agendamento.
 *
 * O que a regra decide é **para onde** vai o dinheiro reconhecido. Se ele entra
 * sozinho ou espera revisão é decisão do domínio, em `reconcile.ts`, e não desta
 * tabela: essa régua é a mesma para todo mundo.
 */
export const receiptRules = sqliteTable(
  "receipt_rules",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    /** Nome do pagador como o usuário o conhece. */
    payerName: text("payer_name").notNull(),

    /**
     * O que este pagador costuma pagar.
     *
     * `project` procura entre as parcelas em aberto do projeto — é onde a baixa
     * automática pode acontecer, porque existe valor esperado para conferir.
     * `salary` e `benefit` criam receita: não têm parcela, e por isso nunca
     * dispensam revisão.
     */
    target: text("target", { enum: ["project", "salary", "benefit"] }).notNull(),

    /** Preenchido quando o alvo é um projeto específico. */
    projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }),

    /** Onde o dinheiro cai. */
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    categoryId: text("category_id").references(() => categories.id, { onDelete: "set null" }),

    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    /** Última vez que esta regra reconheceu alguma coisa. */
    lastMatchedAt: text("last_matched_at"),

    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("receipt_rules_user_idx").on(table.userId, table.isActive),
    uniqueIndex("receipt_rules_user_payer_target_unq").on(table.userId, table.payerName, table.target),
  ],
);

/**
 * A conciliação proposta para uma captura.
 *
 * Fica separada de `capture_events` porque nem toda captura tem conciliação, e
 * porque a decisão do domínio — automática ou sugerida — precisa ficar
 * registrada junto do motivo. Sem o motivo, a tela mostraria "sugerido" sem
 * poder dizer por quê, e o usuário não teria como julgar.
 */
export const captureReconciliations = sqliteTable(
  "capture_reconciliations",
  {
    captureEventId: text("capture_event_id")
      .primaryKey()
      .references(() => captureEvents.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    ruleId: text("rule_id").references(() => receiptRules.id, { onDelete: "set null" }),
    target: text("target", { enum: ["project", "salary", "benefit"] }).notNull(),
    /** Parcela apontada, quando o alvo é projeto. */
    paymentId: text("payment_id").references(() => projectPayments.id, { onDelete: "set null" }),

    /** `exact` deu baixa sozinho; `suggested` está esperando decisão. */
    outcome: text("outcome", { enum: ["exact", "suggested"] }).notNull(),
    /** Por que não foi automático. Nulo quando foi. */
    reason: text("reason", {
      enum: ["valor_diferente", "sem_valor_esperado", "varios_candidatos"],
    }),

    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("capture_reconciliations_user_idx").on(table.userId, table.outcome)],
);
