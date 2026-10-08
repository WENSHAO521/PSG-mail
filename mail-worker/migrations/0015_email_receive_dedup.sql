-- PSG Mail 4.0 / P1 — idempotent inbound delivery.
-- dedup_key = 'mid:' || sha256(lower(recipient) || '\n' || normalized Message-ID)
--          or 'raw:' || sha256(lower(recipient) || '\n' || sha256(raw message))
-- Keyed per recipient mailbox, so one Message-ID delivered to several local
-- recipients still yields one stored copy per recipient. No message content
-- is stored here. Rows are pruned after 30 days by the daily cron.
-- Rollback: safe to leave; 3.x never reads it (and simply doesn't dedup).

CREATE TABLE IF NOT EXISTS email_receive_dedup (
	dedup_key   TEXT    PRIMARY KEY,
	email_id    INTEGER NOT NULL DEFAULT 0,
	create_time TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_email_receive_dedup_time ON email_receive_dedup(create_time);
