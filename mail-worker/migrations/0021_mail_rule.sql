-- Per-user incoming-mail rules (Subject keywords page): when a new message's
-- subject or sender matches, star it, archive it or mark it read. Evaluated in
-- the worker's email() handler, so they apply whether or not any client is open.
-- These used to live only in the browser's localStorage.
-- Rollback: DROP TABLE psg_mail_rule;  (the app treats a missing table as "no rules").
CREATE TABLE IF NOT EXISTS psg_mail_rule (
  rule_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  condition_type TEXT NOT NULL DEFAULT 'subject',
  condition_value TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL DEFAULT 'star',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_psg_mail_rule_user ON psg_mail_rule (user_id);
