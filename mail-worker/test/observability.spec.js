import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, vi, afterEach } from 'vitest';
import worker from '../src';
import { createLogger } from '../src/shared/logger';
import { resolveTraceId, newTraceId } from '../src/shared/trace';

async function call(path, headers = {}) {
	const ctx = createExecutionContext();
	const res = await worker.fetch(new Request(`http://example.com${path}`, { headers }), env, ctx);
	await waitOnExecutionContext(ctx);
	return res;
}

afterEach(() => vi.restoreAllMocks());

describe('trace ids', () => {
	it('generates a 32-char id and honours only well-formed inbound ids', () => {
		expect(newTraceId()).toMatch(/^[0-9a-f]{32}$/);
		expect(resolveTraceId('abcd1234-ef56')).toBe('abcd1234-ef56');
		for (const bad of ['short', 'has space in it!', 'x'.repeat(65), 'a\nb\nc\nd\ne\nf\ng', '', null, undefined]) {
			expect(resolveTraceId(bad)).toMatch(/^[0-9a-f]{32}$/);
		}
	});
});

describe('http tracing', () => {
	it('echoes an inbound trace id and puts it in the error body', async () => {
		const res = await call('/api/email/latest?emailId=0&accountId=1&allReceive=0', { 'X-Trace-Id': 'trace-abc-12345' });
		expect(res.headers.get('X-Trace-Id')).toBe('trace-abc-12345');
		expect((await res.json()).traceId).toBe('trace-abc-12345');
	});

	it('assigns a trace id when none is sent, and logs one JSON line without the query string', async () => {
		const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
		const res = await call('/api/email/latest?emailId=0&token=secret');
		const traceId = res.headers.get('X-Trace-Id');
		expect(traceId).toMatch(/^[0-9a-f]{32}$/);
		const line = spy.mock.calls.map((c) => c[0]).find((l) => l.includes('"event":"request"'));
		const entry = JSON.parse(line);
		expect(entry).toMatchObject({ module: 'http', level: 'info', traceId, method: 'GET', path: '/email/latest' });
		expect(line).not.toContain('secret');
	});
});

describe('logger', () => {
	it('emits JSON, merges child fields, and reserved keys cannot be overwritten', () => {
		const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		createLogger('mod', { a: 1 }).child({ b: 2 }).warn('evt', { c: 3, level: 'spoofed', module: 'spoofed' });
		expect(JSON.parse(spy.mock.calls[0][0])).toMatchObject({ a: 1, b: 2, c: 3, level: 'warn', module: 'mod', event: 'evt' });
	});
});
