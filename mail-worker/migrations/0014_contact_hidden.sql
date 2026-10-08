-- Auto contacts (src/service/contact-service.js) are derived from mail
-- history on every read, so there is no contact table to delete from. This
-- records the addresses a user removed from that list so they stay hidden.
CREATE TABLE IF NOT EXISTS psg_contact_hidden (
  user_id INTEGER NOT NULL,
  email TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, email)
);
