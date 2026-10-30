-- Template category and favorite, which used to live only in the browser's
-- localStorage (lost on another device). The table is also created lazily
-- by template-api.js, so make sure it exists before adding the columns.
-- Rollback: ALTER TABLE email_template DROP COLUMN category;
--           ALTER TABLE email_template DROP COLUMN favorite;
CREATE TABLE IF NOT EXISTS email_template (
  template_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE email_template ADD COLUMN category TEXT NOT NULL DEFAULT '';
ALTER TABLE email_template ADD COLUMN favorite INTEGER NOT NULL DEFAULT 0;
