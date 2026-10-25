import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { users } from "./identity.ts";

/** Estado da central, não uma cópia do razão. Lido e resolvido são independentes. */
export const notifications = sqliteTable("notifications", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  eventKey: text("event_key").notNull(),
  source: text("source", { enum: ["rule", "analysis"] }).notNull(),
  category: text("category", { enum: ["critical", "attention", "insight", "opportunity", "reminder"] }).notNull(),
  /** 5 é a maior urgência. Apenas uma escalada pode tornar um aviso lido novamente não lido. */
  priority: integer("priority").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  screen: text("screen").notNull(),
  href: text("href").notNull(),
  askPrompt: text("ask_prompt").notNull(),
  factsJson: text("facts_json").notNull().default("{}"),
  /** Revisão de entrega: muda na escalada, nunca simplesmente por abrir a central. */
  revision: integer("revision").notNull().default(1),
  readAt: text("read_at"),
  resolvedAt: text("resolved_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("notifications_user_event_unq").on(table.userId, table.eventKey),
  index("notifications_user_active_unread_idx").on(table.userId, table.resolvedAt, table.readAt),
]);
