PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS newsletter_preferences (
 user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 token_hash TEXT NOT NULL UNIQUE,
 unsubscribed_at TEXT,
 updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS newsletter_preferences_status_idx ON newsletter_preferences(unsubscribed_at);
CREATE TABLE IF NOT EXISTS newsletter_campaigns (
 id TEXT PRIMARY KEY,
 subject TEXT NOT NULL,
 html_body TEXT NOT NULL,
 text_body TEXT NOT NULL,
 audience TEXT NOT NULL,
 created_by TEXT NOT NULL REFERENCES users(id),
 recipient_count INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS newsletter_campaigns_created_idx ON newsletter_campaigns(created_at DESC);
