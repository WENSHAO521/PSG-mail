// Fixes ported from the upstream review (2026-10-29): on-site mail runs the
// inbound follow-up, logout revokes the token, Resend webhook tolerance and
// registration-key role check.
import { env } from 'cloudflare:test';
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { setupFullSchema, makeCtx } from './helpers/full-schema';
import emailService, { sameOrgDomain } from '../src/service/email-service';
import mailRuleService from '../src/service/mail-rule-service';
import loginService from '../src/service/login-service';
import resendService from '../src/service/resend-service';
import regKeyService from '../src/service/reg-key-service';
import userContext from '../src/security/user-context';
import { emailConst } from '../src/const/entity-const';

const SENDER = 9301, RECIPIENT = 9302;
const SENDER_ACC = 9311, RECIPIENT_ACC = 9312;

beforeAll(async () => {
	await setupFullSchema();
	const role = await env.db.prepare('SELECT role_id FROM role LIMIT 1').first();
	await env.db.prepare(`UPDATE role SET ban_email = '', avail_domain = '' WHERE role_id = ?`).bind(role.role_id).run();
	for (const [uid, acc, mail] of [[SENDER, SENDER_ACC, 'a@psg.test'], [RECIPIENT, RECIPIENT_ACC, 'b@psg.test']]) {
		await env.db.prepare(`INSERT INTO user (user_id, email, password, salt, type) VALUES (?, ?, 'x', 'x', ?)`).bind(uid, mail, role.role_id).run();
		await env.db.prepare('INSERT INTO account (account_id, email, user_id) VALUES (?, ?, ?)').bind(acc, mail, uid).run();
	}
});

async function sentRow(subject) {
	return env.db.prepare(
		`INSERT INTO email (send_email, name, account_id, user_id, subject, text, content, type, status, recipient)
		 VALUES ('a@psg.test', 'A', ?, ?, ?, 'hi', '<p>hi</p>', ?, ?, '[{"address":"b@psg.test"}]') RETURNING *`
	).bind(SENDER_ACC, SENDER, subject, emailConst.type.SEND, emailConst.status.SENT).first()
		.then(row => ({ emailId: row.email_id, sendEmail: row.send_email, name: row.name, accountId: row.account_id,
			userId: row.user_id, subject: row.subject, text: row.text, content: row.content, type: row.type, status: row.status,
			recipient: row.recipient, cc: '[]', bcc: '[]' }));
}

describe('on-site mail', () => {
	it('runs the recipient\'s mail rules', async () => {
		await mailRuleService.create(makeCtx(), RECIPIENT, { name: 'r', conditionType: 'subject', conditionValue: 'grant', action: 'star' });
		await emailService.HandleOnSiteEmail(makeCtx(), ['b@psg.test'], await sentRow('Grant report'), []);
		const got = await env.db.prepare(`SELECT email_id FROM email WHERE user_id = ? AND subject = 'Grant report'`).bind(RECIPIENT).first();
		const star = await env.db.prepare('SELECT 1 AS s FROM star WHERE user_id = ? AND email_id = ?').bind(RECIPIENT, got.email_id).first();
		expect(star?.s).toBe(1);
	});

	it('auto-replies to on-site mail, but never to an auto-reply', async () => {
		await env.db.prepare(`INSERT INTO auto_reply (user_id, enabled, message) VALUES (?, 1, 'Away')`).bind(RECIPIENT).run();
		const key = `auto-reply:${RECIPIENT_ACC}:a@psg.test`;

		await emailService.HandleOnSiteEmail(makeCtx(), ['b@psg.test'], await sentRow('Auto 1'), [], { autoSubmitted: true });
		expect(await env.kv.get(key)).toBeNull();

		await emailService.HandleOnSiteEmail(makeCtx(), ['b@psg.test'], await sentRow('Auto 2'), []);
		expect(await env.kv.get(key)).toBe('1');
	});
});

describe('logout', () => {
	it('removes the current token and session', async () => {
		const authInfo = { tokens: ['t1', 't2'], user: { userId: 77 }, sessions: { t1: {}, t2: {} } };
		await env.kv.put('auth-uid:77', JSON.stringify(authInfo));
		const spy = vi.spyOn(userContext, 'getToken').mockResolvedValue('t2');
		await loginService.logout(makeCtx(), 77);
		spy.mockRestore();
		const stored = await env.kv.get('auth-uid:77', { type: 'json' });
		expect(stored.tokens).toEqual(['t1']);
		expect(Object.keys(stored.sessions)).toEqual(['t1']);
	});
});

describe('resend webhook', () => {
	it('acknowledges events for mail this deployment never sent', async () => {
		await expect(resendService.webhooks(makeCtx(), { type: 'email.delivered', data: { email_id: 'nope' } })).resolves.toBeUndefined();
	});

	it('does not let opened / clicked reset a delivered status', async () => {
		await env.db.prepare(`INSERT INTO email (send_email, account_id, user_id, resend_email_id, status) VALUES ('a@psg.test', ?, ?, 'rs-1', ?)`)
			.bind(SENDER_ACC, SENDER, emailConst.status.DELIVERED).run();
		await resendService.webhooks(makeCtx(), { type: 'email.opened', data: { email_id: 'rs-1' } });
		const row = await env.db.prepare(`SELECT status FROM email WHERE resend_email_id = 'rs-1'`).first();
		expect(row.status).toBe(emailConst.status.DELIVERED);
	});
});

describe('registration keys', () => {
	it('refuses a role that does not exist', async () => {
		const c = makeCtx();
		await expect(regKeyService.add(c, { code: 'NOROLE1', roleId: 987654, count: 1, expireTime: '2099-01-01' }, SENDER))
			.rejects.toThrow();
	});
});

describe('sent via', () => {
	it('compares organisational domains', () => {
		expect(sameOrgDomain('bounce@mail.example.com', 'news@example.com')).toBe(true);
		expect(sameOrgDomain('a@x.co.uk', 'b@mail.x.co.uk')).toBe(true);
		expect(sameOrgDomain('b@mcsv.net', 'news@example.com')).toBe(false);
	});

	it('stores the real sender only when its domain differs from From', async () => {
		const row = await sentRow('via');
		await emailService.saveSenderEmail(makeCtx(), row.emailId, { envelopeFrom: 'bounce@mail.psg.test', fromAddress: 'a@psg.test' });
		let got = await env.db.prepare('SELECT sender_email FROM email WHERE email_id = ?').bind(row.emailId).first();
		expect(got.sender_email).toBe('');
		await emailService.saveSenderEmail(makeCtx(), row.emailId, { sender: { address: 'agent@other.test' }, envelopeFrom: 'x@psg.test', fromAddress: 'a@psg.test' });
		got = await env.db.prepare('SELECT sender_email FROM email WHERE email_id = ?').bind(row.emailId).first();
		expect(got.sender_email).toBe('agent@other.test');
	});
});

describe('send separately', () => {
	it('sends one mail per To recipient, keeps going past a failure and refuses Cc', async () => {
		await expect(emailService.send(makeCtx(), { separate: true, receiveEmail: ['x@psg.test', 'y@psg.test'], cc: ['z@psg.test'] }, SENDER))
			.rejects.toThrow();

		const real = emailService.send;
		emailService.send = async function (c, params, userId) {
			if (params.separate) return real.call(this, c, params, userId);
			if (params.receiveEmail[0] === 'bad@psg.test') throw new Error('nope');
			return [{ to: params.receiveEmail[0] }];
		};
		try {
			const out = await emailService.send(makeCtx(), { separate: true, receiveEmail: ['x@psg.test', 'bad@psg.test', 'y@psg.test'] }, SENDER);
			expect(out.map(o => o.to)).toEqual(['x@psg.test', 'y@psg.test']);
			expect(out[0].separateFailed).toBe(1);
			await expect(emailService.send(makeCtx(), { separate: true, receiveEmail: ['bad@psg.test', 'bad@psg.test'] }, SENDER)).rejects.toThrow('nope');
		} finally {
			emailService.send = real;
		}
	});
});
