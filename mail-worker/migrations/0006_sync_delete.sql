-- Sync delete: when OPEN (0), user/account/email deletes are immediately
-- physical (orm delete) instead of the existing isDel soft-delete flag.
-- Defaults to CLOSE (1) — soft-delete stays the behavior for every existing
-- deployment unless an admin opts in. Ported from maillab/cloud-mail v3.1.0,
-- landed in psg_feature_setting (not the legacy setting table) so this
-- migration doesn't have to run before /api/init creates that table on a
-- brand-new deploy — see 0004's own comment for why.
ALTER TABLE psg_feature_setting ADD COLUMN sync_delete INTEGER NOT NULL DEFAULT 1;
