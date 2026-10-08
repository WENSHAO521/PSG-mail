// Schema guard for objects that historically were created lazily from
// request handlers (`ALTER TABLE ... ADD COLUMN` / `CREATE TABLE IF NOT
// EXISTS` wrapped in try/catch, re-issued on EVERY call to archive, spam,
// delete, avatar, signature, template, contact-group, auto-reply…).
//
// Why not a numbered D1 migration? Production databases are in mixed states:
// some already got these columns from the hot paths, some never did. An
// `ALTER TABLE ADD COLUMN` migration would fail ("duplicate column") on the
// former and abort the whole deploy. This guard checks PRAGMA table_info and
// only adds what is missing, so it is safe on every database state.
//
// It runs from POST /init (deploy bootstrap) and at most once per Worker
// isolate from the code paths that need these objects — replacing a DDL
// statement per request with ~10 cheap reads per isolate lifetime.

const TABLES = [
	`CREATE TABLE IF NOT EXISTS account_share (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		account_id INTEGER NOT NULL,
		user_id INTEGER NOT NULL,
		create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
		UNIQUE(account_id, user_id)
	)`,
	`CREATE TABLE IF NOT EXISTS auto_reply (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL UNIQUE, enabled INTEGER NOT NULL DEFAULT 0, message TEXT NOT NULL DEFAULT '', update_time DATETIME DEFAULT CURRENT_TIMESTAMP)`,
	`CREATE TABLE IF NOT EXISTS contact_group (group_id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, name TEXT NOT NULL DEFAULT '', emails TEXT NOT NULL DEFAULT '[]', create_time DATETIME DEFAULT CURRENT_TIMESTAMP)`,
	`CREATE TABLE IF NOT EXISTS email_template (template_id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, name TEXT NOT NULL DEFAULT '', subject TEXT NOT NULL DEFAULT '', content TEXT NOT NULL DEFAULT '', create_time DATETIME DEFAULT CURRENT_TIMESTAMP)`,
	`CREATE TABLE IF NOT EXISTS notification_device (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER NOT NULL,
		installation_uuid TEXT,
		platform TEXT NOT NULL,
		target_kind TEXT NOT NULL,
		target_value TEXT NOT NULL,
		device_name TEXT,
		enabled INTEGER NOT NULL DEFAULT 1,
		last_seen_at TEXT,
		created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
		updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
		UNIQUE(user_id, target_kind, target_value)
	)`,
	`CREATE INDEX IF NOT EXISTS idx_notification_device_user ON notification_device (user_id, enabled)`,
	`CREATE INDEX IF NOT EXISTS idx_account_share_user_id ON account_share(user_id)`,
	`CREATE INDEX IF NOT EXISTS idx_account_share_account_id ON account_share(account_id)`,
];

export const COLUMNS = [
	{ table: 'email', column: 'is_archive', ddl: 'INTEGER NOT NULL DEFAULT 0' },
	{ table: 'email', column: 'is_spam', ddl: 'INTEGER NOT NULL DEFAULT 0' },
	{ table: 'email', column: 'delete_time', ddl: 'TEXT' },
	{ table: 'user', column: 'avatar', ddl: "TEXT NOT NULL DEFAULT ''" },
	{ table: 'user', column: 'signature', ddl: "TEXT NOT NULL DEFAULT ''" },
];

let pending = null;

async function existingColumns(db, table) {
	const { results } = await db.prepare(`PRAGMA table_info(${table})`).all();
	return new Set(results.map(r => r.name));
}

async function run(c) {
	const db = c.env.db;
	for (const sql of TABLES) {
		await db.prepare(sql).run();
	}
	const byTable = new Map();
	for (const col of COLUMNS) {
		if (!byTable.has(col.table)) byTable.set(col.table, await existingColumns(db, col.table));
		const cols = byTable.get(col.table);
		if (cols.size === 0) continue; // base table itself missing — /init hasn't run
		if (!cols.has(col.column)) {
			try {
				await db.prepare(`ALTER TABLE ${col.table} ADD COLUMN ${col.column} ${col.ddl}`).run();
			} catch (e) {
				// Lost a race with another isolate adding the same column.
				if (!/duplicate column/i.test(e?.message || '')) throw e;
			}
			cols.add(col.column);
		}
	}
}

const schemaGuard = {
	// Once per isolate; a failure is not cached so the next call retries.
	ensure(c) {
		if (!pending) {
			pending = run(c).catch((e) => {
				pending = null;
				console.error('schema guard failed:', e?.message);
			});
		}
		return pending;
	},

	// For /init and tests: always re-check.
	async ensureNow(c) {
		await run(c);
		pending = Promise.resolve();
	},

	_reset() {
		pending = null;
	}
};

export default schemaGuard;
