// P0: attachment authorization, webhook verification, SQL injection, secrets.
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import worker from '../src';
import cryptoUtils from '../src/utils/crypto-utils';
import attachmentAccess from '../src/security/attachment-access';
import attService, { siteObjectKey } from '../src/service/att-service';
import secretBox from '../src/utils/secret-box';
import settingService from '../src/service/setting-service';
import { shouldApply } from '../src/service/resend-service';
import { emailConst } from '../src/const/entity-const';
import { bootstrapSchema, seedSettings, insertUser, makeCtx } from './helpers/schema';

const PW = 'Correct-Horse-9';
const KEY_A = 'attachments/' + 'a'.repeat(64) + '.pdf';
const KEY_HTML = 'attachments/' + 'b'.repeat(64) + '.html';
const KEY_SHARED = 'attachments/' + 'c'.repeat(64) + '.png';

async function call(path, { method = 'GET', token, body, headers = {}, envOverride = {}, raw } = {}) {
	const url = path.startsWith('http') ? path : 'http://example.com/api' + path;
	const req = new Request(url, {
		method,
		headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.1', ...(token ? { Authorization: token } : {}), ...headers },
		body: raw ?? (body ? JSON.stringify(body) : undefined),
	});
	const ctx = createExecutionContext();
	const res = await worker.fetch(req, { ...env, ...envOverride }, ctx);
	await waitOnExecutionContext(ctx);
	return res;
}

async function login(email) {
	const res = await call('/login', { method: 'POST', body: { email, password: PW } });
	return (await res.json()).data.token;
}

let alice, bob, carol, tokenAlice, tokenBob, tokenCarol;

beforeAll(async () => {
	await bootstrapSchema();
	await seedSettings();
	const { hash, salt } = await cryptoUtils.hashPassword(PW);
	alice = await insertUser({ email: 'alice@example.com', hash, salt });
	bob = await insertUser({ email: 'bob@example.com', hash, salt });
	carol = await insertUser({ email: 'carol@example.com', hash, salt });

	// alice's private mail with a PDF and an HTML attachment
	const e1 = await env.db.prepare(`INSERT INTO email (account_id, user_id, subject, content) VALUES (?, ?, 'private', '<p>x</p>') RETURNING email_id`).bind(alice.accountId, alice.userId).first();
	await env.db.prepare(`INSERT INTO attachments (user_id, email_id, account_id, key, filename, mime_type, size) VALUES (?, ?, ?, ?, 'a.pdf', 'application/pdf', 4)`).bind(alice.userId, e1.email_id, alice.accountId, KEY_A).run();
	await env.db.prepare(`INSERT INTO attachments (user_id, email_id, account_id, key, filename, mime_type, size) VALUES (?, ?, ?, ?, 'x.html', 'text/html', 30)`).bind(alice.userId, e1.email_id, alice.accountId, KEY_HTML).run();

	// alice's mailbox is shared with carol; this mail has an inline image
	const e2 = await env.db.prepare(`INSERT INTO email (account_id, user_id, subject, content) VALUES (?, ?, 'shared', ?) RETURNING email_id`).bind(alice.accountId, alice.userId, `<img src="{{domain}}${KEY_SHARED}">`).first();
	await env.db.prepare(`INSERT INTO attachments (user_id, email_id, account_id, key, filename, mime_type, size, content_id) VALUES (?, ?, ?, ?, 'i.png', 'image/png', 3, 'cid1')`).bind(alice.userId, e2.email_id, alice.accountId, KEY_SHARED).run();
	await env.db.prepare(`INSERT INTO account_share (account_id, user_id) VALUES (?, ?)`).bind(alice.accountId, carol.userId).run();

	await env.kv.put(KEY_A, new Uint8Array([1, 2, 3, 4]), { metadata: { contentType: 'application/pdf' } });
	await env.kv.put(KEY_HTML, '<script>alert(1)</script>', { metadata: { contentType: 'text/html', contentDisposition: 'inline;filename=x.html' } });
	await env.kv.put(KEY_SHARED, new Uint8Array([9, 9, 9]), { metadata: { contentType: 'image/png' } });

	tokenAlice = await login('alice@example.com');
	tokenBob = await login('bob@example.com');
	tokenCarol = await login('carol@example.com');
});

describe('attachment access (enforce mode)', () => {
	const enforce = { ATTACHMENT_ACCESS_MODE: 'enforce' };

	it('anonymous unsigned request is refused', async () => {
		const res = await call('/oss/' + KEY_A, { envOverride: enforce });
		expect(res.status).toBe(403);
	});

	it('legacy root /attachments/ path is protected too', async () => {
		const res = await call('http://example.com/' + KEY_A, { envOverride: enforce });
		expect(res.status).toBe(403);
	});

	it('owner with JWT can fetch; another user cannot (cross-user)', async () => {
		expect((await call('/oss/' + KEY_A, { token: tokenAlice, envOverride: enforce })).status).toBe(200);
		expect((await call('/oss/' + KEY_A, { token: tokenBob, envOverride: enforce })).status).toBe(403);
	});

	it('shared-mailbox member can fetch the shared mailbox attachment', async () => {
		expect((await call('/oss/' + KEY_SHARED, { token: tokenCarol, envOverride: enforce })).status).toBe(200);
		expect((await call('/oss/' + KEY_SHARED, { token: tokenBob, envOverride: enforce })).status).toBe(403);
	});

	it('valid signature works without a JWT; tampered/expired ones do not', async () => {
		const q = await attachmentAccess.signedQuery(makeCtx(), KEY_A);
		expect((await call(`/oss/${KEY_A}?${q}`, { envOverride: enforce })).status).toBe(200);
		// signature for one key does not open another
		expect((await call(`/oss/${KEY_HTML}?${q}`, { envOverride: enforce })).status).toBe(403);
		const past = await attachmentAccess.sign(makeCtx(), KEY_A, Math.floor(Date.now() / 1000) - 10 * 24 * 3600);
		expect((await call(`/oss/${KEY_A}?exp=${past.exp}&sig=${past.sig}`, { envOverride: enforce })).status).toBe(403);
	});

	it('path traversal / odd keys are rejected', async () => {
		expect((await call('/oss/attachments/..%2F..%2Fsetting:', { token: tokenAlice })).status).toBe(400);
	});

	it('/attachment/sign only signs keys the caller may read', async () => {
		const bobRes = await (await call('/attachment/sign', { method: 'POST', token: tokenBob, body: { keys: [KEY_A, KEY_SHARED] } })).json();
		expect(bobRes.data).toEqual({});
		const carolRes = await (await call('/attachment/sign', { method: 'POST', token: tokenCarol, body: { keys: [KEY_A, KEY_SHARED] } })).json();
		// carol shares alice's whole mailbox, so both are readable for her
		expect(Object.keys(carolRes.data).sort()).toEqual([KEY_A, KEY_SHARED].sort());
		const dave = await insertUser({ email: 'dave@example.com', hash: (await cryptoUtils.hashPassword(PW)).hash, salt: 'x' });
		const daveRes = await (await call('/attachment/sign', { method: 'POST', token: await login('dave@example.com'), body: { keys: [KEY_A] } })).json();
		expect(daveRes.data).toEqual({});
		expect(dave.userId).toBeGreaterThan(0);
	});

	it('email detail returns signed attachment and inline-image URLs', async () => {
		const list = await (await call('/email/list?emailId=0&accountId=' + alice.accountId + '&allReceive=0&type=0&size=10&timeSort=0', { token: tokenAlice })).json();
		const shared = list.data.list.find(e => e.subject === 'shared');
		expect(shared.content).toMatch(/\{\{domain\}\}attachments\/c+\.png\?exp=\d+&sig=/);
		const priv = list.data.list.find(e => e.subject === 'private');
		const pdf = priv.attList.find(a => a.key === KEY_A);
		expect(pdf.url).toMatch(/^\/oss\/attachments\/a+\.pdf\?exp=\d+&sig=/);
		expect((await call(pdf.url, { envOverride: enforce })).status).toBe(200);
	});

	it('HTML attachments are forced to download and sandboxed (no stored XSS)', async () => {
		const res = await call('/oss/' + KEY_HTML, { token: tokenAlice, envOverride: enforce });
		expect(res.status).toBe(200);
		expect(res.headers.get('Content-Disposition')).toMatch(/^attachment;/);
		expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
		expect(res.headers.get('Content-Security-Policy')).toMatch(/sandbox/);
	});
});

describe('attachment access (compat mode)', () => {
	it('still serves unsigned requests during rollout, with hardened headers', async () => {
		const res = await call('/oss/' + KEY_HTML);
		expect(res.status).toBe(200);
		expect(res.headers.get('Content-Disposition')).toMatch(/^attachment;/);
	});
});

describe('outgoing mail cannot embed someone else’s attachment', () => {
	it('bob referencing alice’s key gets nothing embedded and the src is left alone', async () => {
		const c = makeCtx();
		await seedSettings();
		const bobUser = { userId: bob.userId, email: 'bob@example.com' };
		const { imageDataList, html } = await attService.toImageUrlHtml(c, `<img src="/api/oss/${KEY_SHARED}">`, bobUser);
		expect(imageDataList).toHaveLength(0);
		expect(html).not.toContain('cid:');
	});

	it('alice can embed her own image', async () => {
		const c = makeCtx();
		const aliceUser = { userId: alice.userId, email: 'alice@example.com' };
		const { imageDataList, html } = await attService.toImageUrlHtml(c, `<img src="/api/oss/${KEY_SHARED}?exp=1&sig=x">`, aliceUser);
		expect(imageDataList).toHaveLength(1);
		expect(html).toContain('cid:');
	});

	it('external images are never treated as site objects', () => {
		expect(siteObjectKey('https://evil.example/attachments/abc.png', '', 'https://mail.example.com')).toBe(null);
		expect(siteObjectKey('https://mail.example.com/api/oss/attachments/abc.png?exp=1', '', 'https://mail.example.com')).toBe('attachments/abc.png');
		expect(siteObjectKey('attachments/abc.png', '', '')).toBe('attachments/abc.png');
		expect(siteObjectKey('/attachments/../setting', '', '')).toBe(null);
	});
});

// ── Resend webhook ────────────────────────────────────────────────────────
const SECRET_BYTES = new Uint8Array(24).map((_, i) => i + 1);
const SECRET = 'whsec_' + btoa(String.fromCharCode(...SECRET_BYTES));

async function svixSign(id, ts, body) {
	const key = await crypto.subtle.importKey('raw', SECRET_BYTES, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
	const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${ts}.${body}`));
	return 'v1,' + btoa(String.fromCharCode(...new Uint8Array(mac)));
}

async function postWebhook(body, { id = crypto.randomUUID(), ts = Math.floor(Date.now() / 1000), sig, envOverride = { RESEND_WEBHOOK_SECRET: SECRET } } = {}) {
	const raw = JSON.stringify(body);
	const signature = sig ?? await svixSign(id, ts, raw);
	return call('/webhooks', { method: 'POST', raw, envOverride, headers: { 'svix-id': id, 'svix-timestamp': String(ts), 'svix-signature': signature } });
}

describe('Resend webhook verification', () => {
	let emailId;
	beforeAll(async () => {
		const row = await env.db.prepare(`INSERT INTO email (account_id, user_id, subject, type, status, resend_email_id) VALUES (?, ?, 'out', 1, 1, 're_123') RETURNING email_id`).bind(alice.accountId, alice.userId).first();
		emailId = row.email_id;
	});

	const status = async () => (await env.db.prepare('SELECT status FROM email WHERE email_id = ?').bind(emailId).first()).status;

	it('rejects when no secret is configured (secure default)', async () => {
		const res = await postWebhook({ type: 'email.delivered', data: { email_id: 're_123' } }, { envOverride: {} });
		expect(res.status).toBe(401);
		expect(await status()).toBe(emailConst.status.SENT);
	});

	it('rejects a forged signature', async () => {
		const res = await postWebhook({ type: 'email.bounced', data: { email_id: 're_123' } }, { sig: 'v1,AAAA' });
		expect(res.status).toBe(401);
		expect(await status()).toBe(emailConst.status.SENT);
	});

	it('rejects a stale timestamp (outside ±5 min)', async () => {
		const res = await postWebhook({ type: 'email.delivered', data: { email_id: 're_123' } }, { ts: Math.floor(Date.now() / 1000) - 3600 });
		expect(res.status).toBe(401);
	});

	it('accepts a valid signature and is idempotent on replay', async () => {
		const id = 'msg_' + crypto.randomUUID();
		const body = { type: 'email.delivered', data: { email_id: 're_123' } };
		expect((await postWebhook(body, { id })).status).toBe(200);
		expect(await status()).toBe(emailConst.status.DELIVERED);
		const replay = await postWebhook(body, { id });
		expect(replay.status).toBe(200);
		expect(await replay.text()).toBe('duplicate');
		const events = await env.db.prepare('SELECT COUNT(*) AS n FROM email_delivery_event WHERE email_id = ?').bind(emailId).first();
		expect(events.n).toBe(1);
	});

	it('an "opened" event or a late "delayed" event never downgrades DELIVERED', async () => {
		await postWebhook({ type: 'email.opened', data: { email_id: 're_123' } });
		await postWebhook({ type: 'email.delivery_delayed', data: { email_id: 're_123' } });
		expect(await status()).toBe(emailConst.status.DELIVERED);
		expect(shouldApply(emailConst.status.DELIVERED, emailConst.status.COMPLAINED)).toBe(true);
	});

	it('unknown provider message ids are acknowledged, not retried forever', async () => {
		const res = await postWebhook({ type: 'email.delivered', data: { email_id: 'not-ours' } });
		expect(res.status).toBe(200);
	});

	it('WEBHOOK_ALLOW_UNSIGNED restores the legacy behavior only when set', async () => {
		const res = await call('/webhooks', { method: 'POST', raw: JSON.stringify({ type: 'email.sent', data: { email_id: 'x' } }), envOverride: { WEBHOOK_ALLOW_UNSIGNED: 'true' } });
		expect(res.status).toBe(200);
	});
});

// ── /public/addUser SQL injection ───────────────────────────────────────
describe('/public/addUser', () => {
	it('a hostile User-Agent cannot inject SQL', async () => {
		await env.kv.put('public_key:', 'pub-token-1');
		await env.db.prepare(`INSERT INTO role (name, is_default) SELECT 'default', 1 WHERE NOT EXISTS (SELECT 1 FROM role)`).run().catch(() => {});
		const evilUA = `x'); DELETE FROM user; --`;
		const before = (await env.db.prepare('SELECT COUNT(*) AS n FROM user').first()).n;
		const res = await call('/public/addUser', {
			method: 'POST', body: { list: [{ email: 'imported@example.com', password: 'Import-Pass-1' }] },
			headers: { Authorization: 'pub-token-1', 'User-Agent': evilUA },
		});
		const body = await res.json();
		const after = (await env.db.prepare('SELECT COUNT(*) AS n FROM user').first()).n;
		expect(after).toBeGreaterThanOrEqual(before);
		if (body.code === 200) {
			const row = await env.db.prepare(`SELECT os, browser, device FROM user WHERE email = 'imported@example.com'`).first();
			expect(row).toBeTruthy();
		}
	});

	it('public token comparison rejects a missing token', async () => {
		const res = await call('/public/emailList', { method: 'POST', body: {} });
		expect((await res.json()).code).toBe(401);
	});
});

// ── secret-box ────────────────────────────────────────────────────────────
describe('secret-box (credential encryption at rest)', () => {
	const KEY = btoa(String.fromCharCode(...new Uint8Array(32).map((_, i) => 255 - i)));
	const encEnv = { DATA_ENCRYPTION_KEY: KEY };

	it('is a no-op without a key (opt-in, never breaks reads)', async () => {
		expect(await secretBox.encrypt({}, 'abc', 'x')).toBe('abc');
		expect(await secretBox.decrypt({}, 'abc', 'x')).toBe('abc');
	});

	it('round-trips, binds to the AAD, and never returns ciphertext on failure', async () => {
		const ct = await secretBox.encrypt(encEnv, 'super-secret', 'setting:s3SecretKey');
		expect(ct.startsWith('enc:v1:k1:')).toBe(true);
		expect(await secretBox.decrypt(encEnv, ct, 'setting:s3SecretKey')).toBe('super-secret');
		expect(await secretBox.decrypt(encEnv, ct, 'setting:tgBotToken')).toBe('');
		expect(await secretBox.decrypt({}, ct, 'setting:s3SecretKey')).toBe('');
	});

	it('supports key rotation (old kid still decrypts)', async () => {
		const old = await secretBox.encrypt({ DATA_ENCRYPTION_KEYS: JSON.stringify({ k1: KEY }) }, 'v', 'a');
		const KEY2 = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));
		const ring = { DATA_ENCRYPTION_KEYS: JSON.stringify({ k1: KEY, k2: KEY2 }), DATA_ENCRYPTION_KEY_ID: 'k2' };
		expect(await secretBox.decrypt(ring, old, 'a')).toBe('v');
		expect((await secretBox.encrypt(ring, 'v', 'a')).startsWith('enc:v1:k2:')).toBe(true);
	});

	it('settings store provider secrets encrypted and read them back decrypted', async () => {
		await seedSettings();
		const c = makeCtx(encEnv);
		await settingService.set(c, { s3SecretKey: 'S3-SECRET-VALUE', resendTokens: { 'example.com': 're_live_token' } });
		const row = await env.db.prepare('SELECT s3_secret_key, resend_tokens FROM setting').first();
		expect(row.s3_secret_key.startsWith('enc:v1:')).toBe(true);
		expect(row.resend_tokens).not.toContain('re_live_token');
		const kv = await env.kv.get('setting:');
		expect(kv).not.toContain('S3-SECRET-VALUE');

		const fresh = makeCtx(encEnv);
		const setting = await settingService.query(fresh);
		expect(setting.s3SecretKey).toBe('S3-SECRET-VALUE');
		expect(setting.resendTokens['example.com']).toBe('re_live_token');
	});
});
