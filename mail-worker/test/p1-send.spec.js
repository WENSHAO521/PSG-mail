// P1: outbound send path — threading headers, limits enforced before the
// provider is called, delivery audit of failures, and fault injection.
import { env } from 'cloudflare:test';
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import emailService, { buildReferences } from '../src/service/email-service';
import { bootstrapSchema, seedSettings, insertUser, makeCtx } from './helpers/schema';

let sender;

beforeAll(async () => {
	await bootstrapSchema();
	const role = await env.db.prepare(
		`INSERT INTO role (name, send_type, send_count, account_count, is_default) VALUES ('sender', 'count', 0, 0, 1) RETURNING role_id`
	).first();
	await env.db.prepare(`INSERT INTO role_perm (role_id, perm_id) SELECT ?, perm_id FROM perm`).bind(role.role_id).run().catch(() => {});
	sender = await insertUser({ email: 'editor@example.com', hash: 'x', salt: 'x', type: role.role_id });
	// Mailjet is the only provider configured (no CF binding, no Resend token)
	const featureRow = await env.db.prepare('SELECT id FROM psg_feature_setting WHERE id = 1').first();
	if (!featureRow) await env.db.prepare('INSERT INTO psg_feature_setting (id) VALUES (1)').run();
	await env.db.prepare(`UPDATE psg_feature_setting SET mailjet_api_key = 'mj-key', mailjet_secret_key = 'mj-secret' WHERE id = 1`).run();
	await seedSettings({ send: 0 });
});

afterEach(() => {
	vi.restoreAllMocks();
});

function sendParams(extra = {}) {
	return {
		accountId: sender.accountId,
		receiveEmail: ['author@external.test'],
		subject: 'Re: manuscript',
		content: '<p>hello</p>',
		text: 'hello',
		attachments: [],
		...extra,
	};
}

describe('References header chain (RFC 5322 §3.6.4)', () => {
	it('appends the parent Message-ID to the parent References', () => {
		expect(buildReferences({ relation: '<a@x> <b@x>', messageId: '<c@x>' })).toBe('<a@x> <b@x> <c@x>');
	});
	it('falls back to In-Reply-To and de-duplicates', () => {
		expect(buildReferences({ inReplyTo: '<a@x>', messageId: '<a@x>' })).toBe('<a@x>');
		expect(buildReferences({ messageId: '<only@x>' })).toBe('<only@x>');
	});
	it('stays bounded while keeping the thread root', () => {
		const relation = Array.from({ length: 40 }, (_, i) => `<m${i}@x>`).join(' ');
		const refs = buildReferences({ relation, messageId: '<new@x>' }).split(' ');
		expect(refs).toHaveLength(20);
		expect(refs[0]).toBe('<m0@x>');
		expect(refs.at(-1)).toBe('<new@x>');
	});
	it('ignores junk between ids', () => {
		expect(buildReferences({ relation: 'garbage <a@x>\r\nInjected: 1', messageId: '<b@x>' })).toBe('<a@x> <b@x>');
	});
});

describe('send() fault handling', () => {
	it('rejects >10 attachments BEFORE calling the provider (3.x sent, then failed)', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch');
		const attachments = Array.from({ length: 11 }, (_, i) => ({ filename: `f${i}.txt`, type: 'text/plain', content: btoa('x') }));
		await expect(emailService.send(makeCtx(), sendParams({ attachments }), sender.userId)).rejects.toThrow();
		expect(fetchSpy.mock.calls.filter(([url]) => String(url).includes('mailjet')).length).toBe(0);
	});

	it('provider failure (fault injection) is audited, nothing is saved as sent', async () => {
		vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
			if (String(url).includes('api.mailjet.com')) {
				return new Response(JSON.stringify({ ErrorMessage: 'injected outage' }), { status: 503 });
			}
			throw new Error('unexpected fetch ' + url);
		});
		const before = (await env.db.prepare(`SELECT COUNT(*) AS n FROM email WHERE type = 1`).first()).n;
		await expect(emailService.send(makeCtx(), sendParams({ subject: 'will fail' }), sender.userId)).rejects.toThrow(/injected outage/);
		const after = (await env.db.prepare(`SELECT COUNT(*) AS n FROM email WHERE type = 1`).first()).n;
		expect(after).toBe(before);
		const ev = await env.db.prepare(`SELECT provider, event_type, detail FROM email_delivery_event WHERE event_type = 'send.failed' ORDER BY id DESC LIMIT 1`).first();
		expect(ev.provider).toBe('mailjet');
		expect(ev.detail).toContain('injected outage');
		expect(ev.detail).not.toContain('author@external.test');
	});

	it('provider network exception is caught, audited and surfaced as a business error', async () => {
		vi.spyOn(globalThis, 'fetch').mockImplementation(async () => { throw new TypeError('network down'); });
		await expect(emailService.send(makeCtx(), sendParams(), sender.userId)).rejects.toMatchObject({ name: 'BizError' });
	});

	it('successful send records send.accepted with the provider message id', async () => {
		vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
			if (String(url).includes('api.mailjet.com')) {
				return new Response(JSON.stringify({ Messages: [{ Status: 'success', To: [{ MessageID: 777 }] }] }), { status: 200 });
			}
			throw new Error('unexpected fetch ' + url);
		});
		const [row] = await emailService.send(makeCtx(), sendParams({ subject: 'ok send' }), sender.userId);
		expect(row.provider).toBe('mailjet');
		const ev = await env.db.prepare(`SELECT provider_message_id FROM email_delivery_event WHERE email_id = ? AND event_type = 'send.accepted'`).bind(row.emailId).first();
		expect(ev.provider_message_id).toBe('777');
	});

	it('a reply carries In-Reply-To and the full References chain to the provider', async () => {
		const parent = await env.db.prepare(
			`INSERT INTO email (account_id, user_id, subject, message_id, relation, type) VALUES (?, ?, 'thread', '<p2@remote>', '<p0@remote> <p1@remote>', 0) RETURNING email_id`
		).bind(sender.accountId, sender.userId).first();
		let sentBody;
		vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
			sentBody = JSON.parse(init.body);
			return new Response(JSON.stringify({ Messages: [{ Status: 'success', To: [{ MessageID: 1 }] }] }), { status: 200 });
		});
		const [row] = await emailService.send(makeCtx(), sendParams({ sendType: 'reply', emailId: parent.email_id }), sender.userId);
		expect(sentBody.Messages[0].Headers).toEqual({ 'In-Reply-To': '<p2@remote>', References: '<p0@remote> <p1@remote> <p2@remote>' });
		expect(row.relation).toBe('<p0@remote> <p1@remote> <p2@remote>');
	});
});
