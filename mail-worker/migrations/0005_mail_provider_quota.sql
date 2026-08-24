-- Resend/Mailjet send-provider quota observation + Mailjet credentials,
-- added to the additive psg_feature_setting singleton (see 0004's own
-- comment for why new settings land there instead of ALTER TABLE setting).
-- These "quota" columns are an app-layer usage ceiling PSG Mail tracks for
-- its own progress bars/warnings — they do not change the provider's real
-- account plan (see setting-service.js's FEATURE_DEFAULTS comment).
ALTER TABLE psg_feature_setting ADD COLUMN resend_daily_quota INTEGER NOT NULL DEFAULT 0;
ALTER TABLE psg_feature_setting ADD COLUMN resend_monthly_quota INTEGER NOT NULL DEFAULT 0;
ALTER TABLE psg_feature_setting ADD COLUMN mailjet_api_key TEXT NOT NULL DEFAULT '';
ALTER TABLE psg_feature_setting ADD COLUMN mailjet_secret_key TEXT NOT NULL DEFAULT '';
ALTER TABLE psg_feature_setting ADD COLUMN mailjet_daily_quota INTEGER NOT NULL DEFAULT 0;
ALTER TABLE psg_feature_setting ADD COLUMN mailjet_monthly_quota INTEGER NOT NULL DEFAULT 0;

-- email.resend_email_id is populated by BOTH the Resend and Cloudflare
-- Email send paths (see email-service.js's send()), so it can't be used to
-- tell providers apart. `provider` tags which path actually sent each row
-- ('cloudflare' | 'resend' | 'mailjet' | 'internal'), so usage can be
-- queried per provider for the settings page's usage cards. Existing rows
-- default to '' (unknown — predates this column).
ALTER TABLE email ADD COLUMN provider TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_email_provider_type_time ON email(provider, type, create_time);
