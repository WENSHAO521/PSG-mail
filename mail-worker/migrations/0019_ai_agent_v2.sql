-- PSG Mail 4.0 / P1 AI Agent 2.0 (feature flag AI_AGENT_V2, default off).
-- All tables are additive and keyed by user_id: every read/write path in
-- src/service/ai-*.js filters on the authenticated user, never on a client
-- supplied id alone. No email bodies are duplicated here — messages store
-- only what the user and assistant said; mail content stays in `email`.
-- Rollback: safe to leave; 3.x/legacy assistant never reads these.

-- Conversation history (user-controlled retention, see ai_agent_setting).
CREATE TABLE IF NOT EXISTS ai_conversation (
	id          TEXT    PRIMARY KEY,                 -- uuid
	user_id     INTEGER NOT NULL,
	account_id  INTEGER NOT NULL DEFAULT 0,          -- 0 = not tied to one mailbox
	title       TEXT    NOT NULL DEFAULT '',
	create_time TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
	update_time TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_ai_conversation_user ON ai_conversation(user_id, update_time);

CREATE TABLE IF NOT EXISTS ai_message (
	id              INTEGER PRIMARY KEY AUTOINCREMENT,
	conversation_id TEXT    NOT NULL,
	user_id         INTEGER NOT NULL,
	role            TEXT    NOT NULL,                -- user | assistant | tool
	content         TEXT    NOT NULL DEFAULT '',
	tool_name       TEXT,
	tool_call_id    TEXT,
	create_time     TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_ai_message_conv ON ai_message(conversation_id, id);
CREATE INDEX IF NOT EXISTS idx_ai_message_user_time ON ai_message(user_id, create_time);

-- Per-user (account_id = 0) and per-mailbox agent preferences.
CREATE TABLE IF NOT EXISTS ai_agent_setting (
	user_id             INTEGER NOT NULL,
	account_id          INTEGER NOT NULL DEFAULT 0,
	instructions        TEXT    NOT NULL DEFAULT '',
	signature           TEXT    NOT NULL DEFAULT '',
	language            TEXT    NOT NULL DEFAULT 'auto',   -- auto | zh-CN | zh-TW | en | ko | de
	history_enabled     INTEGER NOT NULL DEFAULT 1,
	retention_days      INTEGER NOT NULL DEFAULT 30,
	auto_draft_enabled  INTEGER NOT NULL DEFAULT 0,        -- never sends; drafts only
	auto_draft_domains  TEXT    NOT NULL DEFAULT '[]',     -- [] = any sender; else allow-list
	update_time         TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY (user_id, account_id)
);

-- Server-side confirmation of sensitive tool calls. args_json is what will be
-- executed; the client only ever sends the approval id. status moves
-- pending -> executing -> executed|failed (single winner via conditional UPDATE).
CREATE TABLE IF NOT EXISTS ai_action_approval (
	id              TEXT    PRIMARY KEY,                 -- uuid
	user_id         INTEGER NOT NULL,
	conversation_id TEXT    NOT NULL DEFAULT '',
	tool            TEXT    NOT NULL,
	args_json       TEXT    NOT NULL,
	args_hash       TEXT    NOT NULL,
	risk_flags      TEXT    NOT NULL DEFAULT '[]',
	source          TEXT    NOT NULL DEFAULT 'agent',    -- agent | mcp
	status          TEXT    NOT NULL DEFAULT 'pending',
	result          TEXT,
	create_time     TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
	expires_at      TEXT    NOT NULL,
	decided_at      TEXT
);
CREATE INDEX IF NOT EXISTS idx_ai_approval_user ON ai_action_approval(user_id, status, expires_at);

-- One row per model call / tool call. No prompts or mail content.
CREATE TABLE IF NOT EXISTS ai_task_log (
	id              INTEGER PRIMARY KEY AUTOINCREMENT,
	user_id         INTEGER NOT NULL,
	conversation_id TEXT    NOT NULL DEFAULT '',
	kind            TEXT    NOT NULL,                    -- model | tool | auto_draft
	name            TEXT    NOT NULL DEFAULT '',         -- model id or tool name
	status          TEXT    NOT NULL DEFAULT 'ok',       -- ok | error | denied | retried | fallback
	fallback_used   INTEGER NOT NULL DEFAULT 0,
	input_units     INTEGER NOT NULL DEFAULT 0,
	output_chars    INTEGER NOT NULL DEFAULT 0,
	latency_ms      INTEGER NOT NULL DEFAULT 0,
	flags           TEXT,                                -- e.g. ["injection_suspected"]
	error           TEXT,
	create_time     TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_ai_task_log_user_time ON ai_task_log(user_id, create_time);

-- Server-side drafts (created by the agent or the user). Never sent by the
-- system on its own; sending goes through the normal send path.
CREATE TABLE IF NOT EXISTS mail_draft (
	id              INTEGER PRIMARY KEY AUTOINCREMENT,
	user_id         INTEGER NOT NULL,
	account_id      INTEGER NOT NULL,
	to_addrs        TEXT    NOT NULL DEFAULT '[]',
	cc_addrs        TEXT    NOT NULL DEFAULT '[]',
	subject         TEXT    NOT NULL DEFAULT '',
	body            TEXT    NOT NULL DEFAULT '',
	reply_to_email_id INTEGER NOT NULL DEFAULT 0,
	source          TEXT    NOT NULL DEFAULT 'user',     -- user | ai | ai_auto
	status          TEXT    NOT NULL DEFAULT 'draft',    -- draft | discarded | sent
	create_time     TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
	update_time     TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_mail_draft_user ON mail_draft(user_id, status, id);
-- One auto-draft per received mail.
CREATE UNIQUE INDEX IF NOT EXISTS uq_mail_draft_auto ON mail_draft(reply_to_email_id) WHERE source = 'ai_auto';

-- RFC 5322 thread lookups (Message-ID / In-Reply-To), previously full scans.
CREATE INDEX IF NOT EXISTS idx_email_message_id ON email(message_id) WHERE message_id != '';
CREATE INDEX IF NOT EXISTS idx_email_in_reply_to ON email(in_reply_to) WHERE in_reply_to != '';
