// Migration replay test: the full legacy init chain + every D1 migration
// must apply cleanly to an empty database, and applying migrations a second
// time must be a no-op (Wrangler only runs unrecorded files, but the files
// themselves are written to be idempotent as a second line of defense).
import { env, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import { bootstrapSchema } from './helpers/schema';

async function tableNames() {
	const { results } = await env.db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all();
	return results.map(r => r.name);
}

async function columns(table) {
	const { results } = await env.db.prepare(`PRAGMA table_info(${table})`).all();
	return results.map(r => r.name);
}

describe('schema bootstrap + migrations', () => {
	beforeAll(async () => {
		await bootstrapSchema();
	});

	it('creates the 4.0 security / reliability tables', async () => {
		const names = await tableNames();
		for (const t of ['security_audit_log', 'email_delivery_event', 'user', 'email', 'attachments', 'account_share', 'd1_migrations']) {
			expect(names).toContain(t);
		}
	});

	it('records every migration file exactly once', async () => {
		const { results } = await env.db.prepare('SELECT name FROM d1_migrations ORDER BY id').all();
		expect(results.map(r => r.name)).toEqual(env.TEST_MIGRATIONS.map(m => m.name));
	});

	it('re-applying migrations is a no-op', async () => {
		await applyD1Migrations(env.db, env.TEST_MIGRATIONS);
		const { results } = await env.db.prepare('SELECT COUNT(*) AS n FROM d1_migrations').all();
		expect(results[0].n).toBe(env.TEST_MIGRATIONS.length);
	});

	it('schema guard is idempotent and adds a missing column on an old database', async () => {
		const { default: schemaGuard, COLUMNS } = await import('../src/init/schema-guard');
		await env.db.prepare('CREATE TABLE legacy_probe (id INTEGER PRIMARY KEY)').run();
		COLUMNS.push({ table: 'legacy_probe', column: 'added_later', ddl: 'TEXT' });
		try {
			await schemaGuard.ensureNow({ env });
			await schemaGuard.ensureNow({ env });
			expect(await columns('legacy_probe')).toContain('added_later');
		} finally {
			COLUMNS.pop();
		}
	});

	it('every migration file is additive (no DROP / TRUNCATE / DELETE)', () => {
		for (const m of env.TEST_MIGRATIONS) {
			const sql = m.queries.join('\n').replace(/--[^\n]*/g, '');
			expect(sql, m.name).not.toMatch(/\bDROP\s+(TABLE|COLUMN|INDEX)\b/i);
			expect(sql, m.name).not.toMatch(/\bTRUNCATE\b/i);
			expect(sql, m.name).not.toMatch(/\bDELETE\s+FROM\b/i);
		}
	});

	it('legacy hot-path columns exist after bootstrap', async () => {
		const emailCols = await columns('email');
		for (const col of ['is_archive', 'is_spam', 'delete_time', 'provider', 'message_id', 'in_reply_to', 'relation']) {
			expect(emailCols).toContain(col);
		}
	});
});
