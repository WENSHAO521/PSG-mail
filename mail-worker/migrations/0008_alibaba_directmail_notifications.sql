-- Alibaba Cloud DirectMail settings and delivery accounting for external
-- notifications. These quotas are PSG Mail observation values only; they do
-- not change the provider account's actual plan limits.
ALTER TABLE psg_feature_setting ADD COLUMN alibaba_directmail_sender_email TEXT NOT NULL DEFAULT '';
ALTER TABLE psg_feature_setting ADD COLUMN alibaba_directmail_smtp_password TEXT NOT NULL DEFAULT '';
ALTER TABLE psg_feature_setting ADD COLUMN alibaba_directmail_sender_name TEXT NOT NULL DEFAULT 'PSG Mail Notifications';
ALTER TABLE psg_feature_setting ADD COLUMN alibaba_directmail_daily_quota INTEGER NOT NULL DEFAULT 2000;
ALTER TABLE psg_feature_setting ADD COLUMN alibaba_directmail_monthly_quota INTEGER NOT NULL DEFAULT 60000;

-- One row is created for every DirectMail message attempt. `accepted` means
-- the SMTP server accepted the message (250), not that final inbox delivery
-- has completed. Passwords, verification codes, and full message content are
-- intentionally absent from this table.
CREATE TABLE IF NOT EXISTS notification_delivery_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL DEFAULT 0,
  provider TEXT NOT NULL DEFAULT 'alibaba_directmail',
  event_type TEXT NOT NULL DEFAULT 'external_email',
  recipient TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'attempted',
  provider_message_id TEXT,
  smtp_result TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notification_delivery_provider_time
  ON notification_delivery_log(provider, created_at);

CREATE INDEX IF NOT EXISTS idx_notification_delivery_user_time
  ON notification_delivery_log(user_id, created_at);
