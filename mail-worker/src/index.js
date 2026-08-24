// Must load before anything that might touch the S3 client — see the file
// for why (@aws-sdk/client-s3's XML parser needs a DOMParser/Node global
// that workerd doesn't provide).
import './utils/xml-parser-polyfill';
import app from './hono/webs';
import { email } from './email/email';
import userService from './service/user-service';
import verifyRecordService from './service/verify-record-service';
import emailService from './service/email-service';
import kvObjService from './service/kv-obj-service';
import oauthService from "./service/oauth-service";
import analysisService from './service/analysis-service';
import scheduledEmailService from './service/scheduled-email-service';
import forwardingService from './service/forwarding-service';
// Durable Object classes must be exported by name from the Worker's main
// entry — this is that export, not a self-contained secondary Worker. See
// src/durable/scheduled-send-alarm.js for what it's for.
export { ScheduledSendAlarm } from './durable/scheduled-send-alarm';
export default {
	 async fetch(req, env, ctx) {

		const url = new URL(req.url)

		if (url.pathname.startsWith('/api/')) {
			url.pathname = url.pathname.replace('/api', '')
			req = new Request(url.toString(), req)
			return app.fetch(req, env, ctx);
		}

		 if (['/static/','/attachments/'].some(p => url.pathname.startsWith(p))) {
			 return await kvObjService.toObjResp( { env }, url.pathname.substring(1));
		 }

		return env.assets.fetch(req);
	},
	email: email,
	async scheduled(c, env, ctx) {
		if (c.cron === '* * * * *') {
			await Promise.all([
				scheduledEmailService.processDue({ env }),
				forwardingService.processDue({ env }),
			])
			return;
		}

		if (c.cron === '*/30 * * * *') {
			await analysisService.refreshEchartsCache({ env })
			return;
		}

		await verifyRecordService.clearRecord({ env })
		await userService.resetDaySendCount({ env })
		await emailService.completeReceiveAll({ env })
		await emailService.purgeExpiredTrash({ env })
		await oauthService.clearNoBindOathUser({ env })
		await analysisService.refreshEchartsCache({ env })
	},
};
