// Per-device sessions: list, revoke one, sign out everywhere else.
import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import sessionService from '../src/service/session-service';

const c = { env, req: { header: (h) => (h === 'user-agent' ? 'Mozilla/5.0 (Windows NT 10.0) Chrome/120.0' : '198.51.100.7') } };

async function seed(userId, tokens) {
	const authInfo = { tokens: [], user: { userId, email: 'u@example.com' }, sessions: {} };
	for (const t of tokens) {
		authInfo.tokens.push(t);
		sessionService.remember(c, authInfo, t);
	}
	await env.kv.put('auth-uid:' + userId, JSON.stringify(authInfo));
}

describe('sessionService', () => {
	it('lists sessions without exposing tokens and flags the current one', async () => {
		await seed(41, ['tok-a', 'tok-b']);
		const list = await sessionService.list(c, 41, 'tok-b');
		expect(list).toHaveLength(2);
		expect(JSON.stringify(list)).not.toContain('tok-');
		expect(list.filter(s => s.current)).toHaveLength(1);
		expect(list[0].ip).toBe('198.51.100.7');
	});

	it('revokes one session by id and rejects unknown ids', async () => {
		await seed(42, ['t1', 't2', 't3']);
		const [first] = await sessionService.list(c, 42, 't3');
		expect(await sessionService.revoke(c, 42, first.id)).toBe(true);
		expect(await sessionService.revoke(c, 42, first.id)).toBe(false);
		const stored = await env.kv.get('auth-uid:42', { type: 'json' });
		expect(stored.tokens).toEqual(['t2', 't3']);
		expect(Object.keys(stored.sessions)).toEqual(['t2', 't3']);
	});

	it('cannot touch another user\'s sessions', async () => {
		await seed(43, ['x1']);
		await seed(44, ['y1']);
		const [mine] = await sessionService.list(c, 43, 'x1');
		expect(await sessionService.revoke(c, 44, mine.id)).toBe(false);
		expect((await env.kv.get('auth-uid:44', { type: 'json' })).tokens).toEqual(['y1']);
	});

	it('revokeOthers keeps only the current token', async () => {
		await seed(45, ['a', 'b', 'c']);
		expect(await sessionService.revokeOthers(c, 45, 'b')).toBe(2);
		expect((await env.kv.get('auth-uid:45', { type: 'json' })).tokens).toEqual(['b']);
		expect(await sessionService.revokeOthers(c, 45, null)).toBe(1);
		expect((await env.kv.get('auth-uid:45', { type: 'json' })).tokens).toEqual([]);
	});
});
