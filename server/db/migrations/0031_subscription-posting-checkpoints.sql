-- Fair bounded rotation for scheduled card subscriptions, independent of AI.
CREATE TABLE subscription_posting_checkpoints (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  checked_at TEXT NOT NULL,
  last_rule_id TEXT
);
