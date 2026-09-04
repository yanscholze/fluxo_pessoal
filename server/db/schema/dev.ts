/**
 * Trabalho: clientes, projetos, tarefas, horas e cobrança.
 *
 * Esta é a segunda metade do Fluxo. A primeira responde "como está meu
 * dinheiro"; esta responde "de onde ele vem" — quais projetos estão de pé,
 * quanto foi contratado, quanto entrou, quanto ainda falta receber, e quanto
 * tempo cada coisa custou de verdade.
 *
 * Duas decisões estruturais moldam o desenho:
 *
 * 1. **Hora é lançamento, não campo.** "Horas trabalhadas" como número no
 *    projeto é um contador que ninguém sabe reconstruir. Aqui cada sessão de
 *    trabalho é uma linha com data, duração e o que foi feito; o total é
 *    sempre soma. É o mesmo princípio do razão: nada de saldo mantido à mão.
 *
 * 2. **Pagamento de projeto aponta para o lançamento financeiro.** Receber por
 *    um projeto é uma receita como qualquer outra e precisa entrar no razão,
 *    ou o dinheiro do trabalho não aparece no patrimônio. A parcela do
 *    contrato carrega a `transaction_id` que a realizou — enquanto for `null`,
 *    é previsão de recebimento; preenchida, é dinheiro que entrou.
 */

import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { users } from "./identity.ts";
import { transactions } from "./ledger.ts";

export const clients = sqliteTable(
  "clients",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Pessoa de contato, quando o cliente é uma empresa. */
    contactName: text("contact_name"),
    email: text("email"),
    phone: text("phone"),
    document: text("document"),
    notes: text("notes"),
    color: text("color").notNull().default("#6366f1"),
    archivedAt: text("archived_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("clients_user_idx").on(table.userId),
    uniqueIndex("clients_user_name_unq").on(table.userId, table.name),
  ],
);

/**
 * Projeto.
 *
 * `client_id` é opcional porque projeto próprio não tem cliente — e forçar um
 * cliente "eu mesmo" sujaria a lista de clientes de verdade.
 *
 * O valor contratado mora aqui, mas o **recebido** não: ele é a soma das
 * parcelas quitadas. Guardar os dois seria manter o mesmo número em dois
 * lugares, e um deles ficaria errado.
 */
export const projects = sqliteTable(
  "projects",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    clientId: text("client_id").references(() => clients.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    description: text("description"),
    /**
     * Situação. `support` é o projeto entregue que segue recebendo correção;
     * `paused` é o que parou por decisão; `waiting_client` é o que parou
     * esperando resposta — separá-los é o que permite saber se o gargalo é seu
     * ou do cliente.
     */
    status: text("status", {
      enum: ["lead", "proposal", "active", "waiting_client", "paused", "delivered", "support", "done", "cancelled"],
    })
      .notNull()
      .default("active"),
    priority: text("priority", { enum: ["low", "normal", "high", "urgent"] })
      .notNull()
      .default("normal"),
    startsOn: text("starts_on"),
    /** Prazo combinado. É o que decide se o projeto está atrasado. */
    dueOn: text("due_on"),
    deliveredOn: text("delivered_on"),
    contractCents: integer("contract_cents").notNull().default(0),
    /** Valor/hora combinado, para comparar com o efetivo. */
    hourlyRateCents: integer("hourly_rate_cents").notNull().default(0),
    estimatedHoursMilli: integer("estimated_hours_milli").notNull().default(0),
    repositoryUrl: text("repository_url"),
    mainBranch: text("main_branch"),
    productionUrl: text("production_url"),
    documentationUrl: text("documentation_url"),
    /** Painel da infraestrutura: Cloudflare, Vercel, o que hospedar. */
    infraUrl: text("infra_url"),
    /** Painel administrativo do próprio site, quando existe. */
    adminUrl: text("admin_url"),
    /** Usuário com que se entra nesse painel. */
    adminUser: text("admin_user"),
    /**
     * **Onde** a senha está, não a senha.
     *
     * Guardar senha em texto no banco seria transformar um vazamento do Fluxo
     * num vazamento de todos os projetos do usuário. Este campo aponta para o
     * cofre — "1Password, cofre Clientes" — e é isso que se lê quando a senha
     * é necessária.
     */
    credentialsHint: text("credentials_hint"),
    notes: text("notes"),
    color: text("color").notNull().default("#6366f1"),
    archivedAt: text("archived_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("projects_user_status_idx").on(table.userId, table.status),
    index("projects_user_client_idx").on(table.userId, table.clientId),
    index("projects_user_due_idx").on(table.userId, table.dueOn),
  ],
);

/**
 * Tarefa, pendência, suporte e melhoria — a mesma tabela, `kind` diferente.
 *
 * Separar suporte de nova funcionalidade é uma exigência do negócio, não do
 * banco: suporte é consertar o que deveria funcionar, e normalmente não se
 * cobra; funcionalidade nova se cobra. Misturar os dois numa lista de "tarefas"
 * apaga a diferença que decide se aquilo entra na próxima fatura.
 */
export const projectTasks = sqliteTable(
  "project_tasks",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    details: text("details"),
    kind: text("kind", { enum: ["feature", "support", "improvement", "chore", "bug"] })
      .notNull()
      .default("feature"),
    status: text("status", { enum: ["todo", "doing", "blocked", "review", "done"] })
      .notNull()
      .default("todo"),
    priority: text("priority", { enum: ["low", "normal", "high", "urgent"] })
      .notNull()
      .default("normal"),
    dueOn: text("due_on"),
    /** Estimativa em milésimos de hora, para 0,25h não virar dízima. */
    estimateMilli: integer("estimate_milli").notNull().default(0),
    /** Se esta tarefa é cobrável. Suporte costuma não ser. */
    billable: integer("billable", { mode: "boolean" }).notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    completedAt: text("completed_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("project_tasks_user_project_idx").on(table.userId, table.projectId),
    index("project_tasks_user_status_idx").on(table.userId, table.status),
  ],
);

/**
 * Uma sessão de trabalho.
 *
 * Duração em **milésimos de hora**: 0,25h é 250, e a soma de quatro delas dá
 * exatamente 1000. Guardar horas como decimal faria "8 sessões de 0,1h" somar
 * 0,7999999999999999 — e o valor a cobrar sairia um centavo errado.
 */
export const timeEntries = sqliteTable(
  "time_entries",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    taskId: text("task_id").references(() => projectTasks.id, { onDelete: "set null" }),
    workedOn: text("worked_on").notNull(),
    durationMilli: integer("duration_milli").notNull(),
    description: text("description").notNull(),
    /**
     * Cobrável. Independente da tarefa: uma sessão de retrabalho numa tarefa
     * cobrável pode não ser cobrada, e a decisão é por sessão.
     */
    billable: integer("billable", { mode: "boolean" }).notNull().default(true),
    /** Valor/hora do momento. Congelado: reajuste não reescreve o passado. */
    rateCents: integer("rate_cents").notNull().default(0),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("time_entries_user_project_idx").on(table.userId, table.projectId),
    index("time_entries_user_date_idx").on(table.userId, table.workedOn),
  ],
);

/** Proposta enviada ao cliente. */
export const proposals = sqliteTable(
  "proposals",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }),
    clientId: text("client_id").references(() => clients.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    scope: text("scope"),
    conditions: text("conditions"),
    amountCents: integer("amount_cents").notNull().default(0),
    /** Prazo prometido, em dias. */
    deadlineDays: integer("deadline_days"),
    status: text("status", { enum: ["draft", "sent", "accepted", "rejected", "expired"] })
      .notNull()
      .default("draft"),
    sentOn: text("sent_on"),
    decidedOn: text("decided_on"),
    fileUrl: text("file_url"),
    notes: text("notes"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("proposals_user_project_idx").on(table.userId, table.projectId)],
);

/**
 * Parcela do contrato.
 *
 * Enquanto `transaction_id` é `null`, é previsão: entra em "a receber" e no
 * fluxo futuro. Preenchida, virou dinheiro no razão — e some do previsto sem
 * ninguém precisar marcar nada como pago em dois lugares.
 */
export const projectPayments = sqliteTable(
  "project_payments",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    amountCents: integer("amount_cents").notNull(),
    dueOn: text("due_on").notNull(),
    receivedOn: text("received_on"),
    transactionId: text("transaction_id").references(() => transactions.id, { onDelete: "set null" }),
    notes: text("notes"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("project_payments_user_project_idx").on(table.userId, table.projectId),
    index("project_payments_user_due_idx").on(table.userId, table.dueOn),
  ],
);

/** Ambiente onde o projeto roda. */
export const projectDeployments = sqliteTable(
  "project_deployments",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    environment: text("environment", { enum: ["production", "staging", "preview"] })
      .notNull()
      .default("production"),
    provider: text("provider"),
    domain: text("domain"),
    status: text("status", { enum: ["healthy", "degraded", "down", "unknown"] })
      .notNull()
      .default("unknown"),
    lastDeployedAt: text("last_deployed_at"),
    notes: text("notes"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("project_deployments_user_project_idx").on(table.userId, table.projectId)],
);

/**
 * Histórico do projeto.
 *
 * Uma linha por acontecimento: mudou de situação, entrou dinheiro, virou
 * suporte. É o que responde "por que este projeto arrastou três meses?" depois
 * que ninguém lembra mais.
 */
export const projectEvents = sqliteTable(
  "project_events",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    kind: text("kind", {
      enum: ["status", "payment", "task", "deploy", "proposal", "note"],
    }).notNull(),
    summary: text("summary").notNull(),
    details: text("details"),
    occurredAt: text("occurred_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("project_events_user_project_idx").on(table.userId, table.projectId)],
);
