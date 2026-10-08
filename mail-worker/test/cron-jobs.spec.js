// Daily maintenance jobs on the real schema.
import { env } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import { setupFullSchema, makeCtx } from './helpers/full-schema';
import emailService from '../src/service/email-service';
import { ensureDeleteTime } from '../src/utils/schema-guard';

beforeAll(async () => {
	await setupFullSchema();
	await ensureDeleteTime(makeCtx());
});

async function seedTrash(count, firstId, ageDays) {
	const old = new Date(Date.now() - ageDays * 86400000).toISOString().slice(0, 19).replace('T', ' ');
	for (let start = 0; start < count; start += 50) {
		const stmts = [];
		for (let i = start; i < Math.min(count, start + 50); i++) {
			const id = firstId + i;
			stmts.push(env.db.prepare(`INSERT INTO email (email_id, account_id, user_id, subject, is_del, delete_time) VALUES (?, 1, 1, 't', 1, ?)`).bind(id, old));
			stmts.push(env.db.prepare(`INSERT INTO star (user_id, email_id) VALUES (1, ?)`).bind(id));
			stmts.push(env.db.prepare(`INSERT INTO attachments (user_id, email_id, account_id, key, filename) VALUES (1, ?, 1, ?, 'f')`).bind(id, 'attachments/k' + id));
		}
		await env.db.batch(stmts);
	}
}

describe('purgeExpiredTrash', () => {
	it('purges more than 100 expired mails in one run, with their stars and attachment rows', async () => {
		await seedTrash(250, 50000, 400);
		await seedTrash(5, 60000, 1); // not expired
		await emailService.purgeExpiredTrash(makeCtx());
		const left = await env.db.prepare(`SELECT COUNT(*) AS n FROM email WHERE email_id >= 50000 AND email_id < 50250`).first();
		const stars = await env.db.prepare(`SELECT COUNT(*) AS n FROM star WHERE email_id >= 50000 AND email_id < 50250`).first();
		const atts = await env.db.prepare(`SELECT COUNT(*) AS n FROM attachments WHERE email_id >= 50000 AND email_id < 50250`).first();
		const fresh = await env.db.prepare(`SELECT COUNT(*) AS n FROM email WHERE email_id >= 60000`).first();
		expect(left.n).toBe(0);
		expect(stars.n).toBe(0);
		expect(atts.n).toBe(0);
		expect(fresh.n).toBe(5);
	});
});

describe('physicsDelete', () => {
	it('handles more than 100 ids in one call', async () => {
		await seedTrash(130, 70000, 1);
		const ids = Array.from({ length: 130 }, (_, i) => 70000 + i).join(',');
		await emailService.physicsDelete(makeCtx(), { emailIds: ids });
		const left = await env.db.prepare(`SELECT COUNT(*) AS n FROM email WHERE email_id >= 70000 AND email_id < 70130`).first();
		const stars = await env.db.prepare(`SELECT COUNT(*) AS n FROM star WHERE email_id >= 70000 AND email_id < 70130`).first();
		expect(left.n).toBe(0);
		expect(stars.n).toBe(0);
	});
});

import analysisService from '../src/service/analysis-service';

describe('analysis cache refresh', () => {
	it('skips the expensive refresh when nothing new arrived, refreshes when it did', async () => {
		const c = { env: { ...env, analysis_cache: 'true' }, get: () => undefined, set: () => {} };
		const key = 'analysis_echarts:UTC';
		await env.kv.put(key, JSON.stringify({ stale: true }));

		await analysisService.refreshEchartsCache(c, { onlyIfChanged: true }); // no fingerprint stored yet -> refresh
		const first = await env.kv.get(key, { type: 'json' });
		expect(first.stale).toBeUndefined();
		expect(first._fp).toBeTruthy();

		await env.kv.put(key, JSON.stringify({ ...first, marker: 'untouched' }));
		await analysisService.refreshEchartsCache(c, { onlyIfChanged: true }); // same fingerprint -> skipped
		expect((await env.kv.get(key, { type: 'json' })).marker).toBe('untouched');

		await env.db.prepare(`INSERT INTO email (account_id, user_id, subject) VALUES (1, 1, 'new')`).run();
		await analysisService.refreshEchartsCache(c, { onlyIfChanged: true }); // new mail -> refreshed
		expect((await env.kv.get(key, { type: 'json' })).marker).toBeUndefined();

		await env.db.prepare(`UPDATE email SET is_del = 1 WHERE subject = 'new'`).run();
		await analysisService.refreshEchartsCache(c); // daily run always refreshes
		await env.kv.delete(key);
	});
});

describe('per-minute cron, nothing due', () => {
	it('stays index-bound with a large history (rows read does not grow with it)', async () => {
		for (let b = 0; b < 20; b++) {
			const st = [];
			for (let i = 0; i < 100; i++) {
				st.push(env.db.prepare(`INSERT INTO scheduled_email (user_id, account_id, payload, scheduled_at, status) VALUES (1, 1, '{}', '2020-01-01 00:00:00', 'sent')`));
				st.push(env.db.prepare(`INSERT INTO forward_delivery_log (forwarding_id, source_email_id, status, attempt_count) VALUES (?, ?, 'sent', 1)`).bind(b + 1, b * 100 + i + 900000));
			}
			await env.db.batch(st);
		}
		const claim = await env.db.prepare(
			`UPDATE scheduled_email SET status = 'processing', update_time = CURRENT_TIMESTAMP WHERE status = 'pending' AND scheduled_at <= ? RETURNING *`
		).bind('2099-01-01 00:00:00').all();
		const fwd = await env.db.prepare(
			`SELECT l.* FROM forward_delivery_log l JOIN personal_forwarding f ON f.id = l.forwarding_id JOIN email e ON e.email_id = l.source_email_id
			 WHERE l.status = 'failed' AND f.status = 'enabled' AND l.attempt_count < ? AND (l.next_attempt_at IS NULL OR l.next_attempt_at <= CURRENT_TIMESTAMP)
			 ORDER BY l.next_attempt_at ASC, l.id ASC LIMIT 50`
		).bind(5).all();
		// 2000 history rows in each table: an index-bound empty poll reads (almost) nothing
		expect(claim.meta.rows_read).toBeLessThan(5);
		expect(fwd.meta.rows_read).toBeLessThan(5);
		expect(claim.meta.rows_written).toBe(0);
	});
});
