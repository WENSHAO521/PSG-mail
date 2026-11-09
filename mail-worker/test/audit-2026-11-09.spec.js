// Fixes from the 2026-11-09 review: send-path safety (attachment limit,
// no resend after delivery, attachments of queued mail kept out of the D1
// row), bulk actions over many ids, reply from Deleted, snoozed mail out of
// Archive, Inbox-only "mark all read", .eml re-import, mailbox search and
// the on-site / provider double copy.
import { env } from 'cloudflare:test';
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { setupFullSchema, makeCtx } from './helpers/full-schema';
import emailService from '../src/service/email-service';
import settingService from '../src/service/setting-service';
import roleService from '../src/service/role-service';
import attService from '../src/service/att-service';
import accountService from '../src/service/account-service';
import importService from '../src/service/import-service';
import scheduledEmailService from '../src/service/scheduled-email-service';
import r2Service from '../src/service/r2-service';
import { emailConst } from '../src/const/entity-const';

const USER = 9701, OTHER = 9702, ACC = 9711, OTHER_ACC = 9712;

async function insertMail(userId, accountId, subject, extra = {}) {
	const row = await env.db.prepare(
		`INSERT INTO email (send_email, name, account_id, user_id, subject, text, content, unread, type, message_id, is_del, is_spam, is_archive)
		 VALUES ('a@outside.test', 'A', ?, ?, ?, '', '', ?, 0, ?, ?, ?, ?) RETURNING email_id`
	).bind(accountId, userId, subject, extra.unread ?? emailConst.unread.READ, extra.messageId ?? '',
		extra.isDel ?? 0, extra.isSpam ?? 0, extra.isArchive ?? 0).first();
	return row.email_id;
}

async function withSendMocks(fn) {
	const real = await settingService.query(makeCtx());
	const spies = [
		vi.spyOn(settingService, 'query').mockResolvedValue({ ...real, send: 0, domainList: ['@psg.test'], resendTokens: { 'psg.test': 're_test' } }),
		vi.spyOn(roleService, 'selectById').mockResolvedValue({ sendType: 'count', sendCount: 0, availDomain: '' }),
	];
	const resend = vi.spyOn(emailService, 'sendByResend').mockResolvedValue({ data: { id: 'r1' } });
	try {
		await fn(resend);
	} finally {
		[...spies, resend].forEach(s => s.mockRestore());
	}
}

beforeAll(async () => {
	await setupFullSchema();
	const role = await env.db.prepare('SELECT role_id FROM role LIMIT 1').first();
	await env.db.prepare(`UPDATE role SET ban_email = '', avail_domain = '' WHERE role_id = ?`).bind(role.role_id).run();
	for (const [uid, acc, mail] of [[USER, ACC, 'me@psg.test'], [OTHER, OTHER_ACC, 'other@psg.test']]) {
		await env.db.prepare(`INSERT INTO user (user_id, email, password, salt, type) VALUES (?, ?, 'x', 'x', ?)`).bind(uid, mail, role.role_id).run();
		await env.db.prepare('INSERT INTO account (account_id, email, user_id, name) VALUES (?, ?, ?, ?)').bind(acc, mail, uid, mail === 'me@psg.test' ? 'Me' : 'Other').run();
	}
});

describe('send', () => {
	it('refuses more than 10 attachments before anything goes out', async () => {
		await withSendMocks(async resend => {
			const attachments = Array.from({ length: 11 }, (_, i) => ({ filename: `f${i}.txt`, content: btoa('x'), contentType: 'text/plain' }));
			await expect(emailService.send(makeCtx(), {
				accountId: ACC, receiveEmail: ['x@outside.test'], subject: 'too many', content: '<p>x</p>', attachments,
			}, USER)).rejects.toThrow();
			expect(resend).not.toHaveBeenCalled();
		});
	});

	it('reports a delivered mail as sent even when saving it fails afterwards', async () => {
		await withSendMocks(async resend => {
			const save = vi.spyOn(attService, 'saveSendAtt').mockRejectedValue(new Error('storage down'));
			try {
				const [result] = await emailService.send(makeCtx(), {
					accountId: ACC, receiveEmail: ['x@outside.test'], subject: 'saved later', content: '<p>x</p>',
					attachments: [{ filename: 'a.txt', content: btoa('a'), contentType: 'text/plain' }],
				}, USER);
				expect(resend).toHaveBeenCalledTimes(1);
				expect(result.saveFailed).toBe(true);
			} finally {
				save.mockRestore();
			}
		});
	});

	it('replies to own mail in Deleted, never to someone else\'s', async () => {
		const trashed = await insertMail(USER, ACC, 'old thread', { isDel: 1, messageId: '<orig@outside.test>' });
		const theirs = await insertMail(OTHER, OTHER_ACC, 'not mine', { messageId: '<theirs@outside.test>' });
		await withSendMocks(async resend => {
			await emailService.send(makeCtx(), {
				accountId: ACC, receiveEmail: ['a@outside.test'], subject: 'Re: old thread', content: '<p>x</p>', sendType: 'reply', emailId: trashed,
			}, USER);
			expect(resend.mock.calls[0][1].messageId).toBe('<orig@outside.test>');
			await expect(emailService.send(makeCtx(), {
				accountId: ACC, receiveEmail: ['a@outside.test'], subject: 'Re: x', content: '<p>x</p>', sendType: 'reply', emailId: theirs,
			}, USER)).rejects.toThrow();
		});
	});
});

describe('bulk actions', () => {
	it('handle more ids than one D1 statement may bind', async () => {
		const ids = [];
		for (let i = 0; i < 130; i++) ids.push(await insertMail(USER, ACC, `bulk ${i}`, { unread: emailConst.unread.UNREAD }));
		const c = makeCtx();
		await emailService.read(c, { emailIds: ids }, USER);
		await emailService.archiveEmail(c, { emailIds: ids.join(',') }, USER);
		await emailService.delete(c, { emailIds: ids.join(',') }, USER);
		const row = await env.db.prepare(
			`SELECT COUNT(*) AS n FROM email WHERE subject LIKE 'bulk %' AND user_id = ? AND is_del = 1 AND is_archive = 1 AND unread = ?`
		).bind(USER, emailConst.unread.READ).first();
		expect(row.n).toBe(130);
	});

	it('ignores a request without ids', async () => {
		await expect(emailService.delete(makeCtx(), {}, USER)).resolves.toBeUndefined();
	});
});

describe('folders', () => {
	it('keeps snoozed mail out of Archive', async () => {
		const c = makeCtx();
		const archived = await insertMail(USER, ACC, 'plain archive', { isArchive: 1 });
		const snoozed = await insertMail(USER, ACC, 'snoozed one');
		await emailService.snooze(c, { emailIds: String(snoozed), until: Date.now() + 60_000 }, USER);
		const { list } = await emailService.archiveList(c, { accountId: ACC, size: 50 }, USER);
		const ids = list.map(e => e.emailId);
		expect(ids).toContain(archived);
		expect(ids).not.toContain(snoozed);
	});

	it('marks only Inbox mail read with "mark all read"', async () => {
		const c = makeCtx();
		const inbox = await insertMail(USER, ACC, 'inbox unread', { unread: emailConst.unread.UNREAD });
		const spam = await insertMail(USER, ACC, 'spam unread', { unread: emailConst.unread.UNREAD, isSpam: 1 });
		const archive = await insertMail(USER, ACC, 'archive unread', { unread: emailConst.unread.UNREAD, isArchive: 1 });
		await emailService.readAll(c, { accountId: ACC }, USER);
		const state = async id => (await env.db.prepare('SELECT unread FROM email WHERE email_id = ?').bind(id).first()).unread;
		expect(await state(inbox)).toBe(emailConst.unread.READ);
		expect(await state(spam)).toBe(emailConst.unread.UNREAD);
		expect(await state(archive)).toBe(emailConst.unread.UNREAD);
	});
});

describe('import .eml', () => {
	it('skips a message already in the mailbox', async () => {
		const eml = [
			'From: Someone <someone@outside.test>', 'To: me@psg.test', 'Subject: Imported once',
			'Message-ID: <import-once@outside.test>', 'Date: Mon, 02 Mar 2026 10:00:00 +0000', '', 'Hello',
		].join('\r\n');
		const c = makeCtx();
		const first = await importService.importEml(c, USER, { accountId: ACC, content: btoa(eml) });
		const again = await importService.importEml(c, USER, { accountId: ACC, content: btoa(eml) });
		expect(first.duplicate).toBeUndefined();
		expect(again.duplicate).toBe(true);
		expect(again.emailId).toBe(first.emailId);
	});
});

describe('mailbox search', () => {
	it('filters the mailbox list by address or name', async () => {
		const c = makeCtx();
		await env.db.prepare('INSERT INTO account (email, user_id, name) VALUES (?, ?, ?), (?, ?, ?)')
			.bind('shop@psg.test', USER, 'Orders', 'news@psg.test', USER, 'Newsletter').run();
		const byAddress = await accountService.list(c, { size: 30, keyword: 'SHOP' }, USER);
		expect(byAddress.map(a => a.email)).toEqual(['shop@psg.test']);
		const byName = await accountService.list(c, { size: 30, keyword: 'letter' }, USER);
		expect(byName.map(a => a.email)).toEqual(['news@psg.test']);
		const wildcard = await accountService.list(c, { size: 30, keyword: '%' }, USER);
		expect(wildcard).toEqual([]);
	});
});

describe('scheduled send attachments', () => {
	it('keeps the bytes out of the queued row and deletes them once sent', async () => {
		const c = makeCtx();
		const content = btoa('attachment body');
		const row = await scheduledEmailService.create(c, {
			accountId: ACC, receiveEmail: ['x@outside.test'], subject: 'queued', content: '<p>x</p>',
			attachments: [{ filename: 'a.txt', content, contentType: 'text/plain', size: 15 }],
			scheduledAt: new Date(Date.now() + 60_000).toISOString().slice(0, 19).replace('T', ' '),
		}, USER);
		const stored = await env.db.prepare('SELECT payload FROM scheduled_email WHERE id = ?').bind(row.id).first();
		const [ref] = JSON.parse(stored.payload).attachments;
		expect(ref.content).toBeUndefined();
		expect(ref.schedAttKey.startsWith(`sched-att/${USER}/`)).toBe(true);

		const send = vi.spyOn(emailService, 'send').mockImplementation(async (ctx, payload, userId) => {
			const resolved = await emailService.resolveForwardedAttachments(ctx, payload.attachments, userId);
			expect(resolved[0].content).toBe(content);
			expect(resolved[0].filename).toBe('a.txt');
			return [{ emailId: 1 }];
		});
		try {
			await scheduledEmailService.sendNow(c, row.id, USER);
		} finally {
			send.mockRestore();
		}
		expect(await r2Service.getObj(c, ref.schedAttKey)).toBeFalsy();
	});

	it('never loads another user\'s queued attachment', async () => {
		const resolved = await emailService.resolveForwardedAttachments(makeCtx(),
			[{ filename: 'x', schedAttKey: `sched-att/${OTHER}/whatever.txt` }], USER);
		expect(resolved).toEqual([]);
	});
});

describe('provider copy of on-site mail', () => {
	it('pairs each returning copy with one stored on-site copy', async () => {
		const c = makeCtx();
		await env.db.prepare(
			`INSERT INTO email (send_email, name, account_id, user_id, subject, text, content, type, status)
			 VALUES ('other@psg.test', 'Other', ?, ?, 'Mixed list', '', '', 0, ?)`
		).bind(ACC, USER, emailConst.status.RECEIVE).run();
		expect(await emailService.consumeOnSiteCopy(c, ACC, 'Other@psg.test', 'Mixed list', '<m1@psg.test>')).toBe(true);
		expect(await emailService.consumeOnSiteCopy(c, ACC, 'other@psg.test', 'Mixed list', '<m2@psg.test>')).toBe(false);
		expect(await emailService.consumeOnSiteCopy(c, ACC, 'other@psg.test', 'Other subject', '<m3@psg.test>')).toBe(false);
	});
});

describe('free-plan usage', () => {
	it('counts unread Inbox mail through the partial index, not by walking every mail', async () => {
		const reader = 9799, acc = 9798;
		const role = await env.db.prepare('SELECT role_id FROM role LIMIT 1').first();
		await env.db.prepare(`INSERT INTO user (user_id, email, password, salt, type) VALUES (?, 'reader@psg.test', 'x', 'x', ?)`).bind(reader, role.role_id).run();
		await env.db.prepare('INSERT INTO account (account_id, email, user_id) VALUES (?, ?, ?)').bind(acc, 'reader@psg.test', reader).run();
		for (let b = 0; b < 10; b++) {
			await env.db.batch(Array.from({ length: 100 }, () => env.db.prepare(
				`INSERT INTO email (send_email, name, account_id, user_id, subject, text, content, unread, type) VALUES ('a@x.test', 'A', ?, ?, 'old', '', '', ?, 0)`
			).bind(acc, reader, emailConst.unread.READ)));
		}
		for (let i = 0; i < 3; i++) await insertMail(reader, acc, 'new', { unread: emailConst.unread.UNREAD });

		const reads = [];
		const wrap = stmt => ({
			bind: (...args) => wrap(stmt.bind(...args)),
			all: async () => { const r = await stmt.all(); reads.push(r.meta.rows_read); return r; },
			first: (...a) => stmt.first(...a),
			run: (...a) => stmt.run(...a),
		});
		const c = makeCtx();
		c.env = { ...env, db: { prepare: sql => wrap(env.db.prepare(sql)), batch: s => env.db.batch(s) } };

		const counts = await emailService.unreadCounts(c, reader);
		expect(counts.accounts[acc]).toBe(3);
		// 1003 Inbox mails, 3 unread: the count reads a handful of rows, not ~1000.
		expect(Math.max(...reads)).toBeLessThan(50);
	});
});
