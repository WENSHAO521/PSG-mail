-- Index for per-account mail list/poll queries that are NOT scoped by user_id, i.e. a user
-- reading an account that was shared with them (access = account_id, not ownership).
-- Without it the planner walks idx_email_type (type, rowid) and filters every row, so rows read
-- grow with the *whole table*, not the page (measured on local D1: 198 rows read for a 20-row
-- page when the shared account holds 10% of the table; ~21 with this index).
-- Additive; safe to run twice. Rollback: DROP INDEX idx_email_account_list;
CREATE INDEX IF NOT EXISTS idx_email_account_list ON email(account_id, type, is_del, email_id);
