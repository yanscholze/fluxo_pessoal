import { sql } from "drizzle-orm";
import { primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { users } from "./identity.ts";

export const integrationCredentials = sqliteTable(
  "integration_credentials",
  {
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider", { enum: ["gemini", "openai", "github"] }).notNull(),
    /** AES-256-GCM; o segredo de criptografia fica somente no Worker. */
    nonce: text("nonce").notNull(),
    ciphertext: text("ciphertext").notNull(),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [primaryKey({ columns: [table.userId, table.provider] })],
);

export const integrationPreferences = sqliteTable("integration_preferences", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  aiProvider: text("ai_provider", { enum: ["gemini", "openai"] }),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
