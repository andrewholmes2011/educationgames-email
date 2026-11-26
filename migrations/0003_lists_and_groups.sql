CREATE TABLE IF NOT EXISTS mailing_lists (
 id TEXT PRIMARY KEY,
 owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 name TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT (datetime('now')),
 UNIQUE(owner_id,name)
);
CREATE TABLE IF NOT EXISTS mailing_list_members (
 list_id TEXT NOT NULL REFERENCES mailing_lists(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 PRIMARY KEY(list_id,user_id)
);
CREATE INDEX IF NOT EXISTS mailing_lists_owner_idx ON mailing_lists(owner_id);
CREATE TABLE IF NOT EXISTS mail_groups (
 id TEXT PRIMARY KEY,
 name TEXT NOT NULL,
 address TEXT NOT NULL UNIQUE COLLATE NOCASE,
 enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
 created_by TEXT NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS mail_group_members (
 group_id TEXT NOT NULL REFERENCES mail_groups(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 PRIMARY KEY(group_id,user_id)
);
CREATE INDEX IF NOT EXISTS mail_group_members_user_idx ON mail_group_members(user_id);
