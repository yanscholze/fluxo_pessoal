import { integer, sqliteTable, text, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { users } from "./identity.ts";

export const aiConversations = sqliteTable("ai_conversations", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(), createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, (t) => [index("ai_conversations_user_updated_idx").on(t.userId, t.updatedAt)]);
export const aiMessages = sqliteTable("ai_messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull().references(() => aiConversations.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["user", "assistant"] }).notNull(),
  sequence: integer("sequence").notNull(), content: text("content").notNull(), adviceJson: text("advice_json"), createdAt: text("created_at").notNull(),
}, (t) => [index("ai_messages_conversation_idx").on(t.conversationId, t.sequence)]);
/** Cache and a database lease shared by Worker isolates; never contains credentials. */
export const aiAnalyses = sqliteTable("ai_analyses", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  fingerprint: text("fingerprint").notNull(), insightsJson: text("insights_json").notNull().default("[]"),
  generatedAt: text("generated_at").notNull(), retryAfter: text("retry_after").notNull(),
  state: text("state", { enum: ["ready", "fallback"] }).notNull(),
  sourceRevision: integer("source_revision").notNull().default(-1),
  checkedDay: text("checked_day"), checkedAt: text("checked_at"),
  checkedFingerprint: text("checked_fingerprint"), publishedFingerprint: text("published_fingerprint"),
  contextJson: text("context_json"), suggestionsJson: text("suggestions_json").notNull().default("[]"),
  provider: text("provider"), model: text("model"), analysisVersion: integer("analysis_version").notNull().default(1),
  lastError: text("last_error"), lastAttemptAt: text("last_attempt_at"),
});
export const aiLeases = sqliteTable("ai_leases", {
  id: text("id").primaryKey(), userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  scope: text("scope").notNull(), expiresAt: integer("expires_at").notNull(),
}, (t) => [uniqueIndex("ai_leases_user_scope_unq").on(t.userId, t.scope)]);

/** A cheap invalidation marker. Financial triggers advance it atomically with writes. */
export const financialRevisions = sqliteTable("financial_revisions", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  revision: integer("revision").notNull().default(0),
});
