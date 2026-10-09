import { describe, it, expect } from 'vitest';
import credentialService from '../src/service/credential-service';

const K1 = 'k1-' + 'a'.repeat(40);
const K2 = 'k2-' + 'b'.repeat(40);

describe('credentialService', () => {
	it('is a no-op without a master key (existing installs keep working)', async () => {
		expect(credentialService.enabled({})).toBe(false);
		expect(await credentialService.encrypt({}, 'secret', 'x')).toBe('secret');
		expect(await credentialService.decrypt({}, 'secret', 'x')).toBe('secret');
		expect(await credentialService.encrypt({ credential_master_key: 'short' }, 'secret', 'x')).toBe('secret');
	});

	it('round-trips and never stores plaintext', async () => {
		const env = { credential_master_key: K1 };
		const stored = await credentialService.encrypt(env, 're_ABCdef123_secretvalue', 'setting.resendToken');
		expect(stored.startsWith('enc:v1:')).toBe(true);
		expect(stored).not.toContain('secretvalue');
		expect(await credentialService.decrypt(env, stored, 'setting.resendToken')).toBe('re_ABCdef123_secretvalue');
		// random IV: same input, different ciphertext
		expect(await credentialService.encrypt(env, 'same', 'c')).not.toBe(await credentialService.encrypt(env, 'same', 'c'));
	});

	it('leaves empty and already-encrypted values alone, and reads legacy plaintext', async () => {
		const env = { credential_master_key: K1 };
		expect(await credentialService.encrypt(env, '', 'c')).toBe('');
		const once = await credentialService.encrypt(env, 'v', 'c');
		expect(await credentialService.encrypt(env, once, 'c')).toBe(once);
		expect(await credentialService.decrypt(env, 'plain-old-value', 'c')).toBe('plain-old-value');
	});

	it('binds a ciphertext to its field: moving it elsewhere does not decrypt', async () => {
		const env = { credential_master_key: K1 };
		const stored = await credentialService.encrypt(env, 'token', 'setting.s3SecretKey');
		expect(await credentialService.decrypt(env, stored, 'setting.tgBotToken')).toBe('');
	});

	it('returns an empty string, not the ciphertext, when the key is missing, wrong or the data is tampered with', async () => {
		const stored = await credentialService.encrypt({ credential_master_key: K1 }, 'token', 'c');
		expect(await credentialService.decrypt({}, stored, 'c')).toBe('');
		expect(await credentialService.decrypt({ credential_master_key: K2 }, stored, 'c')).toBe('');
		const tampered = stored.slice(0, -3) + (stored.endsWith('AAA') ? 'BBB' : 'AAA');
		expect(await credentialService.decrypt({ credential_master_key: K1 }, tampered, 'c')).toBe('');
		expect(await credentialService.decrypt({ credential_master_key: K1 }, 'enc:v1:broken', 'c')).toBe('');
	});

	it('supports rotation through the previous key', async () => {
		const oldStored = await credentialService.encrypt({ credential_master_key: K1 }, 'token', 'c');
		const rotated = { credential_master_key: K2, credential_master_key_previous: K1 };
		expect(await credentialService.decrypt(rotated, oldStored, 'c')).toBe('token');
		expect(await credentialService.needsMigration(rotated, oldStored, 'c')).toBe(true);
		const fresh = await credentialService.encrypt(rotated, 'token', 'c');
		expect(await credentialService.needsMigration(rotated, fresh, 'c')).toBe(false);
		expect(await credentialService.decrypt({ credential_master_key: K2 }, fresh, 'c')).toBe('token');
		expect(await credentialService.needsMigration(rotated, 'plain', 'c')).toBe(true);
		expect(await credentialService.needsMigration(rotated, '', 'c')).toBe(false);
	});
});
