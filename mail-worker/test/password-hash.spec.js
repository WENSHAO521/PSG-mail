// Password hashing: PBKDF2 for new hashes, legacy SHA-256 still verifies and is flagged for upgrade.
import { describe, it, expect } from 'vitest';
import cryptoUtils from '../src/utils/crypto-utils';

describe('password hashing', () => {
	it('creates versioned PBKDF2 hashes that verify', async () => {
		const { salt, hash } = await cryptoUtils.hashPassword('correct horse battery staple');
		expect(hash.startsWith('pbkdf2-sha256$100000$')).toBe(true);
		expect(await cryptoUtils.verifyPassword('correct horse battery staple', salt, hash)).toBe(true);
		expect(await cryptoUtils.verifyPassword('wrong password', salt, hash)).toBe(false);
		expect(cryptoUtils.needsRehash(hash)).toBe(false);
	});

	it('still verifies legacy SHA-256 hashes and flags them for rehash', async () => {
		const salt = cryptoUtils.generateSalt();
		const legacy = await cryptoUtils.genHashPassword('oldpass1', salt);
		expect(await cryptoUtils.verifyPassword('oldpass1', salt, legacy)).toBe(true);
		expect(await cryptoUtils.verifyPassword('oldpass2', salt, legacy)).toBe(false);
		expect(cryptoUtils.needsRehash(legacy)).toBe(true);
	});

	it('supports long passphrases and rejects malformed prefixes', async () => {
		const long = 'x'.repeat(120);
		const { salt, hash } = await cryptoUtils.hashPassword(long);
		expect(await cryptoUtils.verifyPassword(long, salt, hash)).toBe(true);
		expect(await cryptoUtils.verifyPassword('a', salt, 'pbkdf2-sha256$999999999$abc')).toBe(false);
	});
});

import { env } from 'cloudflare:test';
import { loginThrottleKeys, assertLoginAllowed, recordLoginFailure } from '../src/service/login-throttle';

describe('login throttle', () => {
	it('blocks an account after 10 recorded failures', async () => {
		const c = { env, req: { header: () => '203.0.113.9' } };
		const keys = await loginThrottleKeys(c, 'Victim@Example.com');
		for (let i = 0; i < 10; i++) {
			const counts = await assertLoginAllowed(c, keys);
			await recordLoginFailure(c, keys, counts);
		}
		await expect(assertLoginAllowed(c, keys)).rejects.toMatchObject({ code: 429 });
		await env.kv.delete(keys.acct);
		await env.kv.delete(keys.ip);
	});
});
