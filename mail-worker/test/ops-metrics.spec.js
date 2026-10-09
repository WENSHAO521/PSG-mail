import { env } from 'cloudflare:test';
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { setupFullSchema } from './helpers/full-schema';
import { bump, flushMetrics, readMetrics, maybeFlush, purgeOldMetrics, _resetForTests } from '../src/service/ops-metrics';
import opsService from '../src/service/ops-service';
import { loginThrottleKeys, assertLoginAllowed, recordLoginFailure } from '../src/service/login-throttle';

beforeAll(async () => {
	await setupFullSchema();
	await env.db.prepare(`CREATE TABLE IF NOT EXISTS ops_metric (day TEXT NOT NULL, metric TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0, total_ms INTEGER NOT NULL DEFAULT 0, max_ms INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, metric)) WITHOUT ROWID`).run();
});
beforeEach(async () => {
	_resetForTests();
	await env.db.prepare('DELETE FROM ops_metric').run();
});

describe('ops metrics', () => {
	it('aggregates many events into one row per metric and accumulates across flushes', async () => {
		for (let i = 0; i < 500; i++) bump('auth.login_failed');
		bump('cron.daily.test', { ms: 40 });
		bump('cron.daily.test', { ms: 100 });
		expect(await flushMetrics(env)).toBe(2);                    // 502 events -> 2 rows written
		bump('auth.login_failed', { n: 5 });
		await flushMetrics(env);
		const rows = await readMetrics(env, 1);
		expect(rows.find(r => r.metric === 'auth.login_failed').count).toBe(505);
		const t = rows.find(r => r.metric === 'cron.daily.test');
		expect(t).toMatchObject({ count: 2, avgMs: 70, maxMs: 100 });
		const stored = await env.db.prepare('SELECT COUNT(*) AS n FROM ops_metric').first();
		expect(stored.n).toBe(2);
	});

	it('rejects bad or unbounded metric names', async () => {
		bump('has space');
		bump('UPPER');
		bump('x'.repeat(80));
		for (let i = 0; i < 200; i++) bump('dyn.' + i);
		expect(await flushMetrics(env)).toBe(64);                   // capped
	});

	it('flushes opportunistically at most once per minute', async () => {
		bump('auth.session_invalid');
		maybeFlush({ env, executionCtx: { waitUntil: () => {} } });   // < 60 s since start: no write
		expect((await env.db.prepare('SELECT COUNT(*) AS n FROM ops_metric').first()).n).toBe(0);
	});

	it('is recorded by the login throttle without storing who attempted', async () => {
		const c = { env, req: { header: () => '203.0.113.50' } };
		const keys = await loginThrottleKeys(c, 'victim@example.com');
		for (let i = 0; i < 10; i++) await recordLoginFailure(c, keys, await assertLoginAllowed(c, keys));
		await expect(assertLoginAllowed(c, keys)).rejects.toMatchObject({ code: 429 });
		await flushMetrics(env);
		const rows = await readMetrics(env, 1);
		expect(rows.find(r => r.metric === 'auth.login_failed').count).toBe(10);
		expect(rows.find(r => r.metric === 'auth.login_throttled').count).toBe(1);
		const dump = JSON.stringify(await env.db.prepare('SELECT * FROM ops_metric').all());
		expect(dump).not.toContain('victim');
		expect(dump).not.toContain('203.0.113');
		await env.kv.delete(keys.acct); await env.kv.delete(keys.ip);
	});

	it('purges old days and survives a missing table', async () => {
		await env.db.prepare(`INSERT INTO ops_metric (day, metric, count) VALUES ('2020-01-01', 'old', 1)`).run();
		await purgeOldMetrics(env, 60);
		expect((await env.db.prepare('SELECT COUNT(*) AS n FROM ops_metric').first()).n).toBe(0);

		bump('auth.login_failed');
		const brokenEnv = { db: { batch: async () => { throw new Error('no such table: ops_metric'); } } };
		expect(await flushMetrics(brokenEnv)).toBe(0);              // no throw
	});

	it('overview returns metrics and gauges', async () => {
		bump('storage.oss_blocked', { n: 3 });
		const c = { env, get: () => undefined, set: () => {} };
		const out = await opsService.overview(c, 7);
		expect(out.metrics.find(m => m.metric === 'storage.oss_blocked').count).toBe(3);
		expect(out.gauges).toHaveProperty('scheduledMail');
		expect(out.note).toMatch(/approximate/);
	});
});
