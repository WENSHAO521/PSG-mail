-- Wrangler D1 migration (applied via `wrangler d1 migrations apply`, tracked
-- in the auto-managed `d1_migrations` bookkeeping table). See
-- mail-worker/migrations/README.md for how this differs from the legacy
-- request-time ALTER TABLE pattern still used by src/init/init.js.

CREATE TABLE IF NOT EXISTS scheduled_email (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	user_id INTEGER NOT NULL,
	account_id INTEGER NOT NULL,
	payload TEXT NOT NULL,
	scheduled_at TEXT NOT NULL,
	timezone TEXT DEFAULT '',
	status TEXT NOT NULL DEFAULT 'pending',
	attempt_count INTEGER NOT NULL DEFAULT 0,
	last_error TEXT,
	create_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
	update_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
	sent_time TEXT,
	result_email_id INTEGER
);

-- processDue()'s claim query filters on (status, scheduled_at); list()/cancel()
-- filter on (user_id, status).
CREATE INDEX IF NOT EXISTS idx_scheduled_email_due ON scheduled_email (status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_scheduled_email_user ON scheduled_email (user_id, status);
