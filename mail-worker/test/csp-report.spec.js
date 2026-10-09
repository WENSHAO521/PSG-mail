import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import worker from '../src';
import { setupFullSchema } from './helpers/full-schema';
import { flushMetrics, readMetrics, _resetForTests } from '../src/service/ops-metrics';

async function post(body, headers = {}) {
	const ctx = createExecutionContext();
	const res = await worker.fetch(new Request('http://example.com/api/csp-report', { method: 'POST', body, headers }), env, ctx);
	await waitOnExecutionContext(ctx);
	return res;
}

beforeAll(async () => { await setupFullSchema(); });
beforeEach(async () => { _resetForTests(); await env.db.prepare('DELETE FROM ops_metric').run(); });

describe('/csp-report', () => {
	it('counts violations per directive and stores nothing else', async () => {
		const legacy = JSON.stringify({ 'csp-report': { 'document-uri': 'https://mail.example/?token=SECRET', 'violated-directive': 'script-src-elem', 'blocked-uri': 'https://evil.example/x.js?k=SECRET' } });
		expect((await post(legacy, { 'content-type': 'application/csp-report' })).status).toBe(204);
		const modern = JSON.stringify([{ type: 'csp-violation', body: { effectiveDirective: 'img-src', blockedURL: 'https://tracker.example/p.gif' } },
			{ type: 'csp-violation', body: { effectiveDirective: 'made-up-directive' } }]);
		expect((await post(modern, { 'content-type': 'application/reports+json' })).status).toBe(204);
		await flushMetrics(env);
		const rows = Object.fromEntries((await readMetrics(env, 1)).map(r => [r.metric, r.count]));
		expect(rows['csp.violation.script-src']).toBe(1);
		expect(rows['csp.violation.img-src']).toBe(1);
		expect(rows['csp.violation.other']).toBe(1);
		const dump = JSON.stringify(await env.db.prepare('SELECT * FROM ops_metric').all());
		expect(dump).not.toMatch(/SECRET|evil|tracker/);
	});

	it('ignores malformed and oversized bodies without error', async () => {
		expect((await post('not json')).status).toBe(204);
		expect((await post('x'.repeat(50000), { 'content-length': '50000' })).status).toBe(204);
		await flushMetrics(env);
		expect(await readMetrics(env, 1)).toEqual([]);
	});

	it('never buffers an unbounded body that has no Content-Length', async () => {
		let pulled = 0;
		const chunk = new Uint8Array(4096).fill(120);
		const stream = new ReadableStream({
			pull(controller) {
				pulled += chunk.byteLength;
				if (pulled > 50_000_000) controller.close();     // safety stop for the test itself
				else controller.enqueue(chunk);
			},
		});
		const ctx = createExecutionContext();
		const res = await worker.fetch(new Request('http://example.com/api/csp-report', { method: 'POST', body: stream, duplex: 'half' }), env, ctx);
		await waitOnExecutionContext(ctx);
		expect(res.status).toBe(204);
		expect(pulled).toBeLessThan(200_000);                    // stopped shortly after the 8 KiB cap, not at 50 MB
	});
});
