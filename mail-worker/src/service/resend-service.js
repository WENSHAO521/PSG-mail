import emailService from './email-service';
import { emailConst } from '../const/entity-const';

const resendService = {

	async webhooks(c, body) {

		const params = {
			resendEmailId: body?.data?.email_id,
			status: null
		}

		if (body.type === 'email.sent') {
			params.status = emailConst.status.SENT
			params.message = null
		}

		if (body.type === 'email.delivered') {
			params.status = emailConst.status.DELIVERED
			params.message = null
		}

		if (body.type === 'email.complained') {
			params.status = emailConst.status.COMPLAINED
			params.message = null
		}

		if (body.type === 'email.bounced') {
			let bounce = body.data.bounce
			bounce = JSON.stringify(bounce);
			params.status = emailConst.status.BOUNCED
			params.message = bounce
		}

		if (body.type === 'email.delivery_delayed') {
			params.status = emailConst.status.DELAYED
			params.message = null
		}

		if (body.type === 'email.failed') {
			params.status = emailConst.status.FAILED
			params.message = body.data.failed.reason
		}

		// Events that carry no delivery state (opened, clicked, scheduled…)
		// must not overwrite one: an "opened" used to reset Delivered to Sent.
		if (params.status === null || !params.resendEmailId) {
			return
		}

		const emailRow = await emailService.updateEmailStatus(c, params)

		// A mail this deployment never sent (another service on the same
		// Resend account, a test event, old data). Answering 500 here makes
		// Resend disable the webhook after repeated failures.
		if (!emailRow) {
			console.warn(`resend webhook: unknown email_id ${params.resendEmailId}, type ${body.type}`);
		}

	}
}

export default resendService
