-- PSG Mail 4.0 / P1 — configurable lifecycle (retention) policy.
-- Single-row table. Ships DISABLED and in 'draft' status: nothing is ever
-- deleted until an admin (1) enables it, (2) reviews the preview and
-- approves the exact policy snapshot, and (3) the deployment sets
-- RETENTION_EXECUTION=true. Any later edit resets the approval.
-- The business rules (attachments 7 days, mail 15 business days) are
-- defaults pending confirmation, not active behavior.
-- JSON columns: holidays ["YYYY-MM-DD",...], workdays [1..7] (ISO, 1 = Mon),
-- exempt_account_ids / legal_hold_account_ids [accountId,...].
-- Rollback: safe to leave; 3.x never reads it.

CREATE TABLE IF NOT EXISTS retention_policy (
	id                     INTEGER PRIMARY KEY CHECK (id = 1),
	enabled                INTEGER NOT NULL DEFAULT 0,
	status                 TEXT    NOT NULL DEFAULT 'draft',  -- draft | approved
	timezone               TEXT    NOT NULL DEFAULT 'Asia/Shanghai',
	email_business_days    INTEGER NOT NULL DEFAULT 15,
	attachment_days        INTEGER NOT NULL DEFAULT 7,
	workdays               TEXT    NOT NULL DEFAULT '[1,2,3,4,5]',
	holidays               TEXT    NOT NULL DEFAULT '[]',
	exempt_account_ids     TEXT    NOT NULL DEFAULT '[]',
	legal_hold_account_ids TEXT    NOT NULL DEFAULT '[]',
	keep_starred           INTEGER NOT NULL DEFAULT 1,
	approved_by            INTEGER,
	approved_at            TEXT,
	approved_hash          TEXT,
	updated_by             INTEGER,
	update_time            TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO retention_policy (id) SELECT 1 WHERE NOT EXISTS (SELECT 1 FROM retention_policy WHERE id = 1);
