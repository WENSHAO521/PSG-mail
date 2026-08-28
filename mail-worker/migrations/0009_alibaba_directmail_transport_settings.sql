-- Keep DirectMail transport metadata in the application settings rather than
-- in the settings-page template. The current Hangzhou/465/SSL-TLS values are
-- defaults only; the service reads the saved values at runtime.
ALTER TABLE psg_feature_setting ADD COLUMN alibaba_directmail_region_name TEXT NOT NULL DEFAULT '华东1（杭州）';
ALTER TABLE psg_feature_setting ADD COLUMN alibaba_directmail_region_id TEXT NOT NULL DEFAULT 'cn-hangzhou';
ALTER TABLE psg_feature_setting ADD COLUMN alibaba_directmail_smtp_host TEXT NOT NULL DEFAULT 'smtpdm.aliyun.com';
ALTER TABLE psg_feature_setting ADD COLUMN alibaba_directmail_smtp_port INTEGER NOT NULL DEFAULT 465;
ALTER TABLE psg_feature_setting ADD COLUMN alibaba_directmail_encryption TEXT NOT NULL DEFAULT 'SSL/TLS';
