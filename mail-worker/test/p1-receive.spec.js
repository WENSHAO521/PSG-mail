// P1: inbound reliability — byte-safe parsing, idempotent delivery, and
// RFC 3834 auto-reply loop protection. Drives the real email() handler.
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import { email as emailHandler } from '../src/email/email';
import receiveGuardService from '../src/service/receive-guard-service';
import { bootstrapSchema, seedSettings, insertUser } from './helpers/schema';

const enc = new TextEncoder();

// Splits the raw bytes at the given offsets so tests control chunk borders.
function rawStream(bytes, cuts = []) {
	const parts = [];
	let prev = 0;
	for (const cut of [...cuts, bytes.length]) {
		parts.push(bytes.slice(prev, cut));
		prev = cut;
	}
	return new ReadableStream({
		start(controller) {
			for (const p of parts) controller.enqueue(p);
			controller.close();
		}
	});
}

function buildRaw({ to, from = 'sender@remote.test', subject = 'hi', body = 'hello', messageId = '<m1@remote.test>', extraHeaders = '' }) {
	const lines = [
		`From: Sender <${from}>`,
		`To: ${to}`,
		`Subject: ${subject}`,
		...(messageId ? [`Message-ID: ${messageId}`] : []),
		'MIME-Version: 1.0',
		'Content-Type: text/plain; charset=utf-8',
		'Content-Transfer-Encoding: 8bit',
		...(extraHeaders ? [extraHeaders] : []),
		'',
		body,
		''
	];
	return enc.encode(lines.join('\r\n'));
}

async function deliver(to, raw, cuts = []) {
	const rejected = [];
	const message = {
		to,
		from: 'sender@remote.test',
		raw: rawStream(raw, cuts),
		rawSize: raw.length,
		setReject: (r) => rejected.push(r),
		forward: async () => {},
	};
	const ctx = createExecutionContext();
	await emailHandler(message, env, ctx);
	await waitOnExecutionContext(ctx);
	return rejected;
}

async function countFor(to, messageId) {
	const row = await env.db.prepare('SELECT COUNT(*) AS n FROM email WHERE to_email = ? AND message_id = ?').bind(to, messageId).first();
	return row.n;
}

beforeAll(async () => {
	await bootstrapSchema();
	await env.db.prepare(`INSERT INTO role (name, is_default) SELECT 'default', 1 WHERE NOT EXISTS (SELECT 1 FROM role)`).run().catch(() => {});
	await seedSettings({ receive: 0, noRecipient: 0 });
	const role = await env.db.prepare('SELECT role_id FROM role LIMIT 1').first().catch(() => null);
	await insertUser({ email: 'inbox@example.com', hash: 'x', salt: 'x', type: role?.role_id || 1 });
	await insertUser({ email: 'second@example.com', hash: 'x', salt: 'x', type: role?.role_id || 1 });
	await insertUser({ email: 'ar@example.com', hash: 'x', salt: 'x', type: role?.role_id || 1 });
});

describe('byte-safe parsing', () => {
	it('keeps a multi-byte character that straddles a stream chunk boundary', async () => {
		const body = '编辑部您好，稿件已收到。';
		const raw = buildRaw({ to: 'inbox@example.com', body, messageId: '<utf8@remote.test>', subject: 'utf8' });
		// cut inside the 3-byte encoding of the first CJK character of the body
		const bodyStart = raw.length - enc.encode(body + '\r\n').length;
		await deliver('inbox@example.com', raw, [bodyStart + 1, bodyStart + 5]);
		const row = await env.db.prepare(`SELECT text FROM email WHERE subject = 'utf8'`).first();
		expect(row.text.trim()).toBe(body);
	});
});

describe('idempotent receive', () => {
	it('a re-delivered message is stored once', async () => {
		const raw = buildRaw({ to: 'inbox@example.com', messageId: '<dup-1@remote.test>' });
		await deliver('inbox@example.com', raw);
		await deliver('inbox@example.com', raw);
		await deliver('inbox@example.com', raw);
		expect(await countFor('inbox@example.com', '<dup-1@remote.test>')).toBe(1);
	});

	it('the same Message-ID for two different local recipients is stored for each', async () => {
		const mid = '<multi-rcpt@remote.test>';
		await deliver('inbox@example.com', buildRaw({ to: 'inbox@example.com, second@example.com', messageId: mid }));
		await deliver('second@example.com', buildRaw({ to: 'inbox@example.com, second@example.com', messageId: mid }));
		expect(await countFor('inbox@example.com', mid)).toBe(1);
		expect(await countFor('second@example.com', mid)).toBe(1);
	});

	it('messages without a Message-ID dedup by content, distinct content is kept', async () => {
		const a = buildRaw({ to: 'inbox@example.com', messageId: null, subject: 'no-mid', body: 'A' });
		const b = buildRaw({ to: 'inbox@example.com', messageId: null, subject: 'no-mid', body: 'B' });
		await deliver('inbox@example.com', a);
		await deliver('inbox@example.com', a);
		await deliver('inbox@example.com', b);
		const row = await env.db.prepare(`SELECT COUNT(*) AS n FROM email WHERE subject = 'no-mid'`).first();
		expect(row.n).toBe(2);
	});

	it('RECEIVE_DEDUP=false turns it off', async () => {
		expect(receiveGuardService.enabled({ RECEIVE_DEDUP: 'false' })).toBe(false);
		expect(receiveGuardService.enabled({})).toBe(true);
	});

	it('fails open when the dedup table is unavailable', async () => {
		const broken = { env: { db: { prepare: () => { throw new Error('no such table'); } } } };
		expect(await receiveGuardService.findDuplicate(broken, 'k')).toBe(0);
	});
});

describe('auto-reply loop protection (RFC 3834)', () => {
	const base = { from: { address: 'person@remote.test' }, headers: [] };
	const withHeader = (key, value) => ({ ...base, headers: [{ key, value }] });

	it('replies to an ordinary personal message', () => {
		expect(receiveGuardService.autoReplyBlockReason(base, 'me@example.com')).toBe(null);
		expect(receiveGuardService.autoReplyBlockReason(withHeader('auto-submitted', 'no'), 'me@example.com')).toBe(null);
	});

	it.each([
		['auto-submitted', 'auto-replied', 'auto_submitted'],
		['precedence', 'bulk', 'precedence'],
		['precedence', 'list', 'precedence'],
		['list-id', '<editors.lists.example>', 'mailing_list'],
		['list-unsubscribe', '<mailto:u@x>', 'mailing_list'],
		['x-autoreply', 'yes', 'auto_responder'],
		['return-path', '<>', 'null_return_path'],
		['content-type', 'multipart/report; report-type=delivery-status', 'delivery_report'],
	])('suppresses %s: %s', (key, value, reason) => {
		expect(receiveGuardService.autoReplyBlockReason(withHeader(key, value), 'me@example.com')).toBe(reason);
	});

	it('suppresses system senders and self', () => {
		expect(receiveGuardService.autoReplyBlockReason({ from: { address: 'MAILER-DAEMON@remote.test' }, headers: [] }, 'me@example.com')).toBe('system_sender');
		expect(receiveGuardService.autoReplyBlockReason({ from: { address: 'noreply@remote.test' }, headers: [] }, 'me@example.com')).toBe('system_sender');
		expect(receiveGuardService.autoReplyBlockReason({ from: { address: 'me@example.com' }, headers: [] }, 'me@example.com')).toBe('self');
	});

	it('at most one auto-reply per sender per window', async () => {
		const c = { env };
		expect(await receiveGuardService.takeAutoReplySlot(c, 42, 'x@remote.test')).toBe(true);
		expect(await receiveGuardService.takeAutoReplySlot(c, 42, 'X@remote.test')).toBe(false);
		expect(await receiveGuardService.takeAutoReplySlot(c, 43, 'x@remote.test')).toBe(true);
	});
});
