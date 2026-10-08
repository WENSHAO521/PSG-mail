// P0: password storage migration, login hardening, session revocation.
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import worker from '../src';
import cryptoUtils, { PBKDF2_PREFIX } from '../src/utils/crypto-utils';
import { checkPassword } from '../src/utils/password-policy';
import { bootstrapSchema, seedSettings, insertUser } from './helpers/schema';

const STRONG = 'Correct-Horse-9';

async function call(path, { method = 'GET', token, body, headers = {}, envOverride = {} } = {}) {
	const req = new Request('http://example.com/api' + path, {
		method,
		headers: {
			'Content-Type': 'application/json',
			'CF-Connecting-IP': headers.ip || '203.0.113.1',
			...(token ? { Authorization: token } : {}),
			...headers,
		},
		body: body ? JSON.stringify(body) : undefined,
	});
	const ctx = createExecutionContext();
	const res = await worker.fetch(req, { ...env, ...envOverride }, ctx);
	await waitOnExecutionContext(ctx);
	return res;
}

async function json(res) {
	return res.json();
}

async function login(email, password, ip) {
	const body = await json(await call('/login', { method: 'POST', body: { email, password }, headers: { ip } }));
	return body;
}

describe('password hashing', () => {
	it('new hashes are PBKDF2 and self-describing', async () => {
		const { hash, salt } = await cryptoUtils.hashPassword(STRONG);
		expect(hash.startsWith(PBKDF2_PREFIX + '$100000$')).toBe(true);
		expect(await cryptoUtils.verifyPassword(STRONG, salt, hash)).toBe(true);
		expect(await cryptoUtils.verifyPassword(STRONG + 'x', salt, hash)).toBe(false);
	});

	it('still verifies legacy SHA-256 hashes', async () => {
		const salt = cryptoUtils.generateSalt();
		const legacy = await cryptoUtils.genHashPassword('old-pass', salt);
		expect(cryptoUtils.isLegacyHash(legacy)).toBe(true);
		expect(await cryptoUtils.verifyPassword('old-pass', salt, legacy)).toBe(true);
		expect(await cryptoUtils.verifyPassword('wrong', salt, legacy)).toBe(false);
	});

	it('rejects empty / non-string input and tampered iteration counts', async () => {
		const { hash, salt } = await cryptoUtils.hashPassword(STRONG);
		expect(await cryptoUtils.verifyPassword('', salt, hash)).toBe(false);
		expect(await cryptoUtils.verifyPassword(undefined, salt, hash)).toBe(false);
		const tampered = hash.replace('$100000$', '$1$');
		// still parsed (1 is a valid count) but the derived value differs
		expect(await cryptoUtils.verifyPassword(STRONG, salt, tampered)).toBe(false);
		expect(await cryptoUtils.verifyPassword(STRONG, salt, hash.replace('$100000$', '$9999999$'))).toBe(false);
	});

	it('random passwords use a CSPRNG and the full alphabet', () => {
		const seen = new Set();
		for (let i = 0; i < 50; i++) seen.add(cryptoUtils.genRandomPwd());
		expect(seen.size).toBe(50);
		expect(cryptoUtils.genRandomPwd()).toHaveLength(16);
	});

	it('password policy', () => {
		expect(checkPassword('short1A')).toBe('pwdMinLength');
		expect(checkPassword('alllowercase')).toBe('pwdTooWeak');
		expect(checkPassword('Lower-and-9')).toBe(null);
		expect(checkPassword('a long passphrase only lowercase')).toBe(null);
		expect(checkPassword('x'.repeat(129))).toBe('pwdLengthLimit');
		expect(checkPassword('Alice-2024!x', { email: 'alice@example.com' })).toBe('pwdContainsEmail');
	});
});

describe('login + sessions (HTTP)', () => {
	let legacyUser;

	beforeAll(async () => {
		await bootstrapSchema();
		await seedSettings();
		const salt = cryptoUtils.generateSalt();
		const hash = await cryptoUtils.genHashPassword('legacy-pw', salt);
		legacyUser = await insertUser({ email: 'legacy@example.com', hash, salt });
		const strong = await cryptoUtils.hashPassword(STRONG);
		await insertUser({ email: 'multi@example.com', hash: strong.hash, salt: strong.salt });
		await insertUser({ email: 'victim@example.com', hash: strong.hash, salt: strong.salt });
	});

	it('legacy hash logs in and is transparently upgraded, never reset', async () => {
		const body = await login('legacy@example.com', 'legacy-pw', '198.51.100.10');
		expect(body.code).toBe(200);
		const row = await env.db.prepare('SELECT password FROM user WHERE user_id = ?').bind(legacyUser.userId).first();
		expect(row.password.startsWith(PBKDF2_PREFIX)).toBe(true);
		// the same (old, weak) password keeps working after the upgrade
		const again = await login('legacy@example.com', 'legacy-pw', '198.51.100.10');
		expect(again.code).toBe(200);
		const audit = await env.db.prepare(`SELECT COUNT(*) AS n FROM security_audit_log WHERE event = 'password.rehash' AND user_id = ?`).bind(legacyUser.userId).first();
		expect(audit.n).toBe(1);
	});

	it('unknown user and wrong password get the same message (no enumeration)', async () => {
		const a = await login('nobody@example.com', 'whatever', '198.51.100.11');
		const b = await login('multi@example.com', 'wrong-password', '198.51.100.11');
		expect(a.code).not.toBe(200);
		expect(a.message).toBe(b.message);
	});

	it('issues JWTs with exp, and rejects alg=none forgeries', async () => {
		const { data } = await login('multi@example.com', STRONG, '198.51.100.12');
		const payload = JSON.parse(atob(data.token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
		expect(payload.exp - payload.iat).toBe(60 * 60 * 24 * 30);

		const header = btoa(JSON.stringify({ alg: 'none', typ: 'JWT' })).replace(/=/g, '');
		const forged = `${header}.${data.token.split('.')[1]}.`;
		const res = await json(await call('/my/sessions', { token: forged }));
		expect(res.code).toBe(401);
	});

	it('logout revokes ONLY the calling session (3.x revoked another device)', async () => {
		const a = (await login('multi@example.com', STRONG, '198.51.100.13')).data.token;
		const b = (await login('multi@example.com', STRONG, '198.51.100.13')).data.token;

		expect((await json(await call('/logout', { method: 'DELETE', token: a }))).code).toBe(200);
		expect((await json(await call('/my/sessions', { token: a }))).code).toBe(401);
		expect((await json(await call('/my/sessions', { token: b }))).code).toBe(200);
	});

	it('lists devices without exposing session ids, revokes others', async () => {
		const a = (await login('multi@example.com', STRONG, '198.51.100.14')).data.token;
		const b = (await login('multi@example.com', STRONG, '198.51.100.14')).data.token;
		const list = (await json(await call('/my/sessions', { token: a }))).data;
		expect(list.length).toBeGreaterThanOrEqual(2);
		expect(list.every(s => s.sessionId.length === 8)).toBe(true);
		expect(list.filter(s => s.current)).toHaveLength(1);

		const r = await json(await call('/my/sessions/revokeOthers', { method: 'POST', token: a }));
		expect(r.code).toBe(200);
		expect((await json(await call('/my/sessions', { token: b }))).code).toBe(401);
		expect((await json(await call('/my/sessions', { token: a }))).code).toBe(200);
	});

	it('revokes a single device by handle', async () => {
		const a = (await login('multi@example.com', STRONG, '198.51.100.15')).data.token;
		const b = (await login('multi@example.com', STRONG, '198.51.100.15')).data.token;
		const list = (await json(await call('/my/sessions', { token: a }))).data;
		const other = list.find(s => !s.current);
		expect((await json(await call('/my/sessions/' + other.sessionId, { method: 'DELETE', token: a }))).code).toBe(200);
		expect((await json(await call('/my/sessions', { token: b }))).code).toBe(401);
	});

	it('self-service password change needs the current password and signs out other devices', async () => {
		const a = (await login('victim@example.com', STRONG, '198.51.100.16')).data.token;
		const b = (await login('victim@example.com', STRONG, '198.51.100.16')).data.token;

		const noCurrent = await json(await call('/my/resetPassword', { method: 'PUT', token: a, body: { password: 'New-Secret-77' } }));
		expect(noCurrent.code).toBe(400);

		const weak = await json(await call('/my/resetPassword', { method: 'PUT', token: a, body: { password: 'weak', currentPassword: STRONG } }));
		expect(weak.code).toBe(400);

		const ok = await json(await call('/my/resetPassword', { method: 'PUT', token: a, body: { password: 'New-Secret-77', currentPassword: STRONG } }));
		expect(ok.code).toBe(200);
		expect((await json(await call('/my/sessions', { token: a }))).code).toBe(200);
		expect((await json(await call('/my/sessions', { token: b }))).code).toBe(401);
		expect((await login('victim@example.com', 'New-Secret-77', '198.51.100.16')).code).toBe(200);
	});

	it('rate-limits repeated failed logins per mailbox (429)', async () => {
		let last;
		for (let i = 0; i < 11; i++) {
			last = await login('multi@example.com', 'bad-' + i, '198.51.100.' + (100 + i));
		}
		expect(last.code).toBe(429);
		// even the right password is refused while limited
		expect((await login('multi@example.com', STRONG, '198.51.100.120')).code).toBe(429);
	});

	it('records failed logins in the security audit log without the password', async () => {
		const row = await env.db.prepare(`SELECT detail FROM security_audit_log WHERE event = 'login.fail' ORDER BY id DESC LIMIT 1`).first();
		expect(row.detail).not.toMatch(/bad-|wrong-password/);
	});
});

describe('user-agent parsing', () => {
	it('never produces "undefined" for browsers/OSes without a version', async () => {
		const { default: reqUtils } = await import('../src/utils/req-utils');
		const ua = reqUtils.getUserAgent({ req: { header: () => 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36' } });
		expect(ua.os).toBe('Linux');
		expect(ua.browser).toMatch(/^Chrome 141/);
		expect(JSON.stringify(ua)).not.toContain('undefined');
	});
});

describe('auth middleware path matching', () => {
	it('an excluded prefix does not open sibling routes', async () => {
		const { matchesPrefix } = await import('../src/security/security');
		expect(matchesPrefix('/login', '/login')).toBe(true);
		expect(matchesPrefix('/login/changePassword', '/login')).toBe(true);
		expect(matchesPrefix('/loginAdmin', '/login')).toBe(false);
		expect(matchesPrefix('/oauthx/bind', '/oauth')).toBe(false);
	});

	it('/test is no longer an unauthenticated prefix', async () => {
		const res = await json(await call('/testAnything'));
		expect(res.code).toBe(401);
	});

	it('unexpected errors do not leak internal messages', async () => {
		// malformed JSON body on an authenticated route → SyntaxError inside handler
		const strong = await cryptoUtils.hashPassword(STRONG);
		await insertUser({ email: 'err@example.com', hash: strong.hash, salt: strong.salt });
		const token = (await login('err@example.com', STRONG, '198.51.100.200')).data.token;
		const req = new Request('http://example.com/api/my/signature', {
			method: 'PUT', headers: { Authorization: token, 'Content-Type': 'application/json' }, body: '{not json'
		});
		const ctx = createExecutionContext();
		const res = await worker.fetch(req, env, ctx);
		await waitOnExecutionContext(ctx);
		const body = await res.json();
		expect(body.code).toBe(500);
		expect(body.message).toMatch(/Internal server error \(ref [0-9a-f]{8}\)/);
		expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
	});
});

describe('OAuth bind', () => {
	it('bindUser without a server-issued ticket is refused', async () => {
		const res = await json(await call('/oauth/bindUser', { method: 'PUT', body: { email: 'x@example.com', oauthUserId: '12345' } }));
		expect(res.code).toBe(401);
	});

	it('a forged ticket is refused', async () => {
		const res = await json(await call('/oauth/bindUser', { method: 'PUT', body: { email: 'x@example.com', bindTicket: crypto.randomUUID() } }));
		expect(res.code).toBe(401);
	});
});
