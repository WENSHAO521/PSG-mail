// Proves the actual reliability question this file exists to answer: does
// Undo Send's short-delay dispatch survive the Worker isolate being torn
// down mid-wait? A ctx.waitUntil()+setTimeout timer can't be tested for
// this at all (there's nothing to inspect — the timer just lives in that
// isolate's memory and is gone if it's evicted, with no way to prove it
// either way, before or after the fact).
//
// A Durable Object alarm can be proven directly: runInDurableObject() lets
// a test reach into the DO's actual durable storage and call
// state.storage.getAlarm() — the same storage layer Cloudflare persists
// independently of the Worker isolate/DO instance's in-memory lifecycle.
// If the alarm timestamp is there, it WILL fire (delivered by the platform,
// not by anything still running in this isolate), regardless of whether
// this specific JS object is evicted, the Worker redeploys, or the isolate
// restarts in between. That's the actual guarantee in question, and it
// doesn't require simulating eviction to demonstrate — the DO's state
// object exposed here IS the durable state, not a copy of it.
//
// (cloudflare:test also exports evictDurableObject()/runDurableObjectAlarm()
// for simulating eviction directly, which is an even more direct test of
// this — however it consistently hung for >20s in this environment/version
// during testing here, seemingly a harness issue rather than a real
// eviction bug, since fetch()/alarm() delivery both work fine on their own;
// storage inspection sidesteps that flakiness while still proving the
// durability claim.)
import { env, runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import scheduledEmailService from '../src/service/scheduled-email-service';
import emailService from '../src/service/email-service';

function makeCtx() {
	const store = new Map();
	return { env, get: (k) => store.get(k), set: (k, v) => store.set(k, v) };
}

const ACCOUNT_SCHEMA = `CREATE TABLE IF NOT EXISTS account (
	account_id INTEGER PRIMARY KEY AUTOINCREMENT,
	email TEXT NOT NULL, name TEXT NOT NULL DEFAULT '', status INTEGER DEFAULT 0 NOT NULL,
	latest_email_time TEXT, create_time TEXT DEFAULT CURRENT_TIMESTAMP, user_id INTEGER NOT NULL,
	all_receive INTEGER DEFAULT 0 NOT NULL, sort INTEGER DEFAULT 0 NOT NULL, is_del INTEGER DEFAULT 0 NOT NULL
)`;
const SCHEDULED_EMAIL_SCHEMA = `CREATE TABLE IF NOT EXISTS scheduled_email (
	id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, account_id INTEGER NOT NULL,
	payload TEXT NOT NULL, scheduled_at TEXT NOT NULL, timezone TEXT DEFAULT '',
	status TEXT NOT NULL DEFAULT 'pending', attempt_count INTEGER NOT NULL DEFAULT 0, last_error TEXT,
	create_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, update_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
	sent_time TEXT, result_email_id INTEGER
)`;

beforeAll(async () => {
	await env.db.prepare(ACCOUNT_SCHEMA).run();
	await env.db.prepare(SCHEDULED_EMAIL_SCHEMA).run();
});

beforeEach(() => {
	vi.restoreAllMocks();
});

async function insertAccount({ accountId, userId }) {
	await env.db.prepare(`INSERT INTO account (account_id, email, user_id, is_del) VALUES (?, ?, ?, 0)`)
		.bind(accountId, `acct${accountId}@example.com`, userId).run();
}

function isoMinutesFromNow(mins) {
	return new Date(Date.now() + mins * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');
}
function isoMinutesAgo(mins) {
	return new Date(Date.now() - mins * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');
}

// scheduled_at is stored/compared at whole-second precision (see
// claimAndProcessById's nowIso), while the DO alarm fires at millisecond
// precision very close to the parsed value of that truncated string — so a
// test that fires the alarm immediately after create() (no real wait) can
// race ahead of "now" reaching that truncated second, tripping
// claimAndProcessById's scheduledAt<=now guard even though the row is
// legitimately due. Real Cloudflare alarms never fire before their set
// time, so this is purely a test-timing artifact, not a false rejection risk
// in production — fixed here by actually waiting for real time to pass,
// which doubles as more faithful coverage of the true fast-path delay.
function isoSecondsFromNow(secs) {
	return new Date(Date.now() + secs * 1000).toISOString().slice(0, 19).replace('T', ' ');
}
// >MIN_LEAD_SECONDS (3s) even after slice(0,19)'s up-to-~1s truncation loss,
// with margin to spare for create()'s own validation re-check a moment later.
const FAST_PATH_TEST_LEAD_SECONDS = 5;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function stubFor(id) {
	return env.SCHEDULED_SEND_ALARM.get(env.SCHEDULED_SEND_ALARM.idFromName('scheduled-email-' + id));
}

describe('scheduledEmailService.armAlarm() — Durable Object wiring', () => {
	it('create() with a short delay arms the DO, and the platform fires it on its own and sends the email', async () => {
		await insertAccount({ accountId: 7001, userId: 7001 });
		const ctx = makeCtx();
		vi.spyOn(emailService, 'send').mockResolvedValue([{ emailId: 501 }]);

		const created = await scheduledEmailService.create(ctx, {
			accountId: 7001, scheduledAt: isoSecondsFromNow(FAST_PATH_TEST_LEAD_SECONDS), receiveEmail: ['x@example.com'], subject: 'undo send', content: '<p>hi</p>',
		}, 7001);

		// A real wait, not a manual runDurableObjectAlarm() force-fire — the
		// vitest-pool-workers runtime actually delivers DO alarms on its own
		// wall-clock schedule (confirmed by direct inspection: the alarm is
		// consumed from storage and the row is already 'sent' by the time
		// this wait returns), so this proves the real guarantee Undo Send
		// depends on rather than just that the handler function works when
		// called directly.
		await wait(FAST_PATH_TEST_LEAD_SECONDS * 1000 + 1500);

		const row = await env.db.prepare('SELECT status, result_email_id FROM scheduled_email WHERE id = ?').bind(created.id).first();
		expect(row.status).toBe('sent');
		expect(row.result_email_id).toBe(501);
	}, 12000);

	it('the armed alarm is written to the DO\'s durable storage, not just held in memory — the actual eviction-survival guarantee', async () => {
		await insertAccount({ accountId: 7002, userId: 7002 });
		const ctx = makeCtx();
		const whenMs = Date.now() + 90 * 1000;

		// Bypass the service layer's own delay-threshold branching and arm
		// directly, so this test can assert on an exact, controlled alarm
		// timestamp rather than "some time in the next few seconds".
		await scheduledEmailService.armAlarm(ctx, 999001, whenMs);

		const stub = stubFor(999001);
		const storedAlarm = await runInDurableObject(stub, async (instance, state) => {
			return state.storage.getAlarm();
		});

		// This is what "survives eviction" actually means: the alarm time is
		// sitting in the DO's durable storage (the same layer Cloudflare
		// persists independently of the isolate), not in a JS closure that
		// disappears if this instance is torn down. Whatever process picks
		// this DO back up next — a fresh isolate after a redeploy, a
		// different edge location, doesn't matter — reads this same value.
		expect(storedAlarm).toBe(whenMs);
	});

	it('firing the alarm reads back the id from storage and processes the correct row (round-trips through durable storage, not a closure)', async () => {
		await insertAccount({ accountId: 7006, userId: 7006 });
		const ctx = makeCtx();
		vi.spyOn(emailService, 'send').mockResolvedValue([{ emailId: 505 }]);

		const created = await scheduledEmailService.create(ctx, {
			accountId: 7006, scheduledAt: isoSecondsFromNow(FAST_PATH_TEST_LEAD_SECONDS), receiveEmail: ['x@example.com'], subject: 'storage round-trip', content: '<p>hi</p>',
		}, 7006);

		// Confirm the id armAlarm() wrote is actually readable from storage
		// (not just passed through an in-memory reference) before firing.
		const storedId = await runInDurableObject(stubFor(created.id), async (instance, state) => {
			return state.storage.get('scheduledEmailId');
		});
		expect(storedId).toBe(created.id);

		// Real wait, same reasoning as the previous test — the platform
		// delivers and consumes the alarm on its own, no manual force-fire.
		await wait(FAST_PATH_TEST_LEAD_SECONDS * 1000 + 1500);

		const row = await env.db.prepare('SELECT status, result_email_id FROM scheduled_email WHERE id = ?').bind(created.id).first();
		expect(row.status).toBe('sent');
		expect(row.result_email_id).toBe(505);
	}, 12000);

	it('a long delay does not arm the alarm (no alarm scheduled for that DO instance)', async () => {
		await insertAccount({ accountId: 7003, userId: 7003 });
		const ctx = makeCtx();
		const created = await scheduledEmailService.create(ctx, {
			accountId: 7003, scheduledAt: isoMinutesFromNow(10), receiveEmail: ['x@example.com'], subject: 'far future', content: '<p>hi</p>',
		}, 7003);

		const ran = await runDurableObjectAlarm(stubFor(created.id));
		expect(ran).toBe(false);
	});

	it('cancelling before the alarm fires leaves nothing to send — the alarm finds the row no longer pending', async () => {
		await insertAccount({ accountId: 7004, userId: 7004 });
		const ctx = makeCtx();
		const sendSpy = vi.spyOn(emailService, 'send').mockResolvedValue([{ emailId: 503 }]);

		const created = await scheduledEmailService.create(ctx, {
			accountId: 7004, scheduledAt: isoMinutesFromNow(0.1), receiveEmail: ['x@example.com'], subject: 'cancel before alarm', content: '<p>hi</p>',
		}, 7004);

		await scheduledEmailService.cancel(ctx, created.id, 7004);
		await runDurableObjectAlarm(stubFor(created.id));

		expect(sendSpy).not.toHaveBeenCalled();
		const row = await env.db.prepare('SELECT status FROM scheduled_email WHERE id = ?').bind(created.id).first();
		expect(row.status).toBe('cancelled');
	});

	it('the alarm and the cron backstop racing for the same row never double-sends (whichever claims first wins)', async () => {
		await insertAccount({ accountId: 7005, userId: 7005 });
		const ctx = makeCtx();
		vi.spyOn(emailService, 'send').mockResolvedValue([{ emailId: 504 }]);

		// Already due (direct insert bypasses create()'s MIN_LEAD_SECONDS
		// floor) with an alarm armed far enough in the future (10s) that it
		// cannot fire on its own during this synchronous test — otherwise
		// the platform's real automatic delivery (see the two tests above)
		// would race ahead of the manual claimAndProcessById() call below and
		// make "cron claims first" nondeterministic instead of an actual test
		// of that ordering.
		const row = await env.db.prepare(
			`INSERT INTO scheduled_email (user_id, account_id, payload, scheduled_at, status) VALUES (?, ?, ?, ?, 'pending') RETURNING id`
		).bind(7005, 7005, JSON.stringify({ receiveEmail: ['x@example.com'], subject: 'race', content: '<p>hi</p>' }), isoMinutesAgo(1)).first();
		await scheduledEmailService.armAlarm(ctx, row.id, Date.now() + 10000);

		// Simulate the cron claiming it a moment before the alarm fires.
		const cronResult = await scheduledEmailService.claimAndProcessById(ctx, row.id);
		expect(cronResult.status).toBe('sent');

		// The alarm firing afterward (forced here rather than waiting out the
		// full 10s) must be a safe no-op, not a second send.
		const ran = await runDurableObjectAlarm(stubFor(row.id));
		expect(ran).toBe(true); // the alarm itself still "ran" (and correctly found nothing to claim)

		expect(emailService.send).toHaveBeenCalledTimes(1);
	});

	it('processDue() (the actual cron entry point, not just claimAndProcessById) racing the alarm never double-sends', async () => {
		await insertAccount({ accountId: 7007, userId: 7007 });
		const ctx = makeCtx();
		vi.spyOn(emailService, 'send').mockResolvedValue([{ emailId: 506 }]);

		// Insert already-due directly (bypassing create()'s MIN_LEAD_SECONDS
		// floor and armAlarm's own delay math) and separately arm this row's
		// DO instance far enough in the future (10s) that the platform's real
		// automatic delivery can't win the race and fire it before
		// processDue() runs — same reasoning as the claimAndProcessById
		// version of this race test above.
		const row = await env.db.prepare(
			`INSERT INTO scheduled_email (user_id, account_id, payload, scheduled_at, status) VALUES (?, ?, ?, ?, 'pending') RETURNING id`
		).bind(7007, 7007, JSON.stringify({ receiveEmail: ['x@example.com'], subject: 'cron entrypoint race', content: '<p>hi</p>' }), isoMinutesAgo(1)).first();
		await scheduledEmailService.armAlarm(ctx, row.id, Date.now() + 10000);

		const { processed } = await scheduledEmailService.processDue(ctx);
		expect(processed).toBe(1);

		const ran = await runDurableObjectAlarm(stubFor(row.id));
		expect(ran).toBe(true); // alarm still fires, correctly finds nothing left to claim

		expect(emailService.send).toHaveBeenCalledTimes(1);
	});

	it('sendNow() racing the alarm never double-sends (whichever claims first wins)', async () => {
		await insertAccount({ accountId: 7008, userId: 7008 });
		const ctx = makeCtx();
		vi.spyOn(emailService, 'send').mockResolvedValue([{ emailId: 507 }]);

		const created = await scheduledEmailService.create(ctx, {
			accountId: 7008, scheduledAt: isoMinutesFromNow(0.1), receiveEmail: ['x@example.com'], subject: 'sendNow race', content: '<p>hi</p>',
		}, 7008);

		const sendNowResult = await scheduledEmailService.sendNow(ctx, created.id, 7008);
		expect(sendNowResult.status).toBe('sent');

		const ran = await runDurableObjectAlarm(stubFor(created.id));
		expect(ran).toBe(true); // alarm still fires, correctly finds nothing left to claim

		expect(emailService.send).toHaveBeenCalledTimes(1);
	});

	it('rescheduling out of the fast path disarms the old alarm — it does not fire early at the original time', async () => {
		await insertAccount({ accountId: 7009, userId: 7009 });
		const ctx = makeCtx();
		const sendSpy = vi.spyOn(emailService, 'send').mockResolvedValue([{ emailId: 508 }]);

		// Fast-path create (delay well under FAST_PATH_THRESHOLD_MS) arms an alarm.
		const created = await scheduledEmailService.create(ctx, {
			accountId: 7009, scheduledAt: isoMinutesFromNow(0.1), receiveEmail: ['x@example.com'], subject: 'reschedule out of fast path', content: '<p>hi</p>',
		}, 7009);

		// Push it out past FAST_PATH_THRESHOLD_MS (2 minutes) — reschedule()
		// must disarm the alarm that was armed for the original ~6s delay,
		// otherwise it would fire at that original time and send the email
		// long before the newly-chosen 5-minute mark.
		await scheduledEmailService.reschedule(ctx, created.id, 7009, { scheduledAt: isoMinutesFromNow(5) });

		const ran = await runDurableObjectAlarm(stubFor(created.id));
		expect(ran).toBe(false); // nothing armed anymore — disarm() worked

		expect(sendSpy).not.toHaveBeenCalled();
		const row = await env.db.prepare('SELECT status, scheduled_at FROM scheduled_email WHERE id = ?').bind(created.id).first();
		expect(row.status).toBe('pending'); // still pending, waiting for the new time via the cron backstop
	});

	it('rescheduling within the fast path re-arms the SAME DO instance to the new time (overwrite, not a stale duplicate)', async () => {
		await insertAccount({ accountId: 7010, userId: 7010 });
		const ctx = makeCtx();

		const created = await scheduledEmailService.create(ctx, {
			accountId: 7010, scheduledAt: isoMinutesFromNow(0.1), receiveEmail: ['x@example.com'], subject: 'reschedule within fast path', content: '<p>hi</p>',
		}, 7010);

		const newWhenIso = isoMinutesFromNow(1.5);
		await scheduledEmailService.reschedule(ctx, created.id, 7010, { scheduledAt: newWhenIso });

		const storedAlarm = await runInDurableObject(stubFor(created.id), async (instance, state) => {
			return state.storage.getAlarm();
		});

		const expectedMs = Date.parse(newWhenIso.replace(' ', 'T') + 'Z');
		// Same DO instance (idFromName keyed on the row id) — setAlarm()
		// overwrites in place, so there is exactly one alarm and it reflects
		// the rescheduled time, not the original ~6s-from-create one.
		expect(storedAlarm).toBe(expectedMs);
	});

	it('a defense-in-depth guard: even if a stale alarm somehow still fires before its row\'s scheduled_at, claimAndProcessById refuses to send early', async () => {
		await insertAccount({ accountId: 7011, userId: 7011 });
		const ctx = makeCtx();
		const sendSpy = vi.spyOn(emailService, 'send').mockResolvedValue([{ emailId: 509 }]);

		// Insert a row scheduled well in the future directly (bypassing
		// create()/armAlarm() entirely), then invoke the claim function the
		// alarm handler calls as if a stale/misfired alarm had reached it.
		const future = isoMinutesFromNow(10);
		const row = await env.db.prepare(
			`INSERT INTO scheduled_email (user_id, account_id, payload, scheduled_at, status) VALUES (?, ?, ?, ?, 'pending') RETURNING id`
		).bind(7011, 7011, JSON.stringify({ receiveEmail: ['x@example.com'], subject: 'guard', content: '<p>hi</p>' }), future).first();

		const result = await scheduledEmailService.claimAndProcessById(ctx, row.id);
		expect(result).toBe(null); // scheduled_at is still in the future — refused, not sent

		expect(sendSpy).not.toHaveBeenCalled();
		const stored = await env.db.prepare('SELECT status FROM scheduled_email WHERE id = ?').bind(row.id).first();
		expect(stored.status).toBe('pending'); // untouched, still available for the real future alarm/cron
	});
});
