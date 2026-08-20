import scheduledEmailService from '../service/scheduled-email-service';

// Cloudflare's durable, guaranteed-delivery delayed-execution primitive —
// used for Undo Send / Scheduled Send's short-delay fast path (see
// scheduled-email-service.js's FAST_PATH_THRESHOLD_MS comment for why this
// exists instead of ctx.waitUntil()+setTimeout).
//
// One DO instance per scheduled_email row (see armAlarm's idFromName). The
// platform persists the alarm and the DO's storage independently of the
// Worker isolate that armed it — it survives isolate eviction, redeploys,
// and Worker restarts, and Cloudflare automatically retries alarm()
// (exponential backoff) if it throws. This is NOT a traditional
// always-on server: the DO only exists/runs when it has work (an armed
// alarm or an in-flight request), the same as any other Worker.
export class ScheduledSendAlarm {
	constructor(state, env) {
		this.state = state;
		this.env = env;
	}

	async fetch(request) {
		const body = await request.json();

		// Used by reschedule() when a row's new time no longer qualifies for
		// the fast path (or the row was cancelled) — clears this instance's
		// alarm so it can't fire at the stale time it was previously armed
		// for. Setting a NEW alarm (the branch below) already implicitly
		// replaces any previous one — setAlarm() overwrites, a DO instance
		// can only ever hold one pending alarm — so disarm is only needed
		// when no replacement alarm should exist at all.
		if (body.action === 'disarm') {
			await this.state.storage.deleteAlarm();
			await this.state.storage.delete('scheduledEmailId');
			return new Response('ok');
		}

		const { scheduledEmailId, whenMs } = body;
		await this.state.storage.put('scheduledEmailId', scheduledEmailId);
		await this.state.storage.setAlarm(whenMs);
		return new Response('ok');
	}

	async alarm() {
		const scheduledEmailId = await this.state.storage.get('scheduledEmailId');
		await this.state.storage.delete('scheduledEmailId');
		if (!scheduledEmailId) return;

		// Mirrors the shape email-service.js/scheduled-email-service.js
		// expect from an HTTP-request-scoped Hono context: .env for bindings,
		// .get()/.set() for the per-request shared-account-id cache used
		// inside emailService.send() -> getSharedAccountIds(). A DO has no
		// such request to piggyback on, so this is a fresh, throwaway one.
		const store = new Map();
		const ctx = { env: this.env, get: (k) => store.get(k), set: (k, v) => store.set(k, v) };

		// If this throws, Cloudflare retries alarm() automatically — on top
		// of that, the row itself stays a durable 'pending' row until
		// claimed, so the once-a-minute cron backstop (processDue) will
		// still catch it even if DO retries are exhausted.
		await scheduledEmailService.claimAndProcessById(ctx, scheduledEmailId);
	}
}

export default ScheduledSendAlarm;
