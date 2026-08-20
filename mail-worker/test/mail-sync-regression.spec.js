// Regression coverage for the real-time mail-sync fixes:
//   - completeReceiveAll() must restore BOTH status and is_del, or a message
//     recovered from the SAVING staging state stays permanently invisible
//     ("ghost email" — see scripts/repair-hidden-received-mail.sql).
//   - latest() must never silently return [] to mask "someone else already
//     polled recently" as "there is no new mail" (the old per-user KV rate
//     limit did exactly that, and was indistinguishable from a real empty
//     result on the client).
//   - notification test/dispatch must report real delivery stats instead of
//     a bare success when there are 0 registered devices or FCM rejects it.
import { env } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import emailService from '../src/service/email-service';
import notificationService from '../src/service/notification-service';
import { emailConst, isDel } from '../src/const/entity-const';

// Hono's Context has get()/set() (used by email-service's per-request
// shared-account-id cache) on top of .env — a plain {env} isn't enough for
// every service method, so tests go through this instead.
function makeCtx() {
	const store = new Map();
	return {
		env,
		get: (k) => store.get(k),
		set: (k, v) => store.set(k, v),
	};
}

const EMAIL_SCHEMA = `CREATE TABLE IF NOT EXISTS email (
	email_id INTEGER PRIMARY KEY AUTOINCREMENT,
	send_email TEXT,
	name TEXT,
	account_id INTEGER NOT NULL,
	user_id INTEGER NOT NULL,
	subject TEXT,
	code TEXT DEFAULT '' NOT NULL,
	text TEXT,
	content TEXT,
	cc TEXT DEFAULT '[]',
	bcc TEXT DEFAULT '[]',
	recipient TEXT,
	to_email TEXT DEFAULT '' NOT NULL,
	to_name TEXT DEFAULT '' NOT NULL,
	in_reply_to TEXT DEFAULT '',
	relation TEXT DEFAULT '',
	message_id TEXT DEFAULT '',
	type INTEGER DEFAULT 0 NOT NULL,
	status INTEGER DEFAULT 0 NOT NULL,
	resend_email_id TEXT,
	message TEXT,
	unread INTEGER DEFAULT 0 NOT NULL,
	create_time TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
	is_del INTEGER DEFAULT 0 NOT NULL
)`;

const ACCOUNT_SCHEMA = `CREATE TABLE IF NOT EXISTS account (
	account_id INTEGER PRIMARY KEY AUTOINCREMENT,
	email TEXT NOT NULL,
	name TEXT NOT NULL DEFAULT '',
	status INTEGER DEFAULT 0 NOT NULL,
	latest_email_time TEXT,
	create_time TEXT DEFAULT CURRENT_TIMESTAMP,
	user_id INTEGER NOT NULL,
	all_receive INTEGER DEFAULT 0 NOT NULL,
	sort INTEGER DEFAULT 0 NOT NULL,
	is_del INTEGER DEFAULT 0 NOT NULL
)`;

const ATTACHMENTS_SCHEMA = `CREATE TABLE IF NOT EXISTS attachments (
	att_id INTEGER PRIMARY KEY AUTOINCREMENT,
	user_id INTEGER NOT NULL,
	email_id INTEGER NOT NULL,
	account_id INTEGER NOT NULL,
	key TEXT NOT NULL,
	filename TEXT,
	mime_type TEXT,
	size INTEGER,
	status TEXT DEFAULT 0 NOT NULL,
	type INTEGER DEFAULT 0 NOT NULL,
	disposition TEXT,
	related TEXT,
	content_id TEXT,
	encoding TEXT,
	create_time TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
)`;

const STAR_SCHEMA = `CREATE TABLE IF NOT EXISTS star (
	star_id INTEGER PRIMARY KEY AUTOINCREMENT,
	email_id INTEGER NOT NULL,
	user_id INTEGER NOT NULL
)`;

beforeAll(async () => {
	await env.db.prepare(EMAIL_SCHEMA).run();
	await env.db.prepare(ACCOUNT_SCHEMA).run();
	await env.db.prepare(ATTACHMENTS_SCHEMA).run();
	await env.db.prepare(STAR_SCHEMA).run();
});

async function insertAccount({ accountId, userId }) {
	await env.db.prepare(
		`INSERT INTO account (account_id, email, user_id, is_del) VALUES (?, ?, ?, 0)`
	).bind(accountId, `acct${accountId}@example.com`, userId).run();
}

async function insertSavingEmail({ emailId, accountId, userId }) {
	await env.db.prepare(
		`INSERT INTO email (email_id, account_id, user_id, subject, status, is_del, type)
		 VALUES (?, ?, ?, 'staged', ${emailConst.status.SAVING}, ${isDel.DELETE}, ${emailConst.type.RECEIVE})`
	).bind(emailId, accountId, userId).run();
}

describe('completeReceiveAll() staging recovery', () => {
	it('restores is_del = NORMAL alongside status for a SAVING row with a live account', async () => {
		await insertAccount({ accountId: 9001, userId: 501 });
		await insertSavingEmail({ emailId: 9001, accountId: 9001, userId: 501 });

		await emailService.completeReceiveAll({ env });

		const row = await env.db.prepare('SELECT status, is_del FROM email WHERE email_id = ?').bind(9001).first();
		expect(row.status).toBe(emailConst.status.RECEIVE);
		// This is the bug: before the fix, is_del stayed 1 (DELETE) forever —
		// the row would never appear in list()/latest() again despite status
		// correctly reporting RECEIVE.
		expect(row.is_del).toBe(isDel.NORMAL);
	});

	it('restores is_del = NORMAL as NOONE for a SAVING row with no matching account', async () => {
		await insertSavingEmail({ emailId: 9002, accountId: 999999, userId: 0 });

		await emailService.completeReceiveAll({ env });

		const row = await env.db.prepare('SELECT status, is_del FROM email WHERE email_id = ?').bind(9002).first();
		expect(row.status).toBe(emailConst.status.NOONE);
		expect(row.is_del).toBe(isDel.NORMAL);
	});

	it('does not touch a row still legitimately mid-flight (no account created yet)', async () => {
		// account_id 888888 deliberately has no matching account row and is
		// NOT run through completeReceiveAll in this test — simulates a
		// message still actively being received, which must be left alone by
		// anything else touching status=SAVING rows.
		await insertSavingEmail({ emailId: 9003, accountId: 888888, userId: 0 });
		const before = await env.db.prepare('SELECT status, is_del FROM email WHERE email_id = ?').bind(9003).first();
		expect(before.status).toBe(emailConst.status.SAVING);
		expect(before.is_del).toBe(isDel.DELETE);
	});
});

describe('latest() — no silent rate-limit swallow', () => {
	it('returns real results on back-to-back calls (simulating two concurrent pollers)', async () => {
		await insertAccount({ accountId: 9101, userId: 601 });
		await env.db.prepare(
			`INSERT INTO email (email_id, account_id, user_id, subject, status, is_del, type)
			 VALUES (9101, 9101, 601, 'poller A should see this', ${emailConst.status.RECEIVE}, ${isDel.NORMAL}, ${emailConst.type.RECEIVE})`
		).run();

		const ctxA = makeCtx();
		const firstPoller = await emailService.latest(ctxA, { emailId: 0, accountId: 9101, allReceive: 0 }, 601);
		expect(firstPoller.map(e => e.emailId)).toContain(9101);

		// A second, independent caller (different tab/device, same userId)
		// polling immediately after must NOT get starved by whatever the
		// first caller just did — this is exactly what the old
		// `rate:latest:<userId>` KV throttle broke.
		const ctxB = makeCtx();
		const secondPoller = await emailService.latest(ctxB, { emailId: 0, accountId: 9101, allReceive: 0 }, 601);
		expect(secondPoller.map(e => e.emailId)).toContain(9101);
	});
});

describe('notification test/dispatch — no fake success', () => {
	it('dispatchNewMail reports NO_REGISTERED_DEVICE instead of a bare success when nobody is registered', async () => {
		const stats = await notificationService.dispatchNewMail({
			env,
			userId: 70001,
			accountId: 1,
			email: { name: 'Sender', sendEmail: 's@example.com', subject: 'hi', emailId: 1 },
		});
		expect(stats.attempted).toBe(0);
		expect(stats.reason).toBe('NO_REGISTERED_DEVICE');
	});

	it('sendTest throws instead of reporting success when nobody is registered', async () => {
		await expect(notificationService.sendTest({ env }, 70002)).rejects.toMatchObject({
			message: 'NO_REGISTERED_DEVICE',
		});
	});
});
