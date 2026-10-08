// Lazy, memoized "add the column if an older database lacks it" guard.
// Replaces running ALTER TABLE inside every request: the check now costs one
// pragma_table_info read per column per Worker isolate, and the ALTER only runs
// when the column is really missing. A failure clears the memo so it is retried.
const checked = new Map();

export function ensureColumn(c, table, column, ddl) {
	const id = `${table}.${column}`;
	if (!checked.has(id)) {
		const promise = (async () => {
			const exists = await c.env.db
				.prepare(`SELECT 1 AS ok FROM pragma_table_info('${table}') WHERE name = ? LIMIT 1`)
				.bind(column).first();
			if (!exists) {
				try {
					await c.env.db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`).run();
				} catch (e) {
					// A concurrent isolate may have added it first.
					const again = await c.env.db
						.prepare(`SELECT 1 AS ok FROM pragma_table_info('${table}') WHERE name = ? LIMIT 1`)
						.bind(column).first();
					if (!again) throw e;
				}
			}
		})().catch(e => {
			checked.delete(id);
			throw e;
		});
		checked.set(id, promise);
	}
	return checked.get(id);
}

export const ensureDeleteTime = c => ensureColumn(c, 'email', 'delete_time', 'TEXT');
export const ensureIsArchive = c => ensureColumn(c, 'email', 'is_archive', 'INTEGER NOT NULL DEFAULT 0');
export const ensureIsSpam = c => ensureColumn(c, 'email', 'is_spam', 'INTEGER NOT NULL DEFAULT 0');
export const ensureUserAvatar = c => ensureColumn(c, 'user', 'avatar', "TEXT NOT NULL DEFAULT ''");
export const ensureUserSignature = c => ensureColumn(c, 'user', 'signature', "TEXT NOT NULL DEFAULT ''");
