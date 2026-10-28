import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { users } from "./identity.ts";

export const notificationCheckpoints = sqliteTable("notification_checkpoints", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  sourceRevision: integer("source_revision").notNull(),
  checkedDay: text("checked_day").notNull(),
  checkedAt: text("checked_at").notNull(),
});
