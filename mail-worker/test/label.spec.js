// Regression coverage for user Labels (many-to-many via mail_label_email —
// see label-service.js's header for why not a comma-separated column), and
// for the snake_case/camelCase row-shape bug found while wiring labels into
// archiveList()/spamList()/trashList() (see mapRawEmailRow in
// email-service.js): those three raw-SQL list methods never mapped
// email_id -> emailId, so every row's emailId was undefined — attachments
// never resolved and the frontend couldn't key/select/star/delete rows in
// Archive/Spam/Trash at all.
import { env } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import labelService from '../src/service/label-service';
import emailService from '../src/service/email-service';
import { emailConst, isDel } from '../src/const/entity-const';

function makeCtx() {
	const store = new Map();
	return { env, get: (k) => store.get(k), set: (k, v) => store.set(k, v) };
}

const SCHEMA = [
	`CREATE TABLE IF NOT EXISTS email (
		email_id INTEGER PRIMARY KEY AUTOINCREMENT,
		send_email TEXT, name TEXT, account_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
		subject TEXT, code TEXT DEFAULT '', text TEXT, content TEXT, cc TEXT DEFAULT '[]', bcc TEXT DEFAULT '[]',
		recipient TEXT, to_email TEXT DEFAULT '', to_name TEXT DEFAULT '', in_reply_to TEXT DEFAULT '',
		relation TEXT DEFAULT '', message_id TEXT DEFAULT '', type INTEGER DEFAULT 0 NOT NULL,
		status INTEGER DEFAULT 0 NOT NULL, resend_email_id TEXT, message TEXT, unread INTEGER DEFAULT 0 NOT NULL,
		create_time TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL, is_del INTEGER DEFAULT 0 NOT NULL,
		is_archive INTEGER DEFAULT 0 NOT NULL, is_spam INTEGER DEFAULT 0 NOT NULL, delete_time TEXT
	)`,
	`CREATE TABLE IF NOT EXISTS account (
		account_id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL, name TEXT NOT NULL DEFAULT '',
		status INTEGER DEFAULT 0 NOT NULL, latest_email_time TEXT, create_time TEXT DEFAULT CURRENT_TIMESTAMP,
		user_id INTEGER NOT NULL, all_receive INTEGER DEFAULT 0 NOT NULL, sort INTEGER DEFAULT 0 NOT NULL,
		is_del INTEGER DEFAULT 0 NOT NULL
	)`,
	`CREATE TABLE IF NOT EXISTS star (star_id INTEGER PRIMARY KEY AUTOINCREMENT, email_id INTEGER NOT NULL, user_id INTEGER NOT NULL)`,
	`CREATE TABLE IF NOT EXISTS attachments (
		att_id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, email_id INTEGER NOT NULL,
		account_id INTEGER NOT NULL, key TEXT NOT NULL, filename TEXT, mime_type TEXT, size INTEGER,
		status TEXT DEFAULT 0 NOT NULL, type INTEGER DEFAULT 0 NOT NULL, disposition TEXT, related TEXT,
		content_id TEXT, encoding TEXT, create_time TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
	)`,
	`CREATE TABLE IF NOT EXISTS mail_label (
		label_id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, name TEXT NOT NULL,
		color TEXT NOT NULL DEFAULT '#7e7576', sort_order INTEGER NOT NULL DEFAULT 0,
		create_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, update_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
	)`,
	`CREATE TABLE IF NOT EXISTS mail_label_email (
		label_id INTEGER NOT NULL, email_id INTEGER NOT NULL, create_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
		PRIMARY KEY (label_id, email_id)
	)`,
];

beforeAll(async () => {
	for (const sql of SCHEMA) await env.db.prepare(sql).run();
});

async function insertAccountAndEmail({ accountId, emailId, userId, isArchive = 0, isSpam = 0, isDelVal = isDel.NORMAL }) {
	await env.db.prepare(`INSERT INTO account (account_id, email, user_id, is_del) VALUES (?, ?, ?, 0)`)
		.bind(accountId, `acct${accountId}@example.com`, userId).run();
	await env.db.prepare(
		`INSERT INTO email (email_id, account_id, user_id, subject, status, is_del, is_archive, is_spam, type)
		 VALUES (?, ?, ?, ?, ${emailConst.status.RECEIVE}, ?, ?, ?, ${emailConst.type.RECEIVE})`
	).bind(emailId, accountId, userId, `subject-${emailId}`, isDelVal, isArchive, isSpam).run();
}

describe('labelService CRUD + ownership', () => {
	it('creates, lists (with email counts), renames, and deletes a label', async () => {
		const ctx = makeCtx();
		const created = await labelService.create(ctx, { name: 'CRoPT', color: '#c48c00' }, 2001);
		expect(created.name).toBe('CRoPT');

		let list = await labelService.list(ctx, 2001);
		expect(list.find(l => l.labelId === created.labelId).emailCount).toBe(0);

		const renamed = await labelService.update(ctx, created.labelId, { name: 'Crossref', color: '#111' }, 2001);
		expect(renamed.name).toBe('Crossref');

		await labelService.remove(ctx, created.labelId, 2001);
		list = await labelService.list(ctx, 2001);
		expect(list.find(l => l.labelId === created.labelId)).toBeUndefined();
	});

	it('rejects operating on a label owned by another user', async () => {
		const ctx = makeCtx();
		const created = await labelService.create(ctx, { name: 'private label' }, 2002);
		await expect(labelService.update(ctx, created.labelId, { name: 'stolen' }, 2003)).rejects.toThrow();
		await expect(labelService.remove(ctx, created.labelId, 2003)).rejects.toThrow();
		await expect(labelService.apply(ctx, { labelId: created.labelId, emailIds: [1] }, 2003)).rejects.toThrow();
	});

	it('rejects an empty label name', async () => {
		const ctx = makeCtx();
		await expect(labelService.create(ctx, { name: '   ' }, 2004)).rejects.toThrow();
	});
});

describe('labelService.apply()/removeFromEmails() — access scoping', () => {
	it('only labels emails the caller actually owns, silently skipping the rest', async () => {
		const ctx = makeCtx();
		await insertAccountAndEmail({ accountId: 3001, emailId: 3001, userId: 3001 });
		await insertAccountAndEmail({ accountId: 3002, emailId: 3002, userId: 3002 }); // someone else's mail

		const label = await labelService.create(ctx, { name: 'mine' }, 3001);
		const applyResult = await labelService.apply(ctx, { labelId: label.labelId, emailIds: [3001, 3002] }, 3001);
		expect(applyResult.applied).toBe(1); // only 3001, not 3002

		const list = await labelService.list(ctx, 3001);
		expect(list.find(l => l.labelId === label.labelId).emailCount).toBe(1);
	});

	it('applying the same label to the same email twice does not create duplicate rows', async () => {
		const ctx = makeCtx();
		await insertAccountAndEmail({ accountId: 3003, emailId: 3003, userId: 3003 });
		const label = await labelService.create(ctx, { name: 'dedupe' }, 3003);
		await labelService.apply(ctx, { labelId: label.labelId, emailIds: [3003] }, 3003);
		await labelService.apply(ctx, { labelId: label.labelId, emailIds: [3003] }, 3003);

		const list = await labelService.list(ctx, 3003);
		expect(list.find(l => l.labelId === label.labelId).emailCount).toBe(1);
	});

	it('removeFromEmails un-labels without touching the email itself', async () => {
		const ctx = makeCtx();
		await insertAccountAndEmail({ accountId: 3004, emailId: 3004, userId: 3004 });
		const label = await labelService.create(ctx, { name: 'temp' }, 3004);
		await labelService.apply(ctx, { labelId: label.labelId, emailIds: [3004] }, 3004);
		await labelService.removeFromEmails(ctx, { labelId: label.labelId, emailIds: [3004] }, 3004);

		const list = await labelService.list(ctx, 3004);
		expect(list.find(l => l.labelId === label.labelId).emailCount).toBe(0);

		const row = await env.db.prepare('SELECT is_del FROM email WHERE email_id = ?').bind(3004).first();
		expect(row.is_del).toBe(isDel.NORMAL);
	});
});

describe('labelService.attachLabels() wired into email-service list methods', () => {
	it('attaches labels to list() results', async () => {
		const ctx = makeCtx();
		await insertAccountAndEmail({ accountId: 4001, emailId: 4001, userId: 4001 });
		const label = await labelService.create(ctx, { name: 'Finance', color: '#2f9e52' }, 4001);
		await labelService.apply(ctx, { labelId: label.labelId, emailIds: [4001] }, 4001);

		const data = await emailService.list(ctx, { emailId: 0, type: emailConst.type.RECEIVE, accountId: 4001, size: 10, timeSort: 0, allReceive: 0 }, 4001);
		const row = data.list.find(r => r.emailId === 4001);
		expect(row.labels.map(l => l.name)).toEqual(['Finance']);
	});

	// This is the actual regression: before mapRawEmailRow, these three
	// methods returned raw snake_case rows and `row.emailId` was undefined,
	// so this exact assertion would have failed with `undefined`.
	it('archiveList()/spamList()/trashList() return camelCase emailId (not raw snake_case email_id), with labels attached', async () => {
		const ctx = makeCtx();
		await insertAccountAndEmail({ accountId: 4101, emailId: 4101, userId: 4101, isArchive: 1 });
		await insertAccountAndEmail({ accountId: 4102, emailId: 4102, userId: 4102, isSpam: 1 });
		await insertAccountAndEmail({ accountId: 4103, emailId: 4103, userId: 4103, isDelVal: isDel.DELETE });

		const archiveLabel = await labelService.create(ctx, { name: 'archived-label' }, 4101);
		await labelService.apply(ctx, { labelId: archiveLabel.labelId, emailIds: [4101] }, 4101);

		const archived = await emailService.archiveList(ctx, { emailId: 0, accountId: 4101, size: 10, allReceive: 0 }, 4101);
		expect(archived.list[0].emailId).toBe(4101);
		expect(archived.list[0].email_id).toBeUndefined();
		expect(archived.list[0].labels.map(l => l.name)).toEqual(['archived-label']);

		const spam = await emailService.spamList(ctx, { emailId: 0, accountId: 4102, size: 10, allReceive: 0 }, 4102);
		expect(spam.list[0].emailId).toBe(4102);
		expect(spam.list[0].email_id).toBeUndefined();

		const trash = await emailService.trashList(ctx, { emailId: 0, accountId: 4103, size: 10, allReceive: 0 }, 4103);
		expect(trash.list[0].emailId).toBe(4103);
		expect(trash.list[0].email_id).toBeUndefined();
	});
});

describe('labelService.emailsForLabel() — pagination + access', () => {
	it('lists only the caller\'s own emails carrying the label, paginated newest-first', async () => {
		const ctx = makeCtx();
		await insertAccountAndEmail({ accountId: 5101, emailId: 5101, userId: 5101 });
		await env.db.prepare(
			`INSERT INTO email (email_id, account_id, user_id, subject, status, is_del, type)
			 VALUES (5102, 5101, 5101, 'subject-5102', ${emailConst.status.RECEIVE}, ${isDel.NORMAL}, ${emailConst.type.RECEIVE})`
		).run();
		const label = await labelService.create(ctx, { name: 'paged' }, 5101);
		await labelService.apply(ctx, { labelId: label.labelId, emailIds: [5101, 5102] }, 5101);

		const page = await labelService.emailsForLabel(ctx, label.labelId, 5101, { emailId: 0, size: 10 });
		expect(page.list.map(r => r.emailId)).toEqual([5102, 5101]);
	});

	it('rejects listing emails for a label the caller does not own', async () => {
		const ctx = makeCtx();
		const label = await labelService.create(ctx, { name: 'not yours' }, 5201);
		await expect(labelService.emailsForLabel(ctx, label.labelId, 5202, { emailId: 0, size: 10 })).rejects.toThrow();
	});
});
