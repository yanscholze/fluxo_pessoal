CREATE TABLE ai_conversations (
 id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 title TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX ai_conversations_user_updated_idx ON ai_conversations(user_id,updated_at);
--> statement-breakpoint
CREATE TABLE ai_messages (
 id TEXT PRIMARY KEY NOT NULL, conversation_id TEXT NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
 role TEXT NOT NULL CHECK(role IN ('user','assistant')), sequence INTEGER NOT NULL, content TEXT NOT NULL, advice_json TEXT, created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX ai_messages_conversation_idx ON ai_messages(conversation_id,sequence);
--> statement-breakpoint
CREATE TABLE ai_analyses (
 user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 fingerprint TEXT NOT NULL, insights_json TEXT NOT NULL DEFAULT '[]',
 generated_at TEXT NOT NULL, retry_after TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('ready','fallback'))
);
--> statement-breakpoint
CREATE TABLE ai_leases (
 id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 scope TEXT NOT NULL, expires_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX ai_leases_user_scope_unq ON ai_leases(user_id,scope);
