CREATE TABLE IF NOT EXISTS sender_identities (
 id TEXT PRIMARY KEY,
 address TEXT NOT NULL UNIQUE COLLATE NOCASE,
 display_name TEXT NOT NULL,
 reply_to_user_id TEXT NOT NULL REFERENCES users(id),
 enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
 created_by TEXT NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS sender_identities_enabled_idx ON sender_identities(enabled,address);
