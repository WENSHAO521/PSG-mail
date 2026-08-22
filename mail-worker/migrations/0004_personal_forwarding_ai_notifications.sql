-- PSG Mail 3.x additive features: personal forwarding, persistent
-- notification events and user-scoped AI usage accounting.
-- Keep the legacy global forwarding columns in setting unchanged.

CREATE TABLE IF NOT EXISTS personal_forwarding (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  target_email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  mode TEXT NOT NULL DEFAULT 'notification',
  include_attachments INTEGER NOT NULL DEFAULT 0,
  verification_hash TEXT NOT NULL DEFAULT '',
  verification_expires_at TEXT,
  verification_sent_at TEXT,
  verification_attempts INTEGER NOT NULL DEFAULT 0,
  verified_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, target_email)
);

CREATE INDEX IF NOT EXISTS idx_personal_forwarding_user_status
  ON personal_forwarding(user_id, status);

CREATE TABLE IF NOT EXISTS forward_delivery_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  forwarding_id INTEGER NOT NULL,
  source_email_id INTEGER NOT NULL,
  source_message_id TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT,
  provider_message_id TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(forwarding_id, source_email_id)
);

CREATE INDEX IF NOT EXISTS idx_forward_delivery_due
  ON forward_delivery_log(status, next_attempt_at);

CREATE TABLE IF NOT EXISTS notification_event (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  account_id INTEGER NOT NULL DEFAULT 0,
  email_id INTEGER NOT NULL DEFAULT 0,
  event_type TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  payload TEXT NOT NULL DEFAULT '{}',
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notification_event_user_created
  ON notification_event(user_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS ai_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  usage_date TEXT NOT NULL,
  task TEXT NOT NULL,
  input_units INTEGER NOT NULL DEFAULT 0,
  request_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, usage_date, task)
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_user_date
  ON ai_usage(user_id, usage_date);

-- Keep additive feature policy separate from the legacy setting row. D1
-- migrations run before /api/init creates the historical setting table on a
-- brand-new database, so ALTER TABLE setting here would make a clean deploy
-- fail. setting-service merges this singleton into its existing response and
-- persists policy changes back to it.
CREATE TABLE IF NOT EXISTS psg_feature_setting (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  allow_personal_forward INTEGER NOT NULL DEFAULT 1,
  allow_forward_notification INTEGER NOT NULL DEFAULT 1,
  allow_forward_full_copy INTEGER NOT NULL DEFAULT 0,
  allow_forward_attachments INTEGER NOT NULL DEFAULT 0,
  forward_max_addresses INTEGER NOT NULL DEFAULT 3,
  forward_allowed_domains TEXT NOT NULL DEFAULT '',
  public_app_url TEXT NOT NULL DEFAULT '',
  ai_default_model TEXT NOT NULL DEFAULT '',
  ai_fallback_model TEXT NOT NULL DEFAULT '',
  ai_daily_quota INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO psg_feature_setting (id) VALUES (1);
