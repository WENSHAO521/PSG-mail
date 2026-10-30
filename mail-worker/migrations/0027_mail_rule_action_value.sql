-- Rules can now also add a label, move to spam or move to trash. The label
-- action needs to know which label: action_value holds its label_id ('' for
-- the other actions).
-- Rollback: ALTER TABLE psg_mail_rule DROP COLUMN action_value;
ALTER TABLE psg_mail_rule ADD COLUMN action_value TEXT NOT NULL DEFAULT '';
