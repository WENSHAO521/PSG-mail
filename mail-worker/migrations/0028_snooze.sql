-- Snooze: a mail is archived until `until` (epoch ms), then the per-minute
-- cron brings it back to the inbox as unread and drops the row.
-- Rollback: DROP TABLE psg_snooze;  (snoozed mails stay in the archive)
CREATE TABLE IF NOT EXISTS psg_snooze (
  email_id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  until INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_psg_snooze_until ON psg_snooze (until);
CREATE INDEX IF NOT EXISTS idx_psg_snooze_user ON psg_snooze (user_id, until);
