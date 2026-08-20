// Regression coverage for real server-side Scheduled Send (previously a
// pure frontend fake — see scheduled-email-service.js's header). Focuses on
// the scheduler's own mechanics (ownership, claim atomicity, status
// machine, retry) rather than re-testing emailService.send()'s internals,
// which is stubbed via vi.spyOn so these tests don't need the full
// settings/domain/account send-pipeline scaffolding.
import { env } from 'cloudflare:test';
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import scheduledEmailService from '../src/service/scheduled-email-service';
import emailService from '../src/service/email-service';

function makeCtx() {
	const store = new Map();
	return { env, get: (k) => store.get(k), set: (k, v) => store.set(k, v) };
}

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

const SCHEDULED_EMAIL_SCHEMA = `CREATE TABLE IF NOT EXISTS scheduled_email (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	user_id INTEGER NOT NULL,
	account_id INTEGER NOT NULL,
	payload TEXT NOT NULL,
	scheduled_at TEXT NOT NULL,
	timezone TEXT DEFAULT '',
	status TEXT NOT NULL DEFAULT 'pending',
	attempt_count INTEGER NOT NULL DEFAULT 0,
	last_error TEXT,
	create_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
	update_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
	sent_time TEXT,
	result_email_id INTEGER
)`;

beforeAll(async () => {
	await env.db.prepare(ACCOUNT_SCHEMA).run();
	await env.db.prepare(SCHEDULED_EMAIL_SCHEMA).run();
});

beforeEach(() => {
	vi.restoreAllMocks();
});

async function insertAccount({ accountId, userId }) {
	await env.db.prepare(
		`INSERT INTO account (account_id, email, user_id, is_del) VALUES (?, ?, ?, 0)`
	).bind(accountId, `acct${accountId}@example.com`, userId).run();
}

function isoMinutesFromNow(mins) {
	return new Date(Date.now() + mins * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');
}
function isoMinutesAgo(mins) {
	return new Date(Date.now() - mins * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');
}

describe('scheduledEmailService.create()', () => {
	it('rejects an accountId the user does not own and has no shared access to', async () => {
		await insertAccount({ accountId: 5001, userId: 900 });
		const ctx = makeCtx();
		await expect(scheduledEmailService.create(ctx, {
			accountId: 5001, scheduledAt: isoMinutesFromNow(10), receiveEmail: ['x@example.com'], subject: 'hi', content: '<p>hi</p>',
		}, 901 /* not the owner */)).rejects.toThrow();
	});

	it('rejects a scheduledAt less than the minimum lead time in the future', async () => {
		await insertAccount({ accountId: 5002, userId: 902 });
		const ctx = makeCtx();
		await expect(scheduledEmailService.create(ctx, {
			accountId: 5002, scheduledAt: isoMinutesAgo(1), receiveEmail: ['x@example.com'], subject: 'hi', content: '<p>hi</p>',
		}, 902)).rejects.toThrow();
	});

	it('creates a pending row for a valid future schedule, visible via list()', async () => {
		await insertAccount({ accountId: 5003, userId: 903 });
		const ctx = makeCtx();
		const created = await scheduledEmailService.create(ctx, {
			accountId: 5003, scheduledAt: isoMinutesFromNow(30), receiveEmail: ['x@example.com'], subject: 'future mail', content: '<p>hi</p>',
		}, 903);
		expect(created.status).toBe('pending');
		expect(created.subject).toBe('future mail');

		const list = await scheduledEmailService.list(ctx, 903);
		expect(list.map(r => r.id)).toContain(created.id);
	});
});

describe('scheduledEmailService.cancel()', () => {
	it('cancels a pending row and is idempotent-safe against a second cancel', async () => {
		await insertAccount({ accountId: 5004, userId: 904 });
		const ctx = makeCtx();
		const created = await scheduledEmailService.create(ctx, {
			accountId: 5004, scheduledAt: isoMinutesFromNow(30), receiveEmail: ['x@example.com'], subject: 'to cancel', content: '<p>hi</p>',
		}, 904);

		const cancelled = await scheduledEmailService.cancel(ctx, created.id, 904);
		expect(cancelled.status).toBe('cancelled');

		// Already cancelled — a second cancel must fail loudly, not silently no-op
		// as if it worked (the row is not "still cancellable").
		await expect(scheduledEmailService.cancel(ctx, created.id, 904)).rejects.toThrow();
	});

	it('does not let another user cancel someone else\'s schedule', async () => {
		await insertAccount({ accountId: 5005, userId: 905 });
		const ctx = makeCtx();
		const created = await scheduledEmailService.create(ctx, {
			accountId: 5005, scheduledAt: isoMinutesFromNow(30), receiveEmail: ['x@example.com'], subject: 'owned by 905', content: '<p>hi</p>',
		}, 905);

		await expect(scheduledEmailService.cancel(ctx, created.id, 906)).rejects.toThrow();
		const stillThere = await scheduledEmailService.list(ctx, 905);
		expect(stillThere.find(r => r.id === created.id).status).toBe('pending');
	});
});

describe('scheduledEmailService.processDue() — claim atomicity and status machine', () => {
	it('only claims rows that are both pending AND due, leaving future-scheduled rows alone', async () => {
		await insertAccount({ accountId: 5006, userId: 907 });
		const ctx = makeCtx();
		const due = await scheduledEmailService.create(ctx, {
			accountId: 5006, scheduledAt: isoMinutesFromNow(1), receiveEmail: ['x@example.com'], subject: 'not due yet', content: '<p>hi</p>',
		}, 907);
		// Backdate it directly (create() itself refuses a past scheduledAt).
		await env.db.prepare(`UPDATE scheduled_email SET scheduled_at = ? WHERE id = ?`)
			.bind(isoMinutesAgo(1), due.id).run();

		const sendSpy = vi.spyOn(emailService, 'send').mockResolvedValue([{ emailId: 42 }]);
		await scheduledEmailService.processDue(ctx);

		expect(sendSpy).toHaveBeenCalledTimes(1);
		const row = await env.db.prepare('SELECT status, result_email_id FROM scheduled_email WHERE id = ?').bind(due.id).first();
		expect(row.status).toBe('sent');
		expect(row.result_email_id).toBe(42);
	});

	it('leaves a not-yet-due pending row untouched', async () => {
		await insertAccount({ accountId: 5007, userId: 908 });
		const ctx = makeCtx();
		const future = await scheduledEmailService.create(ctx, {
			accountId: 5007, scheduledAt: isoMinutesFromNow(60), receiveEmail: ['x@example.com'], subject: 'far future', content: '<p>hi</p>',
		}, 908);

		const sendSpy = vi.spyOn(emailService, 'send').mockResolvedValue([{ emailId: 1 }]);
		await scheduledEmailService.processDue(ctx);

		const row = await env.db.prepare('SELECT status FROM scheduled_email WHERE id = ?').bind(future.id).first();
		expect(row.status).toBe('pending');
		// sendSpy may have been called for other due rows created by earlier
		// tests in this file, but never for this specific untouched row —
		// verified by status staying 'pending' above.
	});

	it('a send failure schedules a retry (pending again, later scheduled_at, attempt_count incremented) instead of losing the email', async () => {
		await insertAccount({ accountId: 5008, userId: 909 });
		const ctx = makeCtx();
		const due = await scheduledEmailService.create(ctx, {
			accountId: 5008, scheduledAt: isoMinutesFromNow(1), receiveEmail: ['x@example.com'], subject: 'will fail once', content: '<p>hi</p>',
		}, 909);
		await env.db.prepare(`UPDATE scheduled_email SET scheduled_at = ? WHERE id = ?`)
			.bind(isoMinutesAgo(1), due.id).run();

		vi.spyOn(emailService, 'send').mockRejectedValue(new Error('provider unavailable'));
		await scheduledEmailService.processDue(ctx);

		const row = await env.db.prepare('SELECT status, attempt_count, last_error, scheduled_at FROM scheduled_email WHERE id = ?').bind(due.id).first();
		expect(row.status).toBe('pending');
		expect(row.attempt_count).toBe(1);
		expect(row.last_error).toContain('provider unavailable');
		expect(new Date(row.scheduled_at + 'Z').getTime()).toBeGreaterThan(Date.now());
	});

	it('permanently fails after exhausting max attempts instead of retrying forever', async () => {
		await insertAccount({ accountId: 5009, userId: 910 });
		const ctx = makeCtx();
		const due = await scheduledEmailService.create(ctx, {
			accountId: 5009, scheduledAt: isoMinutesFromNow(1), receiveEmail: ['x@example.com'], subject: 'will fail permanently', content: '<p>hi</p>',
		}, 910);
		// Simulate this being the 3rd (final) attempt.
		await env.db.prepare(`UPDATE scheduled_email SET scheduled_at = ?, attempt_count = 2 WHERE id = ?`)
			.bind(isoMinutesAgo(1), due.id).run();

		vi.spyOn(emailService, 'send').mockRejectedValue(new Error('still broken'));
		await scheduledEmailService.processDue(ctx);

		const row = await env.db.prepare('SELECT status, attempt_count FROM scheduled_email WHERE id = ?').bind(due.id).first();
		expect(row.status).toBe('failed');
		expect(row.attempt_count).toBe(3);
	});
});

// The short-delay fast path used to be a c.executionCtx.waitUntil()+
// setTimeout timer, tested here by capturing the waitUntil promise. That
// mechanism was replaced with a Durable Object alarm (see
// scheduled-email-service.js's FAST_PATH_THRESHOLD_MS comment for why —
// waitUntil gives no wall-clock delivery guarantee if the isolate is
// evicted mid-wait). Coverage for the new mechanism, including a real
// simulated-isolate-eviction test, now lives in test/scheduled-send-alarm.spec.js.

describe('scheduledEmailService.sendNow()', () => {
	it('claims and sends immediately regardless of scheduled_at, bypassing the wait', async () => {
		await insertAccount({ accountId: 5010, userId: 911 });
		const ctx = makeCtx();
		const farFuture = await scheduledEmailService.create(ctx, {
			accountId: 5010, scheduledAt: isoMinutesFromNow(120), receiveEmail: ['x@example.com'], subject: 'send now please', content: '<p>hi</p>',
		}, 911);

		vi.spyOn(emailService, 'send').mockResolvedValue([{ emailId: 7 }]);
		const result = await scheduledEmailService.sendNow(ctx, farFuture.id, 911);
		expect(result.status).toBe('sent');
	});
});

describe('scheduledEmailService.beginEdit()', () => {
	it('atomically cancels the row and returns the full payload including attachments', async () => {
		await insertAccount({ accountId: 5011, userId: 912 });
		const ctx = makeCtx();
		const created = await scheduledEmailService.create(ctx, {
			accountId: 5011, scheduledAt: isoMinutesFromNow(30), receiveEmail: ['x@example.com'], subject: 'edit me', content: '<p>hi</p>',
			attachments: [{ filename: 'a.pdf', size: 10, content: 'AAAA' }],
		}, 912);

		const payload = await scheduledEmailService.beginEdit(ctx, created.id, 912);
		expect(payload.subject).toBe('edit me');
		expect(payload.attachments).toHaveLength(1);

		const row = await env.db.prepare('SELECT status FROM scheduled_email WHERE id = ?').bind(created.id).first();
		expect(row.status).toBe('cancelled');

		// Can't edit it again — already cancelled.
		await expect(scheduledEmailService.beginEdit(ctx, created.id, 912)).rejects.toThrow();
	});
});
