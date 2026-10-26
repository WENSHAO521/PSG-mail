// Web audit fixes (2026-10-26): folder counts, unread counts, read-all,
// empty folder, Reply-To, conversation, server drafts and sending by reference.
import { env } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import { setupFullSchema, makeCtx } from './helpers/full-schema';
import emailService from '../src/service/email-service';
import draftService from '../src/service/draft-service';
import { emailConst } from '../src/const/entity-const';

const U = 9100; // user
const A1 = 9101, A2 = 9102, OTHER = 9199;

async function addMail(fields) {
	const f = { account_id: A1, user_id: U, type: 0, is_del: 0, unread: emailConst.unread.UNREAD, subject: 's',
		send_email: 'x@out.test', message_id: '', in_reply_to: '', relation: '', ...fields };
	const cols = Object.keys(f);
	const row = await env.db.prepare(
		`INSERT INTO email (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')}) RETURNING email_id`
	).bind(...Object.values(f)).first();
	return row.email_id;
}

beforeAll(async () => {
	await setupFullSchema();
	for (const [id, user, mail] of [[A1, U, 'a1@x.test'], [A2, U, 'a2@x.test'], [OTHER, 9200, 'o@x.test']]) {
		await env.db.prepare('INSERT INTO account (account_id, email, user_id) VALUES (?,?,?)').bind(id, mail, user).run();
	}
});

describe('folder counts', () => {
	it('Inbox total leaves out archived mail; Archive total is the whole folder', async () => {
		await addMail({ subject: 'inbox' });
		await addMail({ subject: 'archived', is_archive: 1 });
		await addMail({ subject: 'archived2', is_archive: 1, account_id: A2 });
		const inbox = await emailService.list(makeCtx(), { accountId: A1, allReceive: 0, type: 0, size: 20, timeSort: 0 }, U);
		expect(inbox.total).toBe(inbox.list.length);
		const archive = await emailService.archiveList(makeCtx(), { accountId: A1, allReceive: 1, size: 1 }, U);
		expect(archive.list.length).toBe(1);
		expect(archive.total).toBe(2);
		const page2 = await emailService.archiveList(makeCtx(), { accountId: A1, allReceive: 1, size: 1, emailId: archive.list[0].emailId }, U);
		expect(page2.total).toBe(null);
	});
});

describe('unread counts and read-all', () => {
	it('counts unread Inbox mail per account and marks a whole Inbox read', async () => {
		await addMail({ account_id: A2, subject: 'u2' });
		await addMail({ account_id: OTHER, user_id: 9200, subject: 'not mine' });
		const before = await emailService.unreadCounts(makeCtx(), U);
		expect(before.accounts[A2]).toBeGreaterThan(0);
		expect(before.accounts[OTHER]).toBeUndefined();
		await emailService.readAll(makeCtx(), { accountId: A2, allReceive: 0 }, U);
		const after = await emailService.unreadCounts(makeCtx(), U);
		expect(after.accounts[A2]).toBeUndefined();
		expect(after.accounts[A1]).toBe(before.accounts[A1]);
	});

	it('the Unread filter returns only unread mail', async () => {
		const res = await emailService.list(makeCtx(), { accountId: A1, allReceive: 0, type: 0, size: 50, timeSort: 0, unread: 1 }, U);
		expect(res.list.every(e => e.unread === emailConst.unread.UNREAD)).toBe(true);
	});
});

describe('empty folder', () => {
	it('erases the caller\'s Deleted mail and nobody else\'s', async () => {
		await addMail({ is_del: 1, subject: 'trash1' });
		const theirs = await addMail({ account_id: OTHER, user_id: 9200, is_del: 1 });
		const res = await emailService.emptyFolder(makeCtx(), { folder: 'trash', accountId: A1, allReceive: 1 }, U);
		expect(res.deleted).toBeGreaterThan(0);
		const left = await env.db.prepare('SELECT COUNT(*) AS n FROM email WHERE user_id = ? AND is_del = 1').bind(U).first();
		expect(left.n).toBe(0);
		expect(await env.db.prepare('SELECT 1 FROM email WHERE email_id = ?').bind(theirs).first()).not.toBe(null);
	});
});

describe('Reply-To and conversation', () => {
	it('stores Reply-To unless it only repeats From', async () => {
		const id = await addMail({ send_email: 'bob@out.test' });
		await emailService.saveReplyTo(makeCtx(), id, [{ address: 'bob@out.test' }], 'bob@out.test');
		expect((await emailService.detail(makeCtx(), id, U)).replyTo).toBe('');
		await emailService.saveReplyTo(makeCtx(), id, [{ address: 'help@out.test', name: 'Help' }], 'bob@out.test');
		expect(JSON.parse((await emailService.detail(makeCtx(), id, U)).replyTo)[0].address).toBe('help@out.test');
	});

	it('finds the other mails of a thread through In-Reply-To and References', async () => {
		const a = await addMail({ message_id: '<a@t>', subject: 'T' });
		const b = await addMail({ message_id: '<b@t>', in_reply_to: '<a@t>', relation: '<a@t>', subject: 'Re: T' });
		const c = await addMail({ message_id: '<c@t>', in_reply_to: '<b@t>', relation: '<a@t> <b@t>', subject: 'Re: T' });
		await addMail({ message_id: '<z@t>', subject: 'unrelated' });
		await addMail({ account_id: OTHER, user_id: 9200, in_reply_to: '<a@t>', subject: 'someone else' });
		const ids = (await emailService.thread(makeCtx(), b, U)).map(e => e.emailId);
		expect(ids).toEqual([a, c]);
	});
});

describe('server drafts and attachments by reference', () => {
	it('stores new attachments once, keeps references, and lets send() load them', async () => {
		const content = btoa('draft body');
		const saved = await draftService.save(makeCtx(), U, {
			subject: 'd', content: '<p>d</p>', receiveEmail: ['x@y.test'],
			attachments: [{ content, filename: 'a.txt', contentType: 'text/plain' }],
		});
		const ref = saved.attachments[0];
		expect(ref.draftAttKey.startsWith(`draft-att/${U}/`)).toBe(true);
		expect(ref.content).toBeUndefined();

		const again = await draftService.save(makeCtx(), U, { ...saved, subject: 'd2' });
		expect(again.draftId).toBe(saved.draftId);
		expect(again.attachments[0].draftAttKey).toBe(ref.draftAttKey);

		const resolved = await emailService.resolveForwardedAttachments(makeCtx(), [ref], U);
		expect(atob(resolved[0].content)).toBe('draft body');
		// Another user's draft key, and an attachment of mail they can't read, are dropped.
		const foreign = await emailService.resolveForwardedAttachments(makeCtx(), [ref], 9200);
		expect(foreign).toEqual([]);

		expect((await draftService.list(makeCtx(), 9200)).length).toBe(0);
		await draftService.remove(makeCtx(), U, [saved.draftId]);
		expect((await draftService.list(makeCtx(), U)).length).toBe(0);
	});
});
