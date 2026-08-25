-- Composite indexes matching the actual filter+sort shape of the hot mail
-- list queries (email-service.js's list()/allEmailList(), star-service.js's
-- list()) — filtered by user/account/type/is_del, then paginated by
-- email_id — so the planner can do one ordered range scan instead of
-- combining the existing single-column indexes (idx_email_user_id_account_id,
-- idx_email_type, idx_email_status, idx_email_is_del from init.js's legacy
-- chain) or falling back to a full scan for the sort. Purely additive;
-- doesn't touch or replace those. Ported from maillab/cloud-mail v3.2.0.
CREATE INDEX IF NOT EXISTS idx_email_list_user ON email(user_id, type, is_del, email_id);
CREATE INDEX IF NOT EXISTS idx_email_list_account ON email(user_id, account_id, type, is_del, email_id);
CREATE INDEX IF NOT EXISTS idx_star_user_email ON star(user_id, email_id);
CREATE INDEX IF NOT EXISTS idx_star_email_user ON star(email_id, user_id);
