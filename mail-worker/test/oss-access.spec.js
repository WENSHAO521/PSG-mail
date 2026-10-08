// /oss/* is unauthenticated (inline images). In KV storage mode it must never
// read arbitrary KV keys such as sessions or the public API token.
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import worker from '../src';

async function get(path) {
	const ctx = createExecutionContext();
	const res = await worker.fetch(new Request('http://example.com' + path), env, ctx);
	await waitOnExecutionContext(ctx);
	return res;
}

describe('/oss allowlist', () => {
	it('does not expose non-object KV keys', async () => {
		await env.kv.put('auth-uid:1', JSON.stringify({ tokens: ['secret-session'] }));
		await env.kv.put('public_key:', 'public-token-value');
		for (const p of ['/api/oss/auth-uid:1', '/api/oss/public_key:', '/api/oss/auth-uid%3A1', '/api/oss/attachments/../auth-uid:1']) {
			const res = await get(p);
			const text = await res.text();
			expect(res.status).toBe(404);
			expect(text).not.toContain('secret-session');
			expect(text).not.toContain('public-token-value');
		}
	});

	it('still serves attachment and static objects', async () => {
		await env.kv.put('attachments/abc.png', 'png-bytes', { metadata: { contentType: 'image/png' } });
		const res = await get('/api/oss/attachments/abc.png');
		expect(res.status).toBe(200);
		expect(await res.text()).toBe('png-bytes');
	});
});
