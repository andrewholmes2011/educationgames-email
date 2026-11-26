CREATE TABLE IF NOT EXISTS message_reports (
 id TEXT PRIMARY KEY,
 message_id TEXT,
 message_owner_id TEXT,
 reporter_id TEXT,
 reporter_email TEXT NOT NULL,
 message_from TEXT NOT NULL,
 message_to TEXT NOT NULL,
 message_subject TEXT NOT NULL,
 message_text TEXT NOT NULL,
 message_html TEXT NOT NULL DEFAULT '',
 reason TEXT NOT NULL,
 details TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewed','dismissed')),
 created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS message_reports_created_idx ON message_reports(created_at DESC);
CREATE INDEX IF NOT EXISTS message_reports_status_idx ON message_reports(status,created_at DESC);
