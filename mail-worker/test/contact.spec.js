// Auto contacts (contact-service.js): derived from mail history, frequent
// contacts need a two-way exchange, own mailboxes/spam/hidden are left out.
import { env } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import contactService from '../src/service/contact-service';

const ctx = { env, get: () => undefined, set: () => {} };
const USER = 77;

const SCHEMA = [
	`CREATE TABLE IF NOT EXISTS email (
		email_id INTEGER PRIMARY KEY AUTOINCREMENT, send_email TEXT, name TEXT, account_id INTEGER NOT NULL,
		user_id INTEGER NOT NULL, cc TEXT DEFAULT '[]', recipient TEXT, type INTEGER DEFAULT 0 NOT NULL,
		create_time TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL, is_spam INTEGER DEFAULT 0 NOT NULL
	)`,
	`CREATE TABLE IF NOT EXISTS account (account_id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL, user_id INTEGER NOT NULL)`,
	`CREATE TABLE IF NOT EXISTS psg_contact_hidden (user_id INTEGER NOT NULL, email TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (user_id, email))`,
];

const received = (from, name, time, spam = 0) => env.db.prepare(
	`INSERT INTO email (send_email, name, account_id, user_id, recipient, type, create_time, is_spam) VALUES (?, ?, 1, ?, '[]', 0, ?, ?)`
).bind(from, name, USER, time, spam).run();
const sent = (to, time, cc = []) => env.db.prepare(
	`INSERT INTO email (send_email, name, account_id, user_id, recipient, cc, type, create_time) VALUES ('me@psg.test', 'Me', 1, ?, ?, ?, 1, ?)`
).bind(USER, JSON.stringify(to.map(a => ({ address: a, name: '' }))), JSON.stringify(cc.map(a => ({ address: a, name: '' }))), time).run();

beforeAll(async () => {
	for (const sql of SCHEMA) await env.db.prepare(sql).run();
	await env.db.prepare(`INSERT INTO account (email, user_id) VALUES ('me@psg.test', ?)`).bind(USER).run();
	// Alice: two-way, frequent.
	await received('Alice@Example.com', 'Alice', '2026-10-01 10:00:00');
	await received('alice@example.com', 'Alice W.', '2026-10-03 10:00:00');
	await sent(['alice@example.com'], '2026-10-02 10:00:00');
	// Bob: wrote once, never answered -> contact, not frequent.
	await received('bob@example.com', 'Bob', '2026-10-04 10:00:00');
	// Newsletter: many mails, never answered -> not frequent.
	for (let i = 0; i < 6; i++) await received('news@shop.test', 'Shop', `2026-09-0${i + 1} 10:00:00`);
	// Carol: only ever cc'd by me.
	await sent(['dave@example.com'], '2026-10-05 10:00:00', ['carol@example.com']);
	// Spam sender, and mail from my own mailbox.
	await received('spam@bad.test', 'Spam', '2026-10-05 10:00:00', 1);
	await received('me@psg.test', 'Me', '2026-10-05 10:00:00');
	await env.db.prepare(`INSERT INTO email (send_email, name, account_id, user_id, recipient, type) VALUES ('x@other.test', 'X', 1, 999, '[]', 0)`).run();
});

describe('contactService.list', () => {
	it('merges received and sent mail per address and flags frequent contacts', async () => {
		const list = await contactService.list(ctx, USER);
		const by = Object.fromEntries(list.map(c => [c.email, c]));
		expect(Object.keys(by).sort()).toEqual(['alice@example.com', 'bob@example.com', 'carol@example.com', 'dave@example.com', 'news@shop.test']);
		expect(by['alice@example.com']).toMatchObject({ name: 'Alice W.', received: 2, sent: 1, total: 3, frequent: true });
		expect(by['bob@example.com'].frequent).toBe(false);
		expect(by['news@shop.test']).toMatchObject({ received: 6, frequent: false });
		expect(by['carol@example.com']).toMatchObject({ sent: 1, received: 0 });
		expect(list[0].email).toBe('alice@example.com');
	});

	it('leaves out addresses the user hid', async () => {
		await contactService.hide(ctx, USER, 'Bob@Example.com');
		const list = await contactService.list(ctx, USER);
		expect(list.find(c => c.email === 'bob@example.com')).toBeUndefined();
	});

	it('serves repeat reads from the cache and drops it when a contact is hidden', async () => {
		await env.kv.delete(`contacts:${USER}`);
		const first = await contactService.list(ctx, USER);
		await received('erin@example.com', 'Erin', '2026-10-06 10:00:00');
		expect(await contactService.list(ctx, USER)).toEqual(first); // cached, new mail not yet visible
		await contactService.hide(ctx, USER, 'news@shop.test');
		const after = await contactService.list(ctx, USER);
		expect(after.find(c => c.email === 'erin@example.com')).toBeDefined();
		expect(after.find(c => c.email === 'news@shop.test')).toBeUndefined();
	});
});
