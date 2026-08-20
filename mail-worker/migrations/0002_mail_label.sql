CREATE TABLE IF NOT EXISTS mail_label (
	label_id INTEGER PRIMARY KEY AUTOINCREMENT,
	user_id INTEGER NOT NULL,
	name TEXT NOT NULL,
	color TEXT NOT NULL DEFAULT '#7e7576',
	sort_order INTEGER NOT NULL DEFAULT 0,
	create_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
	update_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Many-to-many: one email can carry several labels, one label spans many
-- emails. Deliberately NOT a comma-separated column on `email` — see
-- label-service.js's header.
CREATE TABLE IF NOT EXISTS mail_label_email (
	label_id INTEGER NOT NULL,
	email_id INTEGER NOT NULL,
	create_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY (label_id, email_id)
);

CREATE INDEX IF NOT EXISTS idx_mail_label_user ON mail_label (user_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_mail_label_email_email ON mail_label_email (email_id);
