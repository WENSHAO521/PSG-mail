// Rule actions (label / spam / trash), snooze and .eml import.
import { env } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import mailRuleService from '../src/service/mail-rule-service';
import emailService from '../src/service/email-service';
import importService from '../src/service/import-service';
import { emailConst } from '../src/const/entity-const';
import { setupFullSchema, makeCtx } from './helpers/full-schema';

const USER = 9601, OTHER = 9602, ACC = 9611;

async function insertMail(userId, subject, extra = '') {
	const res = await env.db.prepare(
		`INSERT INTO email (send_email, name, account_id, user_id, subject, text, content, unread, type) VALUES ('a@x.com', 'A', ?, ?, ?, '', '', ?, 0)`
	).bind(ACC, userId, subject, emailConst.unread.READ).run();
	return { emailId: res.meta.last_row_id, subject, sendEmail: 'a@x.com', name: 'A' };
}

beforeAll(async () => {
	await setupFullSchema();
	const role = await env.db.prepare('SELECT role_id FROM role LIMIT 1').first();
	await env.db.prepare(`INSERT INTO user (user_id, email, password, salt, type) VALUES (?, 'me@psg.test', 'x', 'x', ?)`).bind(USER, role.role_id).run();
	await env.db.prepare('INSERT INTO account (account_id, email, user_id) VALUES (?, ?, ?)').bind(ACC, 'me@psg.test', USER).run();
});

describe('rule actions', () => {
	it('adds a label, and silences mail it sends to spam', async () => {
		const c = makeCtx();
		const label = await env.db.prepare(`INSERT INTO mail_label (user_id, name) VALUES (?, 'Grants') RETURNING label_id`).bind(USER).first();
		await mailRuleService.create(c, USER, { name: 'l', conditionType: 'subject', conditionValue: 'grant', action: 'label', actionValue: label.label_id });
		await mailRuleService.create(c, USER, { name: 's', conditionType: 'subject', conditionValue: 'casino', action: 'spam' });

		const grant = await insertMail(USER, 'Grant update');
		expect(await mailRuleService.applyIncoming(c, USER, grant)).toEqual({ silent: false });
		const linked = await env.db.prepare('SELECT 1 AS ok FROM mail_label_email WHERE label_id = ? AND email_id = ?').bind(label.label_id, grant.emailId).first();
		expect(linked?.ok).toBe(1);

		const spam = await insertMail(USER, 'Casino bonus');
		expect(await mailRuleService.applyIncoming(c, USER, spam)).toEqual({ silent: true });
		const row = await env.db.prepare('SELECT is_spam FROM email WHERE email_id = ?').bind(spam.emailId).first();
		expect(row.is_spam).toBe(1);
	});

	it('refuses a label rule pointing at someone else\'s label', async () => {
		const other = await env.db.prepare(`INSERT INTO mail_label (user_id, name) VALUES (?, 'Theirs') RETURNING label_id`).bind(OTHER).first();
		await expect(mailRuleService.create(makeCtx(), USER, { name: 'x', conditionType: 'all', action: 'label', actionValue: other.label_id })).rejects.toThrow();
	});
});

describe('snooze', () => {
	it('archives now and returns the mail unread when due', async () => {
		const c = makeCtx();
		const mail = await insertMail(USER, 'Later please');
		await emailService.snooze(c, { emailIds: String(mail.emailId), until: Date.now() + 60_000 }, USER);
		let row = await env.db.prepare('SELECT is_archive FROM email WHERE email_id = ?').bind(mail.emailId).first();
		expect(row.is_archive).toBe(1);
		const { list } = await emailService.snoozeList(c, {}, USER);
		expect(list.map(e => e.emailId)).toContain(mail.emailId);

		// Not yet due: nothing happens.
		expect(await emailService.processDueSnoozes(c)).toBe(0);
		await env.db.prepare('UPDATE psg_snooze SET until = ? WHERE email_id = ?').bind(Date.now() - 1, mail.emailId).run();
		expect(await emailService.processDueSnoozes(c)).toBe(1);
		row = await env.db.prepare('SELECT is_archive, unread FROM email WHERE email_id = ?').bind(mail.emailId).first();
		expect(row.is_archive).toBe(0);
		expect(row.unread).toBe(emailConst.unread.UNREAD);
	});

	it('does not snooze another user\'s mail or into the past', async () => {
		const c = makeCtx();
		const theirs = await insertMail(OTHER, 'Not yours');
		await emailService.snooze(c, { emailIds: String(theirs.emailId), until: Date.now() + 60_000 }, USER);
		const z = await env.db.prepare('SELECT 1 AS ok FROM psg_snooze WHERE email_id = ?').bind(theirs.emailId).first();
		expect(z).toBeNull();
		const mine = await insertMail(USER, 'Past');
		await expect(emailService.snooze(c, { emailIds: String(mine.emailId), until: Date.now() - 1000 }, USER)).rejects.toThrow();
	});
});

describe('import .eml', () => {
	const eml = [
		'From: "Prof. Li" <li@uni.example>',
		'To: me@psg.test',
		'Subject: =?UTF-8?B?5oqV56i/5Zue5aSN?=',
		'Date: Tue, 01 Sep 2026 08:30:00 +0000',
		'Message-ID: <abc@uni.example>',
		'MIME-Version: 1.0',
		'Content-Type: text/plain; charset=UTF-8',
		'',
		'Hello',
	].join('\r\n');

	it('stores the mail in the inbox with its original date', async () => {
		const c = makeCtx();
		const content = btoa(eml);
		const res = await importService.importEml(c, USER, { accountId: ACC, content });
		const row = await env.db.prepare('SELECT subject, send_email, type, is_del, create_time, unread FROM email WHERE email_id = ?').bind(res.emailId).first();
		expect(row.subject).toBe('投稿回复');
		expect(row.send_email).toBe('li@uni.example');
		expect(row.type).toBe(emailConst.type.RECEIVE);
		expect(row.is_del).toBe(0);
		expect(row.unread).toBe(emailConst.unread.READ);
		expect(row.create_time).toBe('2026-09-01 08:30:00');
	});

	it('refuses a mailbox the user does not own', async () => {
		await expect(importService.importEml(makeCtx(), OTHER, { accountId: ACC, content: btoa(eml) })).rejects.toThrow();
	});
});
