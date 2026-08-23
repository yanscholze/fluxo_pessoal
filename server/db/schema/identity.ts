/**
 * Identidade: usuário, sessão e proteção de autenticação.
 *
 * Sessão web e sessão de dispositivo Android são a mesma coisa com um `kind`
 * diferente. Duas tabelas separadas obrigavam a duplicar expiração, revogação
 * e verificação de token — e as duas cópias divergiam.
 */

import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    /** PBKDF2-SHA256. O sal é por usuário; as iterações ficam registradas
     *  para que aumentá-las não invalide as senhas já cadastradas. */
    passwordHash: text("password_hash").notNull(),
    passwordSalt: text("password_salt").notNull(),
    passwordIterations: integer("password_iterations").notNull().default(210_000),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex("users_email_unq").on(table.email)],
);

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** `web` = cookie do navegador. `device` = token portador do Android. */
    kind: text("kind", { enum: ["web", "device"] }).notNull(),
    /** Nunca guardamos o token: só o hash. */
    tokenHash: text("token_hash").notNull(),
    deviceId: text("device_id"),
    deviceName: text("device_name"),
    platform: text("platform"),
    appVersion: text("app_version"),
    expiresAt: text("expires_at").notNull(),
    revokedAt: text("revoked_at"),
    lastSeenAt: text("last_seen_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("sessions_token_unq").on(table.tokenHash),
    index("sessions_user_kind_idx").on(table.userId, table.kind),
    index("sessions_expires_idx").on(table.expiresAt),
  ],
);

/** Limite de tentativas por identificador, com janela deslizante. */
export const authAttempts = sqliteTable(
  "auth_attempts",
  {
    keyHash: text("key_hash").primaryKey(),
    scope: text("scope").notNull(),
    failures: integer("failures").notNull().default(0),
    windowStartedAt: text("window_started_at").notNull(),
    blockedUntil: text("blocked_until"),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("auth_attempts_updated_idx").on(table.updatedAt)],
);

export const userProfiles = sqliteTable("user_profiles", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  avatarUrl: text("avatar_url"),
  /** Tema, paleta e preferências de exibição, em JSON validado na borda. */
  preferences: text("preferences"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
