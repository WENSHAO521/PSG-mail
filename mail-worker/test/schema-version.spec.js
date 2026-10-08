import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import worker from '../src';
import { parseAppliedVersion, readSchemaReport, EXPECTED_SCHEMA_VERSION } from '../src/db/schema-version';
import { APP_VERSION } from '../src/shared/version';

describe('schema version', () => {
	it('takes the highest numbered migration and ignores other names', () => {
		expect(parseAppliedVersion([])).toBe(0);
		expect(parseAppliedVersion(['0001_a.sql', '0014_b.sql', '0003_c.sql', 'junk'])).toBe(14);
	});

	it('is unknown without d1_migrations, behind when older, ok when current', async () => {
		await env.db.prepare('DROP TABLE IF EXISTS d1_migrations').run();
		expect(await readSchemaReport(env.db)).toMatchObject({ status: 'unknown', applied: null });

		await env.db.prepare('CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY, name TEXT, applied_at TEXT)').run();
		await env.db.prepare("INSERT INTO d1_migrations (name) VALUES ('0001_x.sql')").run();
		expect(await readSchemaReport(env.db)).toMatchObject({ status: 'behind', applied: 1 });

		await env.db.prepare('INSERT INTO d1_migrations (name) VALUES (?)').bind(`${String(EXPECTED_SCHEMA_VERSION).padStart(4, '0')}_y.sql`).run();
		expect(await readSchemaReport(env.db)).toMatchObject({ status: 'ok', applied: EXPECTED_SCHEMA_VERSION });
		await env.db.prepare('DROP TABLE d1_migrations').run();
	});

	it('GET /api/health is public and reports version + schema', async () => {
		const ctx = createExecutionContext();
		const res = await worker.fetch(new Request('http://example.com/api/health'), env, ctx);
		await waitOnExecutionContext(ctx);
		const body = await res.json();
		expect(body.code).toBe(200);
		expect(body.data.version).toBe(APP_VERSION);
		expect(body.data.schema.expected).toBe(EXPECTED_SCHEMA_VERSION);
	});
});
