// Credential encryption end to end on the real schema: write path, read path, migration, rotation.
import { env } from 'cloudflare:test';
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { setupFullSchema } from './helpers/full-schema';
import kvCache from '../src/cache/kv-cache';
import settingService from '../src/service/setting-service';
import credentialMigration from '../src/service/credential-migration';
import credentialService from '../src/service/credential-service';
import backupService from '../src/service/backup-service';
import translateService from '../src/service/translate-service';
import userService from '../src/service/user-service';

const K1 = 'key-one-' + 'x'.repeat(40);
const K2 = 'key-two-' + 'y'.repeat(40);

function ctx(extra = {}) {
	const store = new Map();
	return { env: { ...env, ...extra }, get: k => store.get(k), set: (k, v) => store.set(k, v), req: { header: () => '' } };
}
const clearCaches = () => { kvCache.del('setting:'); kvCache.del('feature-setting'); };

async function seedPlaintext() {
	await env.db.prepare(`UPDATE setting SET secret_key = 'turnstile-secret', tg_bot_token = '123456:telegram-token', webhook_secret = 'hook-secret',
		s3_access_key = 'AKIAS3ACCESS', s3_secret_key = 's3-secret-value', resend_tokens = ?`).bind(JSON.stringify({ 'example.com': 're_plain_token_1' })).run();
	await env.db.prepare(`INSERT OR IGNORE INTO psg_feature_setting (id) VALUES (1)`).run();
	await env.db.prepare(`UPDATE psg_feature_setting SET mailjet_api_key = 'mj-key', mailjet_secret_key = 'mj-secret', alibaba_smtp_password = 'smtp-pass', google_translate_key = 'g-key' WHERE id = 1`).run();
	await env.db.prepare(`INSERT OR REPLACE INTO psg_user_pref (user_id, google_translate_key) VALUES (31, 'user-own-key')`).run();
	await env.db.prepare(`DELETE FROM cloud_backup`).run();
	await env.db.prepare(`INSERT INTO cloud_backup (user_id, provider, access_token, refresh_token, expires_at) VALUES (31, 'google', 'access-plain', 'refresh-plain', ?)`).bind(Date.now() + 3600_000).run();
}

const raw = async sql => await env.db.prepare(sql).first();

beforeAll(async () => { await setupFullSchema(); });
beforeEach(() => clearCaches());

describe('credential migration', () => {
	it('without a master key nothing changes and the feature refuses to run', async () => {
		await seedPlaintext();
		await expect(credentialMigration.run(ctx())).rejects.toMatchObject({ code: 400 });
		expect((await raw('SELECT s3_secret_key AS v FROM setting')).v).toBe('s3-secret-value');
		await settingService.refresh(ctx());                              // populate the KV copy from D1
		clearCaches();
		const s = await settingService.query(ctx());
		expect(s.s3SecretKey).toBe('s3-secret-value');
		expect(s.resendTokens['example.com']).toBe('re_plain_token_1');
		expect(credentialMigration.status(env).encryptionEnabled).toBe(false);
	});

	it('dry run counts but writes nothing; migrate encrypts every store; reads stay plaintext', async () => {
		await seedPlaintext();
		const c = ctx({ credential_master_key: K1 });

		const dry = await credentialMigration.run(c, { dryRun: true });
		expect(dry.migrated).toBe(5 + 1 + 4 + 1 + 2);
		expect((await raw('SELECT s3_secret_key AS v FROM setting')).v).toBe('s3-secret-value');

		const done = await credentialMigration.run(c);
		expect(done.byTable).toEqual({ setting: 6, feature: 4, userPref: 1, cloudBackup: 2 });
		for (const sql of [
			'SELECT s3_secret_key AS v FROM setting', 'SELECT tg_bot_token AS v FROM setting', 'SELECT resend_tokens AS v FROM setting',
			'SELECT mailjet_secret_key AS v FROM psg_feature_setting WHERE id = 1', 'SELECT google_translate_key AS v FROM psg_user_pref WHERE user_id = 31',
			'SELECT access_token AS v FROM cloud_backup', 'SELECT refresh_token AS v FROM cloud_backup',
		]) {
			const v = (await raw(sql)).v;
			expect(v, sql).toContain('enc:v1:');
			expect(v, sql).not.toMatch(/plain|secret-value|telegram-token|mj-|g-key|user-own-key/);
		}
		// the KV copy of the settings holds no plaintext credential either
		const kvText = await env.kv.get('setting:');
		expect(kvText).not.toMatch(/s3-secret-value|telegram-token|re_plain_token_1|hook-secret|turnstile-secret|mj-secret|smtp-pass/);

		clearCaches();
		const s = await settingService.query(ctx({ credential_master_key: K1 }));
		expect(s.s3SecretKey).toBe('s3-secret-value');
		expect(s.tgBotToken).toBe('123456:telegram-token');
		expect(s.resendTokens['example.com']).toBe('re_plain_token_1');
		expect(s.mailjetSecretKey).toBe('mj-secret');
		expect(s.googleTranslateKey).toBe('g-key');

		const again = await credentialMigration.run(c);
		expect(again.migrated).toBe(0);                                   // idempotent
	});

	it('user translate key and backup tokens are readable by the services that use them', async () => {
		const c = ctx({ credential_master_key: K1 });
		const t = await translateService.provider(c, 31);
		expect(t.key).toBe('user-own-key');
		const token = await backupService.getValidToken(c, 31, 'google');
		expect(token).toBe('access-plain');
	});

	it('write paths encrypt: admin settings, user translate key, backup tokens', async () => {
		const c = ctx({ credential_master_key: K1 });
		await settingService.set(c, { s3SecretKey: 'brand-new-s3', resendTokens: { 'example.com': 're_new_token' }, googleTranslateKey: 'new-g-key' });
		expect((await raw('SELECT s3_secret_key AS v FROM setting')).v).toContain('enc:v1:');
		expect((await raw('SELECT resend_tokens AS v FROM setting')).v).not.toContain('re_new_token');
		expect((await raw('SELECT google_translate_key AS v FROM psg_feature_setting WHERE id = 1')).v).toContain('enc:v1:');
		clearCaches();
		const s = await settingService.query(ctx({ credential_master_key: K1 }));
		expect(s.s3SecretKey).toBe('brand-new-s3');
		expect(s.resendTokens['example.com']).toBe('re_new_token');

		await userService.updateTranslatePref(c, { provider: 'google', key: 'second-user-key' }, 32);
		expect((await raw('SELECT google_translate_key AS v FROM psg_user_pref WHERE user_id = 32')).v).toContain('enc:v1:');

		await backupService._saveTokens(c, 33, 'google', { accessToken: 'acc-33', refreshToken: 'ref-33', expiresAt: Date.now() + 3600_000 });
		expect((await raw('SELECT access_token AS v FROM cloud_backup WHERE user_id = 33')).v).toContain('enc:v1:');
		expect(await backupService.getValidToken(c, 33, 'google')).toBe('acc-33');
	});

	it('a missing key never leaks ciphertext: credentials read as empty', async () => {
		clearCaches();
		const s = await settingService.query(ctx());                      // encrypted data, no key configured
		expect(s.s3SecretKey).toBe('');
		expect(s.resendTokens['example.com']).toBe('');
		expect(JSON.stringify(s)).not.toContain('enc:v1:');
	});

	it('rotation: previous key still reads, migrate re-encrypts under the new key', async () => {
		const rotated = { credential_master_key: K2, credential_master_key_previous: K1 };
		clearCaches();
		expect((await settingService.query(ctx(rotated))).s3SecretKey).toBe('brand-new-s3');
		const dry = await credentialMigration.run(ctx(rotated), { dryRun: true });
		expect(dry.migrated).toBeGreaterThan(0);
		await credentialMigration.run(ctx(rotated));
		clearCaches();
		const onlyNew = await settingService.query(ctx({ credential_master_key: K2 }));
		expect(onlyNew.s3SecretKey).toBe('brand-new-s3');
		expect(onlyNew.tgBotToken).toBe('123456:telegram-token');
		expect(await credentialService.decrypt({ credential_master_key: K1 }, (await raw('SELECT s3_secret_key AS v FROM setting')).v, 'setting.s3SecretKey')).toBe('');
	});
});
