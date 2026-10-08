-- In-place email translation engine (src/service/translate-service.js).
--
-- translate_provider: 'google' (default) uses Google Translate, 'ai' uses
-- the Workers AI chat model as before. google_translate_key is an optional
-- Cloud Translation API key; without one the keyless public endpoint is
-- used, which is free but rate-limited.
ALTER TABLE psg_feature_setting ADD COLUMN translate_provider TEXT NOT NULL DEFAULT 'google';
ALTER TABLE psg_feature_setting ADD COLUMN google_translate_key TEXT NOT NULL DEFAULT '';
