import emailService from './email-service';
import { emailConst } from '../const/entity-const';
import deliveryEventService from './delivery-event-service';

const S = emailConst.status;

// Resend event type → email.status. Anything not listed (email.opened,
// email.clicked, contact.*, domain.*...) is acknowledged and ignored — 3.x
// fell through to SENT for those, so an "opened" event downgraded a
// DELIVERED mail back to SENT.
const EVENT_STATUS = {
	'email.sent': S.SENT,
	'email.delivered': S.DELIVERED,
	'email.delivery_delayed': S.DELAYED,
	'email.bounced': S.BOUNCED,
	'email.complained': S.COMPLAINED,
	'email.failed': S.FAILED,
};

// Events can arrive out of order (Resend retries independently). A final
// state is never overwritten by a transient one; COMPLAINED may still follow
// DELIVERED since a complaint is always later than delivery.
const TERMINAL = new Set([S.DELIVERED, S.BOUNCED, S.COMPLAINED, S.FAILED]);
const RANK = { [S.SENT]: 1, [S.DELAYED]: 2, [S.DELIVERED]: 3, [S.FAILED]: 3, [S.BOUNCED]: 4, [S.COMPLAINED]: 5 };

export function shouldApply(currentStatus, nextStatus) {
	if (!TERMINAL.has(currentStatus)) return true;
	return (RANK[nextStatus] || 0) > (RANK[currentStatus] || 0);
}

const resendService = {

	async webhooks(c, body, { eventId = null } = {}) {

		const status = EVENT_STATUS[body?.type];
		const resendEmailId = body?.data?.email_id;
		if (status === undefined || !resendEmailId) {
			return { applied: false, reason: 'ignored_event' };
		}

		let message = null;
		if (body.type === 'email.bounced') {
			message = JSON.stringify(body.data.bounce ?? null);
		}
		if (body.type === 'email.failed') {
			message = body.data.failed?.reason ?? null;
		}

		const current = await c.env.db.prepare('SELECT email_id, status FROM email WHERE resend_email_id = ? LIMIT 1')
			.bind(resendEmailId).first();

		// Not ours (another system on the same Resend account, or the mail
		// was purged). Acknowledge instead of 500-ing into endless retries.
		if (!current) {
			return { applied: false, reason: 'unknown_email' };
		}

		await deliveryEventService.record(c, {
			emailId: current.email_id,
			provider: 'resend',
			providerMessageId: resendEmailId,
			providerEventId: eventId,
			eventType: body.type,
			status,
			detail: message
		});

		if (!shouldApply(current.status, status)) {
			return { applied: false, reason: 'stale_event' };
		}

		await emailService.updateEmailStatus(c, { resendEmailId, status, message });
		return { applied: true };
	}
}

export default resendService
