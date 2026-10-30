// On-site delivery must not hand the Bcc list to recipients: every copy
// used to carry the sender's bcc column, so the reader showed all blind-
// copied addresses to everyone on this site.
import { env } from 'cloudflare:test';
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { setupFullSchema, makeCtx } from './helpers/full-schema';
import emailService from '../src/service/email-service';
import settingService from '../src/service/setting-service';
import roleService from '../src/service/role-service';
import { emailConst } from '../src/const/entity-const';

const SENDER = 9401, TO_USER = 9402, BCC_USER = 9403;
const SENDER_ACC = 9411, TO_ACC = 9412, BCC_ACC = 9413;

beforeAll(async () => {
	await setupFullSchema();
	const role = await env.db.prepare('SELECT role_id FROM role LIMIT 1').first();
	await env.db.prepare(`UPDATE role SET ban_email = '', avail_domain = '' WHERE role_id = ?`).bind(role.role_id).run();
	for (const [uid, acc, mail] of [[SENDER, SENDER_ACC, 'boss@psg.test'], [TO_USER, TO_ACC, 'to@psg.test'], [BCC_USER, BCC_ACC, 'hidden@psg.test']]) {
		await env.db.prepare(`INSERT INTO user (user_id, email, password, salt, type) VALUES (?, ?, 'x', 'x', ?)`).bind(uid, mail, role.role_id).run();
		await env.db.prepare('INSERT INTO account (account_id, email, user_id) VALUES (?, ?, ?)').bind(acc, mail, uid).run();
	}
});

describe('bcc on on-site delivery', () => {
	it('keeps the Bcc list off every recipient copy', async () => {
		const bcc = JSON.stringify([{ address: 'hidden@psg.test', name: '' }]);
		const row = await env.db.prepare(
			`INSERT INTO email (send_email, name, account_id, user_id, subject, text, content, type, status, recipient, bcc)
			 VALUES ('boss@psg.test', 'Boss', ?, ?, 'Bcc check', 'hi', '<p>hi</p>', ?, ?, '[{"address":"to@psg.test"}]', ?) RETURNING *`
		).bind(SENDER_ACC, SENDER, emailConst.type.SEND, emailConst.status.SENT, bcc).first();
		const sent = {
			emailId: row.email_id, sendEmail: row.send_email, name: row.name, accountId: row.account_id,
			userId: row.user_id, subject: row.subject, text: row.text, content: row.content, type: row.type,
			status: row.status, recipient: row.recipient, cc: '[]', bcc,
		};

		await emailService.HandleOnSiteEmail(makeCtx(), ['to@psg.test', 'hidden@psg.test'], sent, []);

		const { results } = await env.db.prepare(
			`SELECT user_id, bcc FROM email WHERE subject = 'Bcc check' AND type = ? ORDER BY user_id`
		).bind(emailConst.type.RECEIVE).all();
		expect(results.map(r => r.user_id)).toEqual([TO_USER, BCC_USER]);
		for (const r of results) expect(JSON.parse(r.bcc || '[]')).toEqual([]);

		// The sender's own copy still lists who was blind-copied.
		const own = await env.db.prepare('SELECT bcc FROM email WHERE email_id = ?').bind(row.email_id).first();
		expect(JSON.parse(own.bcc)).toHaveLength(1);
	});
});

describe('bcc-only mail', () => {
	it('refuses a mail with no To, Cc or Bcc', async () => {
		await expect(emailService.send(makeCtx(), { accountId: SENDER_ACC, receiveEmail: [], cc: [], bcc: [], subject: 's', content: '<p>x</p>' }, SENDER))
			.rejects.toThrow();
	});

	it('addresses the provider To to the sender and keeps the Bcc out of To', async () => {
		const real = await settingService.query(makeCtx());
		const setting = vi.spyOn(settingService, 'query').mockResolvedValue({ ...real, send: 0, domainList: ['@psg.test'], resendTokens: { 'psg.test': 're_test' } });
		const role = vi.spyOn(roleService, 'selectById').mockResolvedValue({ sendType: 'count', sendCount: 0, availDomain: '' });
		// Stop right after the provider call: only its arguments matter here.
		const resend = vi.spyOn(emailService, 'sendByResend').mockResolvedValue({ error: { message: 'stop' } });
		try {
			await expect(emailService.send(makeCtx(), {
				accountId: SENDER_ACC, receiveEmail: [], bcc: ['someone@outside.test'], subject: 'Bcc only', content: '<p>hi</p>',
			}, SENDER)).rejects.toThrow('stop');
			const params = resend.mock.calls[0][1];
			expect(params.receiveEmail).toEqual(['boss@psg.test']);
			expect(params.bcc).toEqual(['someone@outside.test']);
		} finally {
			setting.mockRestore();
			role.mockRestore();
			resend.mockRestore();
		}
	});
});
