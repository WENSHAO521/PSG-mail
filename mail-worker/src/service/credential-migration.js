import BizError from '../error/biz-error';
import credentialService from './credential-service';
import settingService from './setting-service';

// Encrypts credentials that are still stored in plaintext (or under the previous master key) with
// the current `credential_master_key`. Idempotent: values already in the current form are skipped.
// `dryRun` only counts. Never deletes data and never logs a value.
const SETTING_COLUMNS = {
	secretKey: 'secret_key', tgBotToken: 'tg_bot_token', webhookSecret: 'webhook_secret',
	s3AccessKey: 's3_access_key', s3SecretKey: 's3_secret_key',
};
const FEATURE_COLUMNS = {
	mailjetApiKey: 'mailjet_api_key', mailjetSecretKey: 'mailjet_secret_key',
	alibabaSmtpPassword: 'alibaba_smtp_password', googleTranslateKey: 'google_translate_key',
};

async function rewrite(env, stored, context, counters) {
	if (!(await credentialService.needsMigration(env, stored, context))) return stored;
	const plain = await credentialService.decrypt(env, stored, context);
	if (!plain) { counters.failed++; return stored; }     // unreadable: leave untouched
	counters.migrated++;
	return await credentialService.encrypt(env, plain, context);
}

const credentialMigration = {

	async run(c, { dryRun = false } = {}) {
		const env = c.env;
		if (!credentialService.enabled(env)) {
			throw new BizError('credential_master_key is not configured (needs a Worker secret of at least 32 characters)', 400);
		}
		const counters = { migrated: 0, failed: 0 };
		const byTable = {};
		const track = async (name, fn) => {
			const before = counters.migrated;
			try { await fn(); } catch (e) { if (!/no such table|no such column/i.test(e?.message || '')) throw e; }
			byTable[name] = counters.migrated - before;
		};

		await track('setting', async () => {
			const row = await env.db.prepare(
				`SELECT ${Object.values(SETTING_COLUMNS).join(', ')}, resend_tokens FROM setting LIMIT 1`).first();
			if (!row) return;
			const updates = {};
			for (const [field, col] of Object.entries(SETTING_COLUMNS)) {
				const next = await rewrite(env, row[col] || '', 'setting.' + field, counters);
				if (next !== (row[col] || '')) updates[col] = next;
			}
			let tokens = {};
			try { tokens = JSON.parse(row.resend_tokens || '{}'); } catch {}
			let tokensChanged = false;
			for (const domain of Object.keys(tokens)) {
				const next = await rewrite(env, tokens[domain], 'setting.resendToken', counters);
				if (next !== tokens[domain]) { tokens[domain] = next; tokensChanged = true; }
			}
			if (tokensChanged) updates.resend_tokens = JSON.stringify(tokens);
			if (!dryRun && Object.keys(updates).length) {
				const cols = Object.keys(updates);
				await env.db.prepare(`UPDATE setting SET ${cols.map(k => k + ' = ?').join(', ')}`).bind(...cols.map(k => updates[k])).run();
			}
		});

		await track('feature', async () => {
			const row = await env.db.prepare(
				`SELECT ${Object.values(FEATURE_COLUMNS).join(', ')} FROM psg_feature_setting WHERE id = 1`).first();
			if (!row) return;
			const updates = {};
			for (const [field, col] of Object.entries(FEATURE_COLUMNS)) {
				const next = await rewrite(env, row[col] || '', 'feature.' + field, counters);
				if (next !== (row[col] || '')) updates[col] = next;
			}
			if (!dryRun && Object.keys(updates).length) {
				const cols = Object.keys(updates);
				await env.db.prepare(`UPDATE psg_feature_setting SET ${cols.map(k => k + ' = ?').join(', ')} WHERE id = 1`)
					.bind(...cols.map(k => updates[k])).run();
			}
		});

		await track('userPref', async () => {
			const { results } = await env.db.prepare(
				`SELECT user_id, google_translate_key FROM psg_user_pref WHERE google_translate_key IS NOT NULL AND google_translate_key != ''`).all();
			const stmts = [];
			for (const row of results) {
				const next = await rewrite(env, row.google_translate_key, 'userpref.google_translate_key', counters);
				if (next !== row.google_translate_key) {
					stmts.push(env.db.prepare('UPDATE psg_user_pref SET google_translate_key = ? WHERE user_id = ?').bind(next, row.user_id));
				}
			}
			if (!dryRun) for (let i = 0; i < stmts.length; i += 50) await env.db.batch(stmts.slice(i, i + 50));
		});

		await track('cloudBackup', async () => {
			const { results } = await env.db.prepare('SELECT id, access_token, refresh_token FROM cloud_backup').all();
			const stmts = [];
			for (const row of results) {
				const access = await rewrite(env, row.access_token, 'backup.accessToken', counters);
				const refresh = await rewrite(env, row.refresh_token, 'backup.refreshToken', counters);
				if (access !== row.access_token || refresh !== row.refresh_token) {
					stmts.push(env.db.prepare('UPDATE cloud_backup SET access_token = ?, refresh_token = ? WHERE id = ?').bind(access, refresh, row.id));
				}
			}
			if (!dryRun) for (let i = 0; i < stmts.length; i += 50) await env.db.batch(stmts.slice(i, i + 50));
		});

		if (!dryRun && counters.migrated > 0) await settingService.refresh(c);

		return { dryRun, migrated: counters.migrated, unreadable: counters.failed, byTable };
	},

	status(env) {
		return {
			encryptionEnabled: credentialService.enabled(env),
			previousKeyConfigured: typeof env.credential_master_key_previous === 'string' && env.credential_master_key_previous.length >= 32,
		};
	},
};

export default credentialMigration;
