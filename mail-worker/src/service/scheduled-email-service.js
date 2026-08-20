import orm from '../entity/orm';
import scheduledEmail from '../entity/scheduled-email';
import { and, eq, desc } from 'drizzle-orm';
import BizError from '../error/biz-error';
import { t } from '../i18n/i18n';
import accountService from './account-service';
import emailService from './email-service';

const STATUS = {
	PENDING: 'pending',
	PROCESSING: 'processing',
	SENT: 'sent',
	FAILED: 'failed',
	CANCELLED: 'cancelled',
};

const MAX_ATTEMPTS = 3;
// A failed attempt is retried this many minutes later (cron runs every
// minute — see index.js's scheduled() dispatch — so this is purely to avoid
// hammering a transiently-failing send provider every single minute).
const RETRY_DELAY_MINUTES = 5;
// Minimum lead time — just enough to guarantee create()'s response reaches
// the client before the row could possibly already be due. Low on purpose:
// Undo Send (mail-vue/src/layout/write/index.vue) reuses this exact API
// with delays as short as 5s, so this can't be the 30s+ margin a "pick a
// future date" scheduler would want.
const MIN_LEAD_SECONDS = 3;
// Cloudflare Cron Triggers can't fire more often than once a minute, which
// is far too coarse for Undo Send's 5-30s grace window. For any delay under
// this threshold, create() also arms a direct in-Worker timer (below) for
// real precision; the once-a-minute cron (processDue in index.js) remains
// as a backstop for the rare case that background task doesn't survive
// (e.g. a deploy recycling the isolate mid-wait) — processDue's atomic
// claim means both paths racing is always safe, never a double-send.
const FAST_PATH_THRESHOLD_MS = 2 * 60 * 1000;

function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

async function assertOwnedAccount(c, accountId, userId) {
	const accountRow = await accountService.selectById(c, accountId);
	if (!accountRow) throw new BizError(t('senderAccountNotExist'));
	if (accountRow.userId === userId) return;
	const shared = await c.env.db
		.prepare('SELECT id FROM account_share WHERE account_id = ? AND user_id = ?')
		.bind(accountId, userId).first();
	if (!shared) throw new BizError(t('sendEmailNotCurUser'));
}

const scheduledEmailService = {

	async create(c, params, userId) {
		const { accountId, scheduledAt, timezone } = params;

		if (!accountId) throw new BizError(t('senderAccountNotExist'));
		await assertOwnedAccount(c, accountId, userId);

		if (!scheduledAt) throw new BizError('scheduledAt is required', 400);
		const scheduledMs = Date.parse(scheduledAt.replace(' ', 'T') + 'Z');
		if (Number.isNaN(scheduledMs)) throw new BizError('scheduledAt is not a valid date', 400);
		if (scheduledMs < Date.now() + MIN_LEAD_SECONDS * 1000) {
			throw new BizError(t('scheduleTooSoon') || 'Scheduled time must be in the future', 400);
		}

		// Persist exactly the shape emailService.send() expects — processDue()
		// replays this verbatim, so validation of recipients/subject/content
		// happens for real at send() time, not duplicated here.
		const payload = {
			accountId,
			name: params.name,
			sendType: params.sendType,
			emailId: params.emailId,
			receiveEmail: params.receiveEmail || [],
			cc: params.cc || [],
			bcc: params.bcc || [],
			text: params.text,
			content: params.content,
			subject: params.subject,
			attachments: params.attachments || [],
		};

		const row = await orm(c).insert(scheduledEmail).values({
			userId,
			accountId,
			payload: JSON.stringify(payload),
			scheduledAt,
			timezone: timezone || '',
			status: STATUS.PENDING,
		}).returning().get();

		const delayMs = scheduledMs - Date.now();
		if (delayMs <= FAST_PATH_THRESHOLD_MS && c.executionCtx?.waitUntil) {
			c.executionCtx.waitUntil(this.armFastPath(c, row.id, delayMs));
		}

		return this.toClient(row);
	},

	// Precise short-delay dispatch for Undo Send (and any other sub-2-minute
	// schedule) — see FAST_PATH_THRESHOLD_MS. Runs in the background past the
	// response via c.executionCtx.waitUntil(); the claim is the same atomic
	// pending->processing UPDATE processDue() uses, so this racing the cron
	// (or a manual cancel/sendNow) can never double-send.
	async armFastPath(c, id, delayMs) {
		await sleep(Math.max(0, delayMs));
		const claimed = await orm(c).update(scheduledEmail)
			.set({ status: STATUS.PROCESSING, updateTime: new Date().toISOString() })
			.where(and(eq(scheduledEmail.id, id), eq(scheduledEmail.status, STATUS.PENDING)))
			.returning().get();
		if (!claimed) return;
		await this.processOne(c, claimed);
	},

	async list(c, userId) {
		const rows = await orm(c).select().from(scheduledEmail)
			.where(eq(scheduledEmail.userId, userId))
			.orderBy(desc(scheduledEmail.scheduledAt))
			.limit(200)
			.all();
		return rows.map(row => this.toClient(row));
	},

	async cancel(c, id, userId) {
		const result = await orm(c).update(scheduledEmail)
			.set({ status: STATUS.CANCELLED, updateTime: new Date().toISOString() })
			.where(and(
				eq(scheduledEmail.id, Number(id)),
				eq(scheduledEmail.userId, userId),
				eq(scheduledEmail.status, STATUS.PENDING)
			))
			.returning().get();
		if (!result) throw new BizError(t('scheduleNotCancellable') || 'This scheduled email can no longer be cancelled', 400);
		return this.toClient(result);
	},

	async reschedule(c, id, userId, { scheduledAt, timezone }) {
		if (!scheduledAt) throw new BizError('scheduledAt is required', 400);
		const scheduledMs = Date.parse(scheduledAt.replace(' ', 'T') + 'Z');
		if (Number.isNaN(scheduledMs) || scheduledMs < Date.now() + MIN_LEAD_SECONDS * 1000) {
			throw new BizError(t('scheduleTooSoon') || 'Scheduled time must be in the future', 400);
		}

		const result = await orm(c).update(scheduledEmail)
			.set({ scheduledAt, timezone: timezone || '', updateTime: new Date().toISOString() })
			.where(and(
				eq(scheduledEmail.id, Number(id)),
				eq(scheduledEmail.userId, userId),
				eq(scheduledEmail.status, STATUS.PENDING)
			))
			.returning().get();
		if (!result) throw new BizError(t('scheduleNotCancellable') || 'This scheduled email can no longer be edited', 400);
		return this.toClient(result);
	},

	// Claims the row (pending -> processing, scoped to this owner) then sends
	// it immediately, bypassing the wait. Uses the exact same processOne()
	// path as the cron so success/failure handling can't drift between the
	// two triggers.
	async sendNow(c, id, userId) {
		const claimed = await orm(c).update(scheduledEmail)
			.set({ status: STATUS.PROCESSING, updateTime: new Date().toISOString() })
			.where(and(
				eq(scheduledEmail.id, Number(id)),
				eq(scheduledEmail.userId, userId),
				eq(scheduledEmail.status, STATUS.PENDING)
			))
			.returning().get();
		if (!claimed) throw new BizError(t('scheduleNotCancellable') || 'This scheduled email can no longer be sent', 400);

		const result = await this.processOne(c, claimed);
		if (result.status === STATUS.FAILED) {
			throw new BizError(result.lastError || 'Send failed', 502);
		}
		return this.toClient(result);
	},

	// Cron entry point (index.js scheduled() dispatches here every minute).
	// Claim is a single atomic UPDATE...RETURNING scoped to status='pending'
	// AND scheduled_at<=now, so two overlapping cron invocations (or a manual
	// sendNow() racing the cron) can never both claim the same row — whichever
	// UPDATE commits first flips status away from 'pending', and the other's
	// WHERE clause simply matches nothing.
	async processDue(c) {
		const nowIso = new Date().toISOString().slice(0, 19).replace('T', ' ');
		const { results } = await c.env.db.prepare(
			`UPDATE scheduled_email SET status = ?, update_time = CURRENT_TIMESTAMP
			 WHERE status = ? AND scheduled_at <= ?
			 RETURNING *`
		).bind(STATUS.PROCESSING, STATUS.PENDING, nowIso).all();

		if (!results || results.length === 0) return { processed: 0 };

		for (const row of results) {
			try {
				await this.processOne(c, this.fromRow(row));
			} catch (e) {
				console.error('scheduled-email processDue: unhandled error for row', row.id, e);
			}
		}

		return { processed: results.length };
	},

	// Shared by processDue() and sendNow() — actually performs the send and
	// records the outcome. `row` must already be claimed (status=processing).
	async processOne(c, row) {
		let payload;
		try {
			payload = JSON.parse(row.payload);
		} catch (e) {
			return this.finalize(c, row, { status: STATUS.FAILED, lastError: 'Corrupt payload: ' + e.message });
		}

		try {
			const sent = await emailService.send(c, payload, row.userId);
			return this.finalize(c, row, {
				status: STATUS.SENT,
				sentTime: new Date().toISOString(),
				resultEmailId: sent?.[0]?.emailId ?? null,
			});
		} catch (e) {
			const attemptCount = row.attemptCount + 1;
			const canRetry = attemptCount < MAX_ATTEMPTS;
			if (canRetry) {
				const retryAt = new Date(Date.now() + RETRY_DELAY_MINUTES * 60 * 1000)
					.toISOString().slice(0, 19).replace('T', ' ');
				return this.finalize(c, row, {
					status: STATUS.PENDING,
					attemptCount,
					lastError: e.message,
					scheduledAt: retryAt,
				});
			}
			return this.finalize(c, row, { status: STATUS.FAILED, attemptCount, lastError: e.message });
		}
	},

	async finalize(c, row, patch) {
		const result = await orm(c).update(scheduledEmail)
			.set({ ...patch, updateTime: new Date().toISOString() })
			.where(eq(scheduledEmail.id, row.id))
			.returning().get();
		return result;
	},

	// D1's raw `.prepare().all()` (used by the atomic claim query in
	// processDue, since drizzle has no portable UPDATE...RETURNING-with-
	// multiple-rows helper) returns snake_case columns — normalize to the
	// same camelCase shape drizzle rows already have everywhere else in this
	// file, so processOne()/finalize() don't need two code paths.
	fromRow(row) {
		return {
			id: row.id,
			userId: row.user_id,
			accountId: row.account_id,
			payload: row.payload,
			scheduledAt: row.scheduled_at,
			timezone: row.timezone,
			status: row.status,
			attemptCount: row.attempt_count,
			lastError: row.last_error,
			createTime: row.create_time,
			updateTime: row.update_time,
			sentTime: row.sent_time,
			resultEmailId: row.result_email_id,
		};
	},

	// Client-facing shape: summarized from the stored payload (to/subject)
	// rather than exposing the raw JSON blob (which may carry base64
	// attachment content — no reason to round-trip that to the Scheduled list UI).
	toClient(row) {
		let summary = {};
		try {
			const p = JSON.parse(row.payload);
			summary = {
				receiveEmail: p.receiveEmail,
				cc: p.cc,
				subject: p.subject,
				attachmentCount: (p.attachments || []).length,
				sendType: p.sendType,
			};
		} catch {}
		return {
			id: row.id,
			accountId: row.accountId,
			scheduledAt: row.scheduledAt,
			timezone: row.timezone,
			status: row.status,
			attemptCount: row.attemptCount,
			lastError: row.lastError,
			createTime: row.createTime,
			sentTime: row.sentTime,
			resultEmailId: row.resultEmailId,
			...summary,
		};
	},

	// "Edit" = atomically cancel the pending row and hand back its full
	// send() payload (including attachments) so Compose can reopen with
	// everything intact — the user then re-submits as a fresh send/schedule
	// rather than this API trying to support in-place partial edits. Atomic
	// so a concurrent cron tick can't fire the row out from under the user
	// mid-edit (same claim pattern as sendNow()).
	async beginEdit(c, id, userId) {
		const claimed = await orm(c).update(scheduledEmail)
			.set({ status: STATUS.CANCELLED, updateTime: new Date().toISOString() })
			.where(and(
				eq(scheduledEmail.id, Number(id)),
				eq(scheduledEmail.userId, userId),
				eq(scheduledEmail.status, STATUS.PENDING)
			))
			.returning().get();
		if (!claimed) throw new BizError(t('scheduleNotCancellable') || 'This scheduled email can no longer be edited', 400);
		let payload;
		try { payload = JSON.parse(claimed.payload); } catch { payload = {}; }
		return { id: claimed.id, scheduledAt: claimed.scheduledAt, timezone: claimed.timezone, ...payload };
	},

};

export default scheduledEmailService;
