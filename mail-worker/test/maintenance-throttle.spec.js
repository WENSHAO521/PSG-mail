// /init and /reset-admin: failures are throttled per source, so one client cannot lock everybody out.
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, afterAll } from 'vitest';
import worker from '../src';

const testEnv = { ...env, maintenance_secret: 'm'.repeat(40) };

async function resetAdmin(ip, secret) {
	const ctx = createExecutionContext();
	const res = await worker.fetch(new Request('http://example.com/api/reset-admin', {
		method: 'POST',
		headers: { 'CF-Connecting-IP': ip, Authorization: 'Bearer ' + secret, 'content-type': 'application/json' },
		body: JSON.stringify({ password: 'ignored-12345' }),
	}), testEnv, ctx);
	await waitOnExecutionContext(ctx);
	return (await res.json()).code;
}

describe('maintenance endpoint throttle', () => {
	afterAll(async () => {
		for (const ip of ['198.51.100.1', '198.51.100.2']) {
			await env.kv.delete('login_fail_acct:maintenance:' + ip);
			await env.kv.delete('login_fail_ip:' + ip);
		}
	});

	it('locks the offending IP only, not every client', async () => {
		for (let i = 0; i < 10; i++) expect(await resetAdmin('198.51.100.1', 'wrong-' + i)).toBe(401);
		expect(await resetAdmin('198.51.100.1', 'wrong-again')).toBe(429);     // attacker is throttled
		expect(await resetAdmin('198.51.100.1', 'm'.repeat(40))).toBe(429);    // even with the right secret, from that IP
		// a different client still gets through to the real check (wrong secret -> 401, not 429)
		expect(await resetAdmin('198.51.100.2', 'wrong')).toBe(401);
	});
});
