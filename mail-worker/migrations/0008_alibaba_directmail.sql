-- Alibaba Cloud DirectMail (阿里云邮件推送) as a dedicated SMTP channel for
-- external-email notifications (personal_forwarding's 'notification' mode +
-- its verification codes) — NOT a user-mail provider. Kept in the same
-- additive psg_feature_setting singleton as Resend/Mailjet (see 0004's own
-- comment for why: this table's migrations must not depend on /api/init
-- having created the legacy setting table yet).
--
-- Region/host/port/encryption are intentionally NOT columns here — v1 is
-- fixed to 华东1(杭州) smtpdm.aliyun.com:465 SSL/TLS, hardcoded as constants
-- in alibaba-directmail-client.js, so an admin can't misconfigure the host
-- for a different Alibaba region. Only the per-tenant identity (发信地址 +
-- its SMTP password + display name) and the app-layer observation quotas
-- are configurable, matching Resend/Mailjet's existing quota columns.
ALTER TABLE psg_feature_setting ADD COLUMN alibaba_smtp_user TEXT NOT NULL DEFAULT '';
ALTER TABLE psg_feature_setting ADD COLUMN alibaba_smtp_password TEXT NOT NULL DEFAULT '';
ALTER TABLE psg_feature_setting ADD COLUMN alibaba_sender_name TEXT NOT NULL DEFAULT 'PSG Mail Notifications';
ALTER TABLE psg_feature_setting ADD COLUMN alibaba_daily_quota INTEGER NOT NULL DEFAULT 2000;
ALTER TABLE psg_feature_setting ADD COLUMN alibaba_monthly_quota INTEGER NOT NULL DEFAULT 60000;

-- Usage/audit log for the Alibaba notification channel — Resend/Mailjet's
-- usage cards read from the `email` table (real user mail rows), but
-- Alibaba never sends user mail, so it needs its own log to drive its usage
-- card and to distinguish accepted vs failed sends. Never store the SMTP
-- password or a verification code here — recipient/status/provider message
-- id/error text only.
CREATE TABLE IF NOT EXISTS notification_send_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  send_type TEXT NOT NULL,
  recipient TEXT NOT NULL,
  status TEXT NOT NULL,
  provider_message_id TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notification_send_log_provider_time
  ON notification_send_log(provider, status, created_at);
