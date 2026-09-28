CREATE TABLE integration_credentials (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('gemini', 'openai', 'github')),
  nonce TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, provider)
);
--> statement-breakpoint
CREATE TABLE integration_preferences (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ai_provider TEXT CHECK (ai_provider IN ('gemini', 'openai')),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
