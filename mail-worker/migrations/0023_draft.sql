-- Drafts kept on the server, so they follow the user to every browser and
-- device (they used to live only in the browser's IndexedDB). `data` is the
-- compose form as JSON; attachments in it are references (`draftAttKey`, a
-- stored object under draft-att/<user_id>/, or `attId`, an existing mail
-- attachment being forwarded), never file contents.
-- Rollback: DROP TABLE psg_draft;  (drafts would then only be on the server's backups).
CREATE TABLE IF NOT EXISTS psg_draft (
  draft_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  data TEXT NOT NULL DEFAULT '{}',
  create_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_psg_draft_user ON psg_draft (user_id, draft_id);
