/**
 * Recibos de sincronização.
 *
 * Guarda o resultado de cada mutação aplicada. É o que torna o reenvio
 * inofensivo: se a resposta se perdeu no caminho, o aparelho manda de novo e
 * recebe o mesmo resultado em vez de gravar duas vezes.
 */

import { sql } from "drizzle-orm";
import { index, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { users } from "./identity.ts";

export const syncMutations = sqliteTable(
  "sync_mutations",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Gerado pelo aparelho. Chave de idempotência. */
    mutationId: text("mutation_id").notNull(),
    deviceId: text("device_id").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id").notNull(),
    operation: text("operation", { enum: ["upsert", "delete"] }).notNull(),
    status: text("status", {
      enum: ["applied", "duplicate", "conflict", "noop", "rejected"],
    }).notNull(),
    /** Resposta original serializada, devolvida tal e qual no reenvio. */
    resultJson: text("result_json").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("sync_mutations_user_mutation_unq").on(table.userId, table.mutationId),
    index("sync_mutations_user_created_idx").on(table.userId, table.createdAt),
  ],
);
