/**
 * Uso da IA.
 *
 * Cada chamada ao modelo custa dinheiro real, e um laço com defeito no cliente
 * queimaria a cota inteira em minutos. A contagem é por usuário, por recurso e
 * por dia — assim um problema no assistente não derruba a leitura de cupom.
 */

import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { users } from "./identity.ts";

export const aiUsage = sqliteTable(
  "ai_usage",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    feature: text("feature", { enum: ["advice", "receipt"] }).notNull(),
    /** Dia da contagem, `YYYY-MM-DD` no fuso de Brasília. */
    usageDay: text("usage_day").notNull(),
    requestCount: integer("request_count").notNull().default(0),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex("ai_usage_user_feature_day_unq").on(table.userId, table.feature, table.usageDay)],
);
