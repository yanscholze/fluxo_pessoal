-- A checkpoint is derived metadata only. Existing notifications and financial data remain intact.
CREATE TABLE notification_checkpoints (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_revision INTEGER NOT NULL,
  checked_day TEXT NOT NULL,
  checked_at TEXT NOT NULL
);
