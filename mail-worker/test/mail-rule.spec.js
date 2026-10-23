// Subject keywords rules run in the worker on incoming mail (they used to be
// browser-only and missed anything that arrived while no tab was open).
import { env } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import mailRuleService, { ruleMatches } from '../src/service/mail-rule-service';
import { emailConst } from '../src/const/entity-const';
import { setupFullSchema, makeCtx } from './helpers/full-schema';

async function insertMail(userId, subject, sendEmail = 'a@x.com') {
	const res = await env.db.prepare(
		`INSERT INTO email (send_email, name, account_id, user_id, subject, text, content, unread) VALUES (?, 'A', 1, ?, ?, '', '', ?)`
	).bind(sendEmail, userId, subject, emailConst.unread.UNREAD).run();
	return { emailId: res.meta.last_row_id, subject, sendEmail, name: 'A' };
}

describe('ruleMatches', () => {
	it('matches subject and sender case-insensitively', () => {
		expect(ruleMatches({ conditionType: 'subject', conditionValue: 'Invoice' }, { subject: 'your invoice #3' })).toBe(true);
		expect(ruleMatches({ conditionType: 'sender', conditionValue: 'bank.com' }, { sendEmail: 'no@Bank.com' })).toBe(true);
		expect(ruleMatches({ conditionType: 'subject', conditionValue: '' }, { subject: 'x' })).toBe(false);
		expect(ruleMatches({ conditionType: 'all' }, { subject: 'x' })).toBe(true);
	});
});

describe('mail rules', () => {
	beforeAll(setupFullSchema);

	it('stars, archives and marks read matching incoming mail', async () => {
		const c = makeCtx();
		await mailRuleService.create(c, 501, { name: 'a', conditionType: 'subject', conditionValue: 'invoice', action: 'star' });
		await mailRuleService.create(c, 501, { name: 'b', conditionType: 'subject', conditionValue: 'invoice', action: 'archive' });
		await mailRuleService.create(c, 501, { name: 'c', conditionType: 'sender', conditionValue: 'news@', action: 'markRead' });
		const hit = await insertMail(501, 'Invoice 42');
		await mailRuleService.applyIncoming(c, 501, hit);
		const row = await env.db.prepare('SELECT is_archive, unread FROM email WHERE email_id = ?').bind(hit.emailId).first();
		const star = await env.db.prepare('SELECT 1 AS s FROM star WHERE user_id = 501 AND email_id = ?').bind(hit.emailId).first();
		expect(row.is_archive).toBe(1);
		expect(row.unread).toBe(emailConst.unread.UNREAD);
		expect(star?.s).toBe(1);

		const news = await insertMail(501, 'Weekly', 'news@x.com');
		await mailRuleService.applyIncoming(c, 501, news);
		const newsRow = await env.db.prepare('SELECT is_archive, unread FROM email WHERE email_id = ?').bind(news.emailId).first();
		expect(newsRow.unread).toBe(emailConst.unread.READ);
		expect(newsRow.is_archive).toBe(0);
	});

	it('ignores disabled rules and other users\' rules', async () => {
		const c = makeCtx();
		const r = await mailRuleService.create(c, 502, { name: 'x', conditionType: 'all', action: 'archive' });
		await mailRuleService.update(c, 502, { ...r, enabled: false });
		const mail = await insertMail(503, 'anything');
		await mailRuleService.applyIncoming(c, 503, mail);
		const mine = await insertMail(502, 'anything');
		await mailRuleService.applyIncoming(c, 502, mine);
		for (const id of [mail.emailId, mine.emailId]) {
			const row = await env.db.prepare('SELECT is_archive FROM email WHERE email_id = ?').bind(id).first();
			expect(row.is_archive).toBe(0);
		}
	});

	it('cannot edit or delete another user\'s rule', async () => {
		const c = makeCtx();
		const r = await mailRuleService.create(c, 504, { name: 'x', conditionType: 'subject', conditionValue: 'k', action: 'star' });
		await expect(mailRuleService.update(c, 505, { ...r, name: 'hijack' })).rejects.toThrow();
		await mailRuleService.remove(c, 505, r.id);
		expect(await mailRuleService.list(c, 504)).toHaveLength(1);
	});

	it('imports browser rules once, and never on top of existing server rules', async () => {
		const c = makeCtx();
		const local = [
			{ name: 'l1', conditionType: 'subject', conditionValue: 'a', action: 'star', enabled: true },
			{ name: 'bad', conditionType: 'subject', conditionValue: '', action: 'star' },
		];
		expect(await mailRuleService.importLocal(c, 506, local)).toHaveLength(1);
		expect(await mailRuleService.importLocal(c, 506, local)).toHaveLength(1);
	});
});
