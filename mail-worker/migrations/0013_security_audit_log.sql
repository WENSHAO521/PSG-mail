-- PSG Mail 4.0 / P0 — security event log.
-- Append-only; written by src/service/security-audit-service.js. Holds ids,
-- IPs, user agents and short reason codes only — never passwords, tokens or
-- message content. Retention: see doc/psg-mail-4.0/02-p0-security.md
-- (pruned by the daily cron after SECURITY_LOG_RETENTION_DAYS, default 180).
-- Rollback: harmless to leave in place; 3.x code never reads it.

CREATE TABLE IF NOT EXISTS security_audit_log (
	id          INTEGER PRIMARY KEY AUTOINCREMENT,
	user_id     INTEGER NOT NULL DEFAULT 0,
	event       TEXT    NOT NULL,
	ip          TEXT    NOT NULL DEFAULT '',
	user_agent  TEXT    NOT NULL DEFAULT '',
	detail      TEXT,
	create_time TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_security_audit_user_time ON security_audit_log(user_id, id);
CREATE INDEX IF NOT EXISTS idx_security_audit_event_time ON security_audit_log(event, create_time);
