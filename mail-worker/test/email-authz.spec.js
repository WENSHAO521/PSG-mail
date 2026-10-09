// Cross-user authorization for destructive email operations.
import { env } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import emailService from '../src/service/email-service';

function makeCtx() {
	const store = new Map();
	return { env, get: k => store.get(k), set: (k, v) => store.set(k, v) };
}

beforeAll(async () => {
	await env.db.prepare(`CREATE TABLE IF NOT EXISTS email (
		email_id INTEGER PRIMARY KEY AUTOINCREMENT, account_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
		subject TEXT, is_del INTEGER DEFAULT 0 NOT NULL)`).run();
	await env.db.prepare(`CREATE TABLE IF NOT EXISTS account_share (
		id INTEGER PRIMARY KEY AUTOINCREMENT, account_id INTEGER NOT NULL, user_id INTEGER NOT NULL, create_time TEXT)`).run();
	await env.db.prepare(`CREATE TABLE IF NOT EXISTS setting (id INTEGER PRIMARY KEY)`).run();
	for (const [id, user] of [[7001, 1], [7002, 2]]) {
		await env.db.prepare('INSERT INTO email (email_id, account_id, user_id, subject) VALUES (?,?,?,?)').bind(id, id, user, 's').run();
	}
});

describe('email.delete authorization', () => {
	it('never trashes or timestamps another user\'s mail', async () => {
		await emailService.delete(makeCtx(), { emailIds: '7001,7002' }, 1);
		const mine = await env.db.prepare('SELECT is_del, delete_time FROM email WHERE email_id = 7001').first();
		const theirs = await env.db.prepare('SELECT is_del, delete_time FROM email WHERE email_id = 7002').first();
		expect(theirs.is_del).toBe(0);
		expect(theirs.delete_time).toBeNull();
		expect(mine.is_del).toBe(1);
		expect(mine.delete_time).not.toBeNull();
	});
});
