// Regression coverage for real backend mail search (previously the frontend
// only .filter()'d an already-fetched page — see search-service.js's
// header). Covers operator parsing, combined queries, folder scoping, and
// — critically — that search never leaks another user's mail.
import { env } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import searchService, { parseSearchQuery } from '../src/service/search-service';
import labelService from '../src/service/label-service';
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

async function insertEmail(row) {
	await env.db.prepare(
		`INSERT INTO email (email_id, account_id, user_id, send_email, name, to_email, subject, text, content,
			status, is_del, is_archive, is_spam, type, unread, create_time)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
	).bind(
		row.emailId, row.accountId, row.userId, row.sendEmail || '', row.name || '', row.toEmail || '',
		row.subject || '', row.text || '', row.content || '',
		row.status ?? emailConst.status.RECEIVE, row.isDel ?? isDel.NORMAL, row.isArchive ?? 0, row.isSpam ?? 0,
		row.type ?? emailConst.type.RECEIVE, row.unread ?? 0, row.createTime || '2026-01-15 10:00:00'
	).run();
}

describe('parseSearchQuery()', () => {
	it('parses operators, quoted operator values, and free-text keywords', () => {
		const tokens = parseSearchQuery('from:@crossref.org subject:"revision request" has:attachment manuscript');
		expect(tokens).toEqual([
			{ op: 'from', value: '@crossref.org' },
			{ op: 'subject', value: 'revision request' },
			{ op: 'has', value: 'attachment' },
			{ op: null, value: 'manuscript' },
		]);
	});

	it('treats an unrecognized "word:value" as a plain keyword, not a broken operator', () => {
		const tokens = parseSearchQuery('meeting at 10:30');
		expect(tokens).toEqual([
			{ op: null, value: 'meeting' },
			{ op: null, value: 'at' },
			{ op: null, value: '10:30' },
		]);
	});
});

describe('searchService.search() — operators', () => {
	it('from: matches sender address or name', async () => {
		const ctx = makeCtx();
		await insertEmail({ emailId: 6001, accountId: 1, userId: 6001, sendEmail: 'editor@crossref.org', subject: 'hello' });
		await insertEmail({ emailId: 6002, accountId: 1, userId: 6001, sendEmail: 'someone@else.com', subject: 'unrelated' });

		const data = await searchService.search(ctx, { query: 'from:crossref.org', accountId: 1, allReceive: 1 }, 6001);
		expect(data.list.map(r => r.emailId)).toEqual([6001]);
	});

	it('subject: matches case-insensitively', async () => {
		const ctx = makeCtx();
		await insertEmail({ emailId: 6011, accountId: 1, userId: 6011, subject: 'Manuscript Revision Request' });
		const data = await searchService.search(ctx, { query: 'subject:"revision request"', accountId: 1, allReceive: 1 }, 6011);
		expect(data.list.map(r => r.emailId)).toEqual([6011]);
	});

	it('after:/before: bound by date', async () => {
		const ctx = makeCtx();
		await insertEmail({ emailId: 6021, accountId: 1, userId: 6021, subject: 'old', createTime: '2025-06-01 10:00:00' });
		await insertEmail({ emailId: 6022, accountId: 1, userId: 6021, subject: 'new', createTime: '2026-03-01 10:00:00' });

		const afterData = await searchService.search(ctx, { query: 'after:2026-01-01', accountId: 1, allReceive: 1 }, 6021);
		expect(afterData.list.map(r => r.emailId)).toEqual([6022]);

		const beforeData = await searchService.search(ctx, { query: 'before:2026-01-01', accountId: 1, allReceive: 1 }, 6021);
		expect(beforeData.list.map(r => r.emailId)).toEqual([6021]);
	});

	it('has:attachment only matches emails with a real (non-embedded) attachment', async () => {
		const ctx = makeCtx();
		await insertEmail({ emailId: 6031, accountId: 1, userId: 6031, subject: 'with attachment' });
		await insertEmail({ emailId: 6032, accountId: 1, userId: 6031, subject: 'no attachment' });
		await env.db.prepare(
			`INSERT INTO attachments (user_id, email_id, account_id, key, filename, type) VALUES (6031, 6031, 1, 'k', 'f.pdf', 0)`
		).run();

		const data = await searchService.search(ctx, { query: 'has:attachment', accountId: 1, allReceive: 1 }, 6031);
		expect(data.list.map(r => r.emailId)).toEqual([6031]);
	});

	it('is:unread / is:starred', async () => {
		const ctx = makeCtx();
		await insertEmail({ emailId: 6041, accountId: 1, userId: 6041, subject: 'a', unread: 0 });
		await insertEmail({ emailId: 6042, accountId: 1, userId: 6041, subject: 'b', unread: 1 });
		await env.db.prepare(`INSERT INTO star (email_id, user_id) VALUES (6042, 6041)`).run();

		const unread = await searchService.search(ctx, { query: 'is:unread', accountId: 1, allReceive: 1 }, 6041);
		expect(unread.list.map(r => r.emailId)).toEqual([6041]);

		const starred = await searchService.search(ctx, { query: 'is:starred', accountId: 1, allReceive: 1 }, 6041);
		expect(starred.list.map(r => r.emailId)).toEqual([6042]);
	});

	it('in:trash overrides the default is_del=NORMAL scope', async () => {
		const ctx = makeCtx();
		await insertEmail({ emailId: 6051, accountId: 1, userId: 6051, subject: 'deleted mail', isDel: isDel.DELETE });

		const defaultScope = await searchService.search(ctx, { query: 'deleted', accountId: 1, allReceive: 1 }, 6051);
		expect(defaultScope.list.map(r => r.emailId)).not.toContain(6051);

		const trashScope = await searchService.search(ctx, { query: 'in:trash deleted', accountId: 1, allReceive: 1 }, 6051);
		expect(trashScope.list.map(r => r.emailId)).toEqual([6051]);
	});

	it('label: matches emails carrying that label, case-insensitively', async () => {
		const ctx = makeCtx();
		await insertEmail({ emailId: 6061, accountId: 1, userId: 6061, subject: 'labeled' });
		const label = await labelService.create(ctx, { name: 'CRoPT' }, 6061);
		await labelService.apply(ctx, { labelId: label.labelId, emailIds: [6061] }, 6061);

		const data = await searchService.search(ctx, { query: 'label:cropt', accountId: 1, allReceive: 1 }, 6061);
		expect(data.list.map(r => r.emailId)).toEqual([6061]);
	});

	it('combines multiple operators and free text with AND semantics', async () => {
		const ctx = makeCtx();
		await insertEmail({ emailId: 6071, accountId: 1, userId: 6071, sendEmail: 'a@crossref.org', subject: 'manuscript revision', unread: 1 });
		await insertEmail({ emailId: 6072, accountId: 1, userId: 6071, sendEmail: 'a@crossref.org', subject: 'manuscript revision', unread: 0 });
		await insertEmail({ emailId: 6073, accountId: 1, userId: 6071, sendEmail: 'other@x.com', subject: 'manuscript revision', unread: 1 });

		const data = await searchService.search(ctx, { query: 'from:crossref.org is:unread manuscript', accountId: 1, allReceive: 1 }, 6071);
		expect(data.list.map(r => r.emailId)).toEqual([6072]);
	});

	it('an empty query returns no results rather than the whole mailbox', async () => {
		const ctx = makeCtx();
		await insertEmail({ emailId: 6081, accountId: 1, userId: 6081, subject: 'anything' });
		const data = await searchService.search(ctx, { query: '   ', accountId: 1, allReceive: 1 }, 6081);
		expect(data.list).toEqual([]);
	});
});

describe('searchService.search() — access control', () => {
	it('never returns another user\'s mail, even for a matching keyword', async () => {
		const ctx = makeCtx();
		await insertEmail({ emailId: 6091, accountId: 1, userId: 6091, subject: 'shared keyword secret' });
		await insertEmail({ emailId: 6092, accountId: 2, userId: 6092, subject: 'shared keyword secret' });

		const data = await searchService.search(ctx, { query: 'secret', accountId: 1, allReceive: 1 }, 6091);
		expect(data.list.map(r => r.emailId)).toEqual([6091]);
	});

	it('respects accountId scoping when allReceive is off', async () => {
		const ctx = makeCtx();
		await insertEmail({ emailId: 6101, accountId: 10, userId: 6101, subject: 'account ten mail' });
		await insertEmail({ emailId: 6102, accountId: 11, userId: 6101, subject: 'account eleven mail' });

		const data = await searchService.search(ctx, { query: 'mail', accountId: 10, allReceive: 0 }, 6101);
		expect(data.list.map(r => r.emailId)).toEqual([6101]);
	});
});
