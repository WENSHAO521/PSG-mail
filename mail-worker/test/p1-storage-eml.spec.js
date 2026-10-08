// P1: object-storage consistency (retry queue + audit) and the EML
// export → import restore drill.
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, beforeAll, vi, afterEach } from 'vitest';
import PostalMime from 'postal-mime';
import worker from '../src';
import cryptoUtils from '../src/utils/crypto-utils';
import attService from '../src/service/att-service';
import storageConsistencyService from '../src/service/storage-consistency-service';
import emlService from '../src/service/eml-service';
import r2Service from '../src/service/r2-service';
import { bootstrapSchema, seedSettings, insertUser, makeCtx } from './helpers/schema';

const PW = 'Correct-Horse-9';
let owner, other, tokenOwner, tokenOther;

async function call(path, { method = 'GET', token, body, headers = {} } = {}) {
	const req = new Request('http://example.com/api' + path, {
		method,
		headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.7', ...(token ? { Authorization: token } : {}), ...headers },
		body,
	});
	const ctx = createExecutionContext();
	const res = await worker.fetch(req, env, ctx);
	await waitOnExecutionContext(ctx);
	return res;
}

async function login(email) {
	const res = await call('/login', { method: 'POST', body: JSON.stringify({ email, password: PW }) });
	return (await res.json()).data.token;
}

beforeAll(async () => {
	await bootstrapSchema();
	await seedSettings();
	const { hash, salt } = await cryptoUtils.hashPassword(PW);
	owner = await insertUser({ email: 'owner@example.com', hash, salt });
	other = await insertUser({ email: 'other@example.com', hash, salt });
	tokenOwner = await login('owner@example.com');
	tokenOther = await login('other@example.com');
});

afterEach(() => vi.restoreAllMocks());

describe('attachment deletion retry queue', () => {
	it('a failed object delete is queued instead of silently orphaned', async () => {
		vi.spyOn(r2Service, 'delete').mockRejectedValueOnce(new Error('injected storage outage'));
		await attService.batchDelete(makeCtx(), ['attachments/orphan-1.bin']);
		const job = await env.db.prepare(`SELECT status, last_error FROM attachment_cleanup_job WHERE object_key = 'attachments/orphan-1.bin'`).first();
		expect(job.status).toBe('pending');
		expect(job.last_error).toContain('injected');
	});

	it('the cron deletes unreferenced keys and skips re-referenced ones', async () => {
		await env.kv.put('attachments/orphan-2.bin', 'x');
		await env.kv.put('attachments/reused.bin', 'y');
		await storageConsistencyService.enqueue(makeCtx(), ['attachments/orphan-2.bin', 'attachments/reused.bin'], 'test');
		await env.db.prepare(`INSERT INTO attachments (user_id, email_id, account_id, key) VALUES (?, 0, ?, 'attachments/reused.bin')`).bind(owner.userId, owner.accountId).run();

		const summary = await storageConsistencyService.processDue({ env });
		expect(summary.done).toBeGreaterThanOrEqual(1);
		expect(summary.skipped).toBe(1);
		expect(await env.kv.get('attachments/orphan-2.bin')).toBe(null);
		expect(await env.kv.get('attachments/reused.bin')).toBe('y');
	});

	it('gives up after 5 attempts with status failed (alertable)', async () => {
		vi.spyOn(r2Service, 'delete').mockRejectedValue(new Error('still down'));
		await storageConsistencyService.enqueue(makeCtx(), ['attachments/stuck.bin'], 'x');
		for (let i = 0; i < 5; i++) {
			await env.db.prepare(`UPDATE attachment_cleanup_job SET next_attempt_at = datetime('now', '-1 minute') WHERE object_key = 'attachments/stuck.bin'`).run();
			await storageConsistencyService.processDue({ env });
		}
		const job = await env.db.prepare(`SELECT status, attempts FROM attachment_cleanup_job WHERE object_key = 'attachments/stuck.bin'`).first();
		expect(job).toEqual({ status: 'failed', attempts: 5 });
	});

	it('audit reports orphans without deleting, and is admin-only', async () => {
		await env.kv.put('attachments/audit-orphan.bin', 'z');
		const report = await storageConsistencyService.audit({ env, get: () => undefined, set: () => {} }, { limit: 1000 });
		expect(report.storageType).toBe('KV');
		expect(report.orphans).toContain('attachments/audit-orphan.bin');
		expect(report.orphans).not.toContain('attachments/reused.bin');
		expect(await env.kv.get('attachments/audit-orphan.bin')).toBe('z');

		const res = await (await call('/admin/storage/audit', { token: tokenOther })).json();
		expect(res.code).toBe(403);
	});
});

describe('EML export / import restore drill', () => {
	let emailId;
	const IMG_KEY = 'attachments/' + 'e'.repeat(64) + '.png';
	const PDF_KEY = 'attachments/' + 'f'.repeat(64) + '.pdf';
	const pdfBytes = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52, 0, 255, 10]);

	beforeAll(async () => {
		const row = await env.db.prepare(
			`INSERT INTO email (account_id, user_id, send_email, name, subject, text, content, cc, recipient, to_email, message_id, in_reply_to, relation, create_time)
			 VALUES (?, ?, 'author@remote.test', '作者 Zhang', '修订稿 / Revised manuscript', '纯文本正文', ?, ?, ?, 'owner@example.com', '<orig-1@remote.test>', '<p0@remote.test>', '<p0@remote.test>', '2026-03-01 08:00:00')
			 RETURNING email_id`
		).bind(owner.accountId, owner.userId,
			`<p>正文 <img src="{{domain}}${IMG_KEY}?exp=1&sig=x"></p>`,
			JSON.stringify([{ address: 'editor@example.com', name: 'Editor' }]),
			JSON.stringify([{ address: 'owner@example.com', name: '' }])).first();
		emailId = row.email_id;
		await env.db.prepare(`INSERT INTO attachments (user_id, email_id, account_id, key, filename, mime_type, size, content_id) VALUES (?, ?, ?, ?, 'figure.png', 'image/png', 3, 'fig1@x')`).bind(owner.userId, emailId, owner.accountId, IMG_KEY).run();
		await env.db.prepare(`INSERT INTO attachments (user_id, email_id, account_id, key, filename, mime_type, size) VALUES (?, ?, ?, ?, '稿件.pdf', 'application/pdf', ?)`).bind(owner.userId, emailId, owner.accountId, PDF_KEY, pdfBytes.length).run();
		await env.kv.put(IMG_KEY, new Uint8Array([137, 80, 78]), { metadata: { contentType: 'image/png' } });
		await env.kv.put(PDF_KEY, pdfBytes, { metadata: { contentType: 'application/pdf' } });
	});

	it('export contains headers, Cc, threading, inline image and attachment', async () => {
		const res = await call('/email/export-eml/' + emailId, { token: tokenOwner });
		expect(res.headers.get('Content-Type')).toBe('message/rfc822');
		const raw = new Uint8Array(await res.arrayBuffer());
		expect(new TextDecoder().decode(raw)).not.toContain('[object Object]');

		const parsed = await PostalMime.parse(raw);
		expect(parsed.subject).toBe('修订稿 / Revised manuscript');
		expect(parsed.from).toEqual({ address: 'author@remote.test', name: '作者 Zhang' });
		expect(parsed.cc[0].address).toBe('editor@example.com');
		expect(parsed.messageId).toBe('<orig-1@remote.test>');
		expect(parsed.inReplyTo).toBe('<p0@remote.test>');
		expect(parsed.text.trim()).toBe('纯文本正文');
		expect(parsed.html).toContain('cid:fig1@x');
		expect(parsed.html).not.toContain('{{domain}}');
		const pdf = parsed.attachments.find(a => a.filename === '稿件.pdf');
		expect(new Uint8Array(pdf.content)).toEqual(pdfBytes);
		const img = parsed.attachments.find(a => a.contentId === '<fig1@x>');
		expect(img).toBeTruthy();
	});

	it('another user cannot export it', async () => {
		const res = await call('/email/export-eml/' + emailId, { token: tokenOther });
		expect((await res.json()).code).not.toBe(200);
	});

	it('restore drill: import the export into another mailbox and compare', async () => {
		const raw = await (await call('/email/export-eml/' + emailId, { token: tokenOwner })).arrayBuffer();
		// a mailbox of the other user — restore is per target mailbox
		const imported = await (await call('/email/import?accountId=' + other.accountId, { method: 'POST', token: tokenOther, body: raw, headers: { 'Content-Type': 'message/rfc822' } })).json();
		expect(imported.code).toBe(200);
		const restored = await env.db.prepare('SELECT * FROM email WHERE email_id = ?').bind(imported.data.emailId).first();
		expect(restored.subject).toBe('修订稿 / Revised manuscript');
		expect(restored.message_id).toBe('<orig-1@remote.test>');
		expect(restored.user_id).toBe(other.userId);
		expect(restored.is_del).toBe(0);
		expect(restored.content).toContain('{{domain}}attachments/');
		const atts = await env.db.prepare('SELECT key, filename FROM attachments WHERE email_id = ?').bind(restored.email_id).all();
		expect(atts.results.map(a => a.filename).sort()).toEqual(['figure.png', '稿件.pdf'].sort());
		// content-addressed key of the real bytes
		expect(atts.results.find(a => a.filename === '稿件.pdf').key).toMatch(/^attachments\/[0-9a-f]+\.pdf$/);

		// re-export of the restored copy round-trips the attachment bytes
		const again = await PostalMime.parse(await emlService.build({ env }, restored));
		expect(new Uint8Array(again.attachments.find(a => a.filename === '稿件.pdf').content)).toEqual(pdfBytes);
	});

	it('importing the same message again is a no-op', async () => {
		const raw = await (await call('/email/export-eml/' + emailId, { token: tokenOwner })).arrayBuffer();
		const second = await (await call('/email/import?accountId=' + other.accountId, { method: 'POST', token: tokenOther, body: raw })).json();
		expect(second.data.duplicate).toBe(true);
	});

	it('cannot import into a mailbox you do not own or share', async () => {
		const res = await (await call('/email/import?accountId=' + owner.accountId, { method: 'POST', token: tokenOther, body: 'Subject: x\r\n\r\nx' })).json();
		expect(res.code).toBe(403);
	});

	it('header values from mail data cannot inject new headers', async () => {
		const row = { emailId: 999, sendEmail: 'a@b.c', subject: 'x\r\nBcc: victim@evil.test', text: 't', content: '', createTime: '2026-01-01 00:00:00' };
		const raw = await emlService.build({ env }, row, { includeAttachments: false });
		expect(raw).not.toMatch(/\r\nBcc:/);
	});
});
