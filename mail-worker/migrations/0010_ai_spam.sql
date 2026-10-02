-- AI spam detection for incoming mail.
--
-- ai_spam: admin switch on the psg_feature_setting singleton (0 = OPEN,
-- 1 = CLOSE, default off) — landed here rather than the legacy setting
-- table for the same reason as 0004/0006.
--
-- psg_spam_verdict: why a message was moved to Spam automatically, shown
-- to the reader in the Spam folder. One row per email; removed when the
-- user marks it "not spam".
--
-- psg_spam_allow: senders a user has vouched for by marking their mail
-- "not spam". Mail from these addresses skips AI screening for that user.
ALTER TABLE psg_feature_setting ADD COLUMN ai_spam INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS psg_spam_verdict (
  email_id INTEGER PRIMARY KEY,
  source TEXT NOT NULL DEFAULT 'ai',
  confidence REAL NOT NULL DEFAULT 0,
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS psg_spam_allow (
  user_id INTEGER NOT NULL,
  sender TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, sender)
);
