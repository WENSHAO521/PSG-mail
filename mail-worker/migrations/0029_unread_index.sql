-- Unread counts (sidebar badge, mailbox switcher) are asked for on every
-- client sync. Without this index the query walked every Inbox mail of the
-- user; with it, only the unread ones. Partial, so it stays small.
-- emailService.unreadCounts writes type/is_del/unread as literals to match.
CREATE INDEX IF NOT EXISTS idx_email_unread_inbox ON email(user_id, account_id) WHERE type = 0 AND is_del = 0 AND unread = 0;
