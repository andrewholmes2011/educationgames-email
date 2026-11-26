CREATE TABLE IF NOT EXISTS newsletter_unsubscribe_tokens (
 token_hash TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS newsletter_unsubscribe_tokens_user_idx ON newsletter_unsubscribe_tokens(user_id);
