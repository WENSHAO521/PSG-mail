import { recordMetric } from '../service/ops-metrics';
import resendService from '../service/resend-service';
import app from '../hono/hono';
import { verifySvix } from '../utils/svix-verify';

const DEDUPE_TTL_SECONDS = 10 * 60; // longer than the 5 min signature tolerance, so a replay can never land after expiry

app.post('/webhooks', async (c) => {
	try {
		const raw = await c.req.text();
		const secret = c.env.resend_webhook_secret;

		if (secret) {
			if (!(await verifySvix(secret, c.req.raw.headers, raw))) {
				recordMetric(c, 'webhook.invalid_signature');
				return c.text('invalid signature', 401);
			}
		} else if (c.env.resend_webhook_insecure !== 'true') {
			// Fail closed: without a secret anyone could forge delivered/bounced/complained states.
			console.warn('resend webhook rejected: resend_webhook_secret is not configured');
			recordMetric(c, 'webhook.rejected_no_secret');
			return c.text('webhook secret not configured', 401);
		}

		// Idempotency: a signed event id is processed once (KV is best-effort, not atomic).
		const eventId = secret ? c.req.header('svix-id') : null;
		const dedupeKey = eventId ? `webhook_evt:${eventId}` : null;
		if (dedupeKey && await c.env.kv.get(dedupeKey)) {
			recordMetric(c, 'webhook.replay_ignored');
			return c.text('success', 200);
		}

		await resendService.webhooks(c, JSON.parse(raw));

		if (dedupeKey) {
			await c.env.kv.put(dedupeKey, '1', { expirationTtl: DEDUPE_TTL_SECONDS });
		}
		return c.text('success', 200);
	} catch (e) {
		console.error('resend webhook failed', e?.message);
		recordMetric(c, 'webhook.error');
		return c.text('webhook processing failed', 500);
	}
});
