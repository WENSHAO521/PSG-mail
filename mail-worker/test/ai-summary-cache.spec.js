import { env } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import { setupFullSchema } from './helpers/full-schema';
import aiMailService from '../src/service/ai-mail-service';

function ctxWith(aiRun) {
	const store = new Map([['setting', { aiDailyQuota: 0, resendTokens: {}, autoRefresh: 0 }]]);
	return { env: { ...env, ai: { run: aiRun } }, get: k => store.get(k), set: (k, v) => store.set(k, v), req: { header: () => '' } };
}

beforeAll(async () => {
	await setupFullSchema();
	await env.db.prepare(`INSERT INTO email (email_id, account_id, user_id, subject, text, content) VALUES (8001, 1, 11, 'Hello', 'please review the manuscript', '')`).run();
});

describe('summary cache', () => {
	it('calls the model once per unchanged mail, never serves another user, re-summarizes changed mail', async () => {
		let calls = 0;
		const c = ctxWith(async () => { calls++; return { response: '- point ' + calls }; });

		const first = await aiMailService.summary(c, 11, 8001);
		const second = await aiMailService.summary(c, 11, 8001);
		expect(calls).toBe(1);
		expect(second.summary).toBe(first.summary);
		expect(second.cached).toBe(true);

		// another user is refused before the cache is consulted
		await expect(aiMailService.summary(c, 12, 8001)).rejects.toMatchObject({ code: 404 });
		expect(calls).toBe(1);

		await env.db.prepare(`UPDATE email SET text = 'the manuscript was withdrawn' WHERE email_id = 8001`).run();
		const third = await aiMailService.summary(c, 11, 8001);
		expect(calls).toBe(2);
		expect(third.summary).not.toBe(first.summary);
	});
});
