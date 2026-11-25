PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS districts (
 code TEXT PRIMARY KEY, display_name TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)), created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO districts (code,display_name) VALUES ('rsd400','Richland School District'),('psd1','Pasco School District');
CREATE TABLE IF NOT EXISTS users (
 id TEXT PRIMARY KEY, email_alias TEXT NOT NULL UNIQUE COLLATE NOCASE, district_code TEXT, display_name TEXT NOT NULL, password_hash TEXT NOT NULL,
 role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin','user')), status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
 created_at TEXT NOT NULL DEFAULT (datetime('now')), FOREIGN KEY (district_code) REFERENCES districts(code)
);
CREATE INDEX IF NOT EXISTS users_district_idx ON users(district_code);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS invites (
 token_hash TEXT PRIMARY KEY, district_code TEXT NOT NULL REFERENCES districts(code), display_name TEXT NOT NULL, created_by TEXT NOT NULL REFERENCES users(id),
 expires_at INTEGER NOT NULL, used_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS invites_district_idx ON invites(district_code,expires_at);
CREATE TABLE IF NOT EXISTS messages (
 id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, direction TEXT NOT NULL CHECK (direction IN ('inbound','outbound')),
 folder TEXT NOT NULL DEFAULT 'inbox', from_address TEXT NOT NULL, to_addresses TEXT NOT NULL, cc_addresses TEXT NOT NULL DEFAULT '[]',
 subject TEXT NOT NULL DEFAULT '(no subject)', text_body TEXT NOT NULL DEFAULT '', html_body TEXT NOT NULL DEFAULT '', message_id TEXT,
 in_reply_to TEXT, references_header TEXT, is_read INTEGER NOT NULL DEFAULT 0, sent_at TEXT, received_at TEXT NOT NULL DEFAULT (datetime('now')),
 created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS messages_owner_folder_date_idx ON messages(owner_id,folder,received_at DESC);
CREATE INDEX IF NOT EXISTS messages_message_id_idx ON messages(message_id);
CREATE TABLE IF NOT EXISTS attachments (
 id TEXT PRIMARY KEY, message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE, owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 filename TEXT NOT NULL, content_type TEXT NOT NULL, size INTEGER NOT NULL CHECK (size BETWEEN 0 AND 1048576), created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS attachments_message_idx ON attachments(message_id);
CREATE TABLE IF NOT EXISTS attachment_chunks (
 attachment_id TEXT NOT NULL REFERENCES attachments(id) ON DELETE CASCADE, chunk_index INTEGER NOT NULL CHECK (chunk_index >= 0),
 data BLOB NOT NULL, PRIMARY KEY (attachment_id,chunk_index)
);
CREATE TABLE IF NOT EXISTS auth_events (
 id TEXT PRIMARY KEY, ip_hash TEXT NOT NULL, success INTEGER NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_events_ip_date_idx ON auth_events(ip_hash,created_at);
