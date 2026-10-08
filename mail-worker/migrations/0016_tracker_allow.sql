-- Senders a user trusts (reader banner → "Always load from this sender"):
-- tracker blocking is skipped for their future mail. Exact addresses only,
-- lower-cased; a domain-wide allow would let any address on it through.
CREATE TABLE IF NOT EXISTS psg_tracker_allow (
  user_id INTEGER NOT NULL,
  sender TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, sender)
);
