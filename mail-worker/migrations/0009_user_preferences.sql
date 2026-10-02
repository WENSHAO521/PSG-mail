-- Per-user compose preferences (Settings → Profile): the Undo Send delay and
-- whether Reply/Reply all send from the mailbox the original mail belongs to.
-- A separate additive table rather than new columns on the legacy `user`
-- table, for the same reason 0004 gives for `setting`: D1 migrations run
-- before /api/init creates `user` on a brand-new database, so ALTER TABLE
-- user here would make a clean deploy fail. A missing row means "defaults"
-- (user-service.js reads with fallbacks and upserts on change).
CREATE TABLE IF NOT EXISTS psg_user_pref (
  user_id INTEGER PRIMARY KEY,
  undo_send_seconds INTEGER NOT NULL DEFAULT 10,
  reply_from_received INTEGER NOT NULL DEFAULT 1
);
