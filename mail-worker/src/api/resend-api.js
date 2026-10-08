import resendService from '../service/resend-service';
import app from '../hono/hono';
import webhookVerifier from '../security/webhook-verifier';
import securityAuditService, { SecurityEvent } from '../service/security-audit-service';

// Resend delivery-status webhook. Unauthenticated by nature (security.js
// exclude list), so the Svix signature IS the authentication — verified on
// the raw body before anything is parsed.
app.post('/webhooks', async (c) => {
	const rawBody = await c.req.text();
	const check = await webhookVerifier.verify(c, 'resend', rawBody);

	if (!check.ok) {
		// A replayed-but-valid delivery was already processed: tell Resend it
		// succeeded so it stops retrying, but don't apply it twice.
		if (check.duplicate) return c.text('duplicate', 200);
		await securityAuditService.log(c, SecurityEvent.WEBHOOK_REJECTED, { detail: { provider: 'resend', reason: check.reason } });
		return c.text('invalid signature', 401);
	}

	let body;
	try {
		body = JSON.parse(rawBody);
	} catch {
		return c.text('bad request', 400);
	}

	try {
		await resendService.webhooks(c, body, { eventId: check.id });
		await webhookVerifier.markProcessed(c, 'resend', check.id);
		return c.text('success', 200)
	} catch (e) {
		console.error('resend webhook failed:', e?.message);
		return c.text('error', 500)
	}
})
