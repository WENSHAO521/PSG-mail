-- ============================================================================
-- repair-hidden-received-mail.sql
--
-- Background: emailService.completeReceiveAll() (the 5-minute cron fallback
-- for emails whose receive() -> completeReceive() sequence was interrupted,
-- e.g. by Worker isolation eviction) used to only flip `status` back to
-- RECEIVE/NOONE and never restored `is_del` from the DELETE staging value it
-- gets while a message is mid-receive. Every list query (list()/latest()/
-- allList()) filters on is_del = NORMAL, so any row that went through that
-- code path is a "ghost email": it looks fully received by its status column
-- but is invisible in every Inbox/API view forever. This has been fixed in
-- emailService.completeReceiveAll() (mail-worker/src/service/email-service.js)
-- going forward; this script is for messages that were already stuck before
-- the fix deployed.
--
-- Constants used below (mail-worker/src/const/entity-const.js):
--   emailConst.status.RECEIVE = 0   emailConst.status.NOONE = 7
--   isDel.NORMAL = 0                 isDel.DELETE = 1
--
-- Real user-initiated Trash always sets delete_time (see emailService.delete
-- in email-service.js); the staging DELETE value never does. So
-- `delete_time IS NULL` is what tells a ghost-staging row apart from mail the
-- user actually deleted — do NOT run a repair that ignores it, or it will
-- resurrect real Trash.
--
-- Run the steps below in order, in the D1 console (or `wrangler d1 execute`).
-- Do NOT skip the COUNT steps or run the UPDATE unattended.
-- ============================================================================

-- ── Step 1: detect ────────────────────────────────────────────────────────
-- Safe to run any time — read-only. Expect 0 rows on a healthy database, or
-- on one where completeReceiveAll() has already been fixed and had time to
-- run since the last time any message actually got stuck mid-receive.
SELECT
    email_id,
    user_id,
    account_id,
    subject,
    status,
    is_del,
    delete_time,
    create_time
FROM email
WHERE status IN (0, 7)          -- RECEIVE or NOONE
  AND is_del = 1                -- DELETE (staging value, not real Trash)
  AND delete_time IS NULL       -- real Trash always has delete_time set
ORDER BY create_time DESC;

-- ── Step 2: confirm the count before touching anything ─────────────────────
SELECT COUNT(*) AS ghost_email_count
FROM email
WHERE status IN (0, 7)
  AND is_del = 1
  AND delete_time IS NULL;

-- ── Step 3: repair (only after reviewing Step 1's output) ──────────────────
-- Restores is_del = NORMAL for exactly the rows Step 1 identified. Scoped to
-- the same status/is_del/delete_time-null predicate — it will never touch a
-- row that has delete_time set (real Trash) or a row still legitimately
-- mid-flight (status = SAVING, not selected here).
--
-- UPDATE email
-- SET is_del = 0
-- WHERE status IN (0, 7)
--   AND is_del = 1
--   AND delete_time IS NULL;

-- ── Step 4: verify ───────────────────────────────────────────────────────
-- Re-run Step 2's COUNT — expect 0 after the repair.
-- SELECT COUNT(*) AS ghost_email_count
-- FROM email
-- WHERE status IN (0, 7)
--   AND is_del = 1
--   AND delete_time IS NULL;
