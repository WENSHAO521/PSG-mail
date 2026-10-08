-- PSG Mail 4.0 / P1 — indexes for lookups that EXPLAIN QUERY PLAN showed as
-- full table scans (measured on a schema built from init.js + migrations):
--   attachments WHERE key = ?            attachment ACL, cleanup re-check, dedupe
--   email WHERE resend_email_id = ?      provider delivery webhooks
-- Additive only. Index build on a large production table takes a write lock
-- for its duration: apply in a quiet window (see ROLLOUT.md). Rollback:
-- DROP INDEX is safe but unnecessary.
CREATE INDEX IF NOT EXISTS idx_attachments_key ON attachments(key);
CREATE INDEX IF NOT EXISTS idx_email_resend_email_id ON email(resend_email_id) WHERE resend_email_id IS NOT NULL;
