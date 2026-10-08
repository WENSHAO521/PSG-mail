-- PSG Mail 4.0 — outbound delivery audit trail.
-- One row per provider webhook event / send attempt; email.status remains the
-- current-state column. provider_event_id (e.g. Resend's svix-id) is unique
-- per provider so a replayed event is stored once. NULL event ids (send
-- attempts) are allowed many times — SQLite treats NULLs as distinct.
-- No message bodies are stored here. Rollback: safe to leave; unused by 3.x.

CREATE TABLE IF NOT EXISTS email_delivery_event (
	id                  INTEGER PRIMARY KEY AUTOINCREMENT,
	email_id            INTEGER NOT NULL DEFAULT 0,
	provider            TEXT    NOT NULL DEFAULT '',
	provider_message_id TEXT,
	provider_event_id   TEXT,
	event_type          TEXT    NOT NULL DEFAULT '',
	status              INTEGER,
	detail              TEXT,
	create_time         TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_delivery_event_provider_event ON email_delivery_event(provider, provider_event_id);
CREATE INDEX IF NOT EXISTS idx_delivery_event_email ON email_delivery_event(email_id, id);
