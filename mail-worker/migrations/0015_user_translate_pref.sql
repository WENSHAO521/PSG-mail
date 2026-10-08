-- Per-user translation engine (Settings → Account), overriding the admin
-- default from migrations/0013.
--
-- translate_provider: '' follows the system setting, else 'google' / 'ai'.
-- google_translate_key: the user's own Cloud Translation API key; empty
-- falls back to the admin's key, then to the keyless endpoint.
ALTER TABLE psg_user_pref ADD COLUMN translate_provider TEXT NOT NULL DEFAULT '';
ALTER TABLE psg_user_pref ADD COLUMN google_translate_key TEXT NOT NULL DEFAULT '';
