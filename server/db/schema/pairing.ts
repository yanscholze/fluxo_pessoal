/**
 * Pedidos de pareamento de aparelho.
 *
 * Vida curta: o registro existe entre o aplicativo pedir o código e o token
 * ser resgatado, e some depois. Não é histórico — é um bilhete de uso único.
 */

import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { users } from "./identity.ts";

export const pairingRequests = sqliteTable(
  "pairing_requests",
  {
    id: text("id").primaryKey(),
    /** Código curto que o usuário digita. Chave natural de busca. */
    code: text("code").notNull().unique(),
    /**
     * Segredo que fica só no aparelho.
     *
     * Sem ele, quem visse o código na tela poderia resgatar o token em nome
     * do aparelho — o código é curto para ser digitável, não para ser secreto.
     */
    pollToken: text("poll_token").notNull(),

    deviceId: text("device_id").notNull(),
    deviceName: text("device_name"),
    platform: text("platform"),
    appVersion: text("app_version"),

    /** Preenchido quando o usuário confirma no navegador. */
    approvedByUserId: text("approved_by_user_id").references(() => users.id, { onDelete: "cascade" }),
    approvedAt: text("approved_at"),

    attempts: integer("attempts").notNull().default(0),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("pairing_requests_expires_idx").on(table.expiresAt)],
);
