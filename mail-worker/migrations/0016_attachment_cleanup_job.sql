-- PSG Mail 4.0 / P1 — retry queue for object-storage deletions.
-- When attachment rows are deleted but removing the stored object fails
-- (R2/S3/KV error, subrequest limit…), the key lands here instead of being
-- silently orphaned. The cron re-checks that NO attachments row references
-- the key before deleting (content-addressed keys can be re-used by a newer
-- mail), retries with backoff, and gives up after 5 attempts (status
-- 'failed', surfaced by GET /admin/storage/audit).
-- Rollback: safe to leave; 3.x never reads it.

CREATE TABLE IF NOT EXISTS attachment_cleanup_job (
	id              INTEGER PRIMARY KEY AUTOINCREMENT,
	object_key      TEXT    NOT NULL UNIQUE,
	status          TEXT    NOT NULL DEFAULT 'pending',  -- pending | done | skipped | failed
	attempts        INTEGER NOT NULL DEFAULT 0,
	last_error      TEXT,
	next_attempt_at TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
	create_time     TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
	update_time     TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_attachment_cleanup_due ON attachment_cleanup_job(status, next_attempt_at);
