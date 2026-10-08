-- Multiple named signatures per user (Settings → Signature), Gmail style:
-- a list of signatures plus which one new mail and replies/forwards start
-- with. Stored as one JSON document per user — the list is small (capped
-- in user-service.js) and always read and written whole.
-- The legacy `user.signature` column keeps mirroring the new-mail default
-- so anything still reading it sees the right text; a user with no row
-- here is migrated from that column on first read.
CREATE TABLE IF NOT EXISTS psg_user_signature (
  user_id INTEGER PRIMARY KEY,
  data TEXT NOT NULL DEFAULT '{}'
);
