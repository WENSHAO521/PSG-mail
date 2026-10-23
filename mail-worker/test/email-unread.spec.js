// "Mark as unread" in the reader calls PUT /email/unread; it used to 404.
import { env } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import emailService from '../src/service/email-service';
import { emailConst } from '../src/const/entity-const';

function makeCtx() {
	const store = new Map();
	return { env, get: k => store.get(k), set: (k, v) => store.set(k, v) };
}

beforeAll(async () => {
	await env.db.prepare(`CREATE TABLE IF NOT EXISTS email (
		email_id INTEGER PRIMARY KEY AUTOINCREMENT, account_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
		subject TEXT, unread INTEGER DEFAULT 0 NOT NULL, is_del INTEGER DEFAULT 0 NOT NULL)`).run();
	await env.db.prepare(`CREATE TABLE IF NOT EXISTS account_share (
		id INTEGER PRIMARY KEY AUTOINCREMENT, account_id INTEGER NOT NULL, user_id INTEGER NOT NULL, create_time TEXT)`).run();
	for (const [id, user] of [[8001, 1], [8002, 2]]) {
		await env.db.prepare('INSERT INTO email (email_id, account_id, user_id, subject, unread) VALUES (?,?,?,?,?)')
			.bind(id, id, user, 's', emailConst.unread.READ).run();
	}
});

describe('email.unread', () => {
	it('marks the caller\'s own mail unread and leaves other users\' mail alone', async () => {
		await emailService.unread(makeCtx(), { emailIds: [8001, 8002] }, 1);
		const mine = await env.db.prepare('SELECT unread FROM email WHERE email_id = 8001').first();
		const theirs = await env.db.prepare('SELECT unread FROM email WHERE email_id = 8002').first();
		expect(mine.unread).toBe(emailConst.unread.UNREAD);
		expect(theirs.unread).toBe(emailConst.unread.READ);
	});

	it('read() still marks mail read', async () => {
		await emailService.read(makeCtx(), { emailIds: [8001] }, 1);
		const mine = await env.db.prepare('SELECT unread FROM email WHERE email_id = 8001').first();
		expect(mine.unread).toBe(emailConst.unread.READ);
	});
});
