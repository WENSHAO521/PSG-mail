// Generic error handling + response headers.
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import worker from '../src';

async function call(path, init, testEnv = env) {
	const ctx = createExecutionContext();
	const res = await worker.fetch(new Request('http://example.com' + path, init), testEnv, ctx);
	await waitOnExecutionContext(ctx);
	return res;
}

describe('API hardening', () => {
	it('adds nosniff / no-store to API JSON', async () => {
		const res = await call('/api/setting/websiteConfig');
		expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
		expect(res.headers.get('Cache-Control')).toBe('no-store');
	});

	it('keeps cacheable object headers on /oss and still sandboxes', async () => {
		await env.kv.put('attachments/h.png', 'x', { metadata: { contentType: 'image/png', cacheControl: 'public, max-age=60' } });
		const res = await call('/api/oss/attachments/h.png');
		expect(res.status).toBe(200);
		expect(res.headers.get('Cache-Control')).toBe('public, max-age=60');
		expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
	});

	it('does not leak internals for unexpected errors', async () => {
		const brokenKv = { get: async () => { throw new Error('D1_ERROR: SELECT secret FROM hidden_table'); } };
		const res = await call('/api/login', { method: 'POST', body: '{"email":"a@b.c","password":"x"}', headers: { 'content-type': 'application/json' } },
			{ ...env, kv: brokenKv });
		const body = await res.json();
		expect(body.code).toBe(500);
		expect(body.message).toBe('Internal server error');
	});

	it('answers malformed JSON with a generic 400 body', async () => {
		const res = await call('/api/login', { method: 'POST', body: '{oops' });
		const body = await res.json();
		expect(body.code).toBe(400);
		expect(body.message).toBe('Invalid request body');
	});

	it('pins CORS origin when cors_origins is configured', async () => {
		const e = { ...env, cors_origins: 'https://mail.example.com' };
		const ok = await call('/api/setting/websiteConfig', { headers: { Origin: 'https://mail.example.com' } }, e);
		const bad = await call('/api/setting/websiteConfig', { headers: { Origin: 'https://evil.example' } }, e);
		expect(ok.headers.get('Access-Control-Allow-Origin')).toBe('https://mail.example.com');
		expect(bad.headers.get('Access-Control-Allow-Origin')).toBeNull();
		const open = await call('/api/setting/websiteConfig', { headers: { Origin: 'https://anything.example' } });
		expect(open.headers.get('Access-Control-Allow-Origin')).toBe('*');
	});
});
