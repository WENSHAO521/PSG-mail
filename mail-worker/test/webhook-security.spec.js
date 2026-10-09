// Resend webhook: fail closed without a secret, verify signature, dedupe replays, no error leakage.
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import worker from '../src';

const SECRET_RAW = btoa('0123456789abcdef0123456789abcdef');
const SECRET = 'whsec_' + SECRET_RAW;

async function sign(id, ts, body) {
	const key = await crypto.subtle.importKey('raw', Uint8Array.from(atob(SECRET_RAW), c => c.charCodeAt(0)),
		{ name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
	const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${ts}.${body}`));
	return 'v1,' + btoa(String.fromCharCode(...new Uint8Array(sig)));
}

async function post(testEnv, body, headers = {}) {
	const ctx = createExecutionContext();
	const res = await worker.fetch(new Request('http://example.com/api/webhooks', { method: 'POST', body, headers }), testEnv, ctx);
	await waitOnExecutionContext(ctx);
	return res;
}

const body = JSON.stringify({ type: 'email.delivered', data: { email_id: 'does-not-exist' } });

describe('resend webhook', () => {
	it('rejects unsigned requests when no secret is configured', async () => {
		const res = await post(env, body);
		expect(res.status).toBe(401);
	});

	it('rejects a bad signature and a stale timestamp', async () => {
		const e = { ...env, resend_webhook_secret: SECRET };
		const ts = String(Math.floor(Date.now() / 1000));
		expect((await post(e, body, { 'svix-id': 'm1', 'svix-timestamp': ts, 'svix-signature': 'v1,AAAA' })).status).toBe(401);
		const old = String(Math.floor(Date.now() / 1000) - 3600);
		expect((await post(e, body, { 'svix-id': 'm1', 'svix-timestamp': old, 'svix-signature': await sign('m1', old, body) })).status).toBe(401);
	});

	it('does not leak internal error text', async () => {
		const e = { ...env, resend_webhook_secret: SECRET };
		const ts = String(Math.floor(Date.now() / 1000));
		const bad = '{not json';
		const res = await post(e, bad, { 'svix-id': 'm2', 'svix-timestamp': ts, 'svix-signature': await sign('m2', ts, bad) });
		expect(res.status).toBe(500);
		expect(await res.text()).toBe('webhook processing failed');
	});
});
