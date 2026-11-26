DROP TABLE IF EXISTS mailing_list_members;
DROP TABLE IF EXISTS mailing_lists;

CREATE TABLE IF NOT EXISTS group_invites (
 id TEXT PRIMARY KEY,
 token_hash TEXT NOT NULL UNIQUE,
 group_id TEXT NOT NULL REFERENCES mail_groups(id) ON DELETE CASCADE,
 invited_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 invited_by TEXT NOT NULL REFERENCES users(id),
 expires_at INTEGER NOT NULL,
 accepted_at INTEGER,
 created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS group_invites_user_idx ON group_invites(invited_user_id,expires_at);
CREATE INDEX IF NOT EXISTS group_invites_group_idx ON group_invites(group_id,created_at);
