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
import { safeObjectResponse } from './utils/safe-object-response';
import forwardingService from './service/forwarding-service';
import { bump, flushMetrics, purgeOldMetrics } from './service/ops-metrics';
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
			 const obj = await kvObjService.toObjResp( { env }, url.pathname.substring(1));
			 return obj ? safeObjectResponse(obj) : new Response('Not Found', { status: 404 });
		 }

		return env.assets.fetch(req);
	},
	email: email,
	async scheduled(c, env, ctx) {
		try {
			await runScheduled(c, env);
		} finally {
			await flushMetrics(env);
		}
	},
};

async function runScheduled(c, env) {
	if (c.cron === '* * * * *') {
		// Per-minute fallback. Only outcomes worth looking at are recorded (never "ran, nothing due"),
		// so monitoring adds no D1 writes to idle minutes.
		const started = Date.now();
		const [sched, fwd] = await Promise.allSettled([
			scheduledEmailService.processDue({ env }),
			forwardingService.processDue({ env }),
		]);
		if (sched.status === 'rejected') { bump('cron.minute.scheduled_error'); console.error('minute cron scheduled-mail failed', sched.reason?.message); }
		if (fwd.status === 'rejected') { bump('cron.minute.forwarding_error'); console.error('minute cron forwarding failed', fwd.reason?.message); }
		const processed = sched.status === 'fulfilled' ? Number(sched.value?.processed || 0) : 0;
		if (processed > 0) bump('cron.minute.scheduled_processed', { n: processed, ms: Date.now() - started });
		// Keep the cron run marked as failed in Cloudflare when a job threw, as before.
		if (sched.status === 'rejected') throw sched.reason;
		if (fwd.status === 'rejected') throw fwd.reason;
		return;
	}

	if (c.cron === '*/30 * * * *') {
		await timed('cron.stats_refresh', () => analysisService.refreshEchartsCache({ env }, { onlyIfChanged: true }));
		return;
	}

	// Independent jobs: one failing (e.g. a table not migrated yet) must not skip the rest.
	const jobs = [
		['clearRecord', () => verifyRecordService.clearRecord({ env })],
		['resetDaySendCount', () => userService.resetDaySendCount({ env })],
		['completeReceiveAll', () => emailService.completeReceiveAll({ env })],
		['purgeExpiredTrash', () => emailService.purgeExpiredTrash({ env })],
		['autoClean', () => emailService.autoClean({ env })],
		['clearNoBindOathUser', () => oauthService.clearNoBindOathUser({ env })],
		['refreshEchartsCache', () => analysisService.refreshEchartsCache({ env })],
		['purgeOpsMetrics', () => purgeOldMetrics(env)],
	];
	for (const [name, job] of jobs) {
		await timed('cron.daily.' + name.replace(/[A-Z]/g, ch => '_' + ch.toLowerCase()), job);
	}
}

// Runs a cron job, records its duration, and records + logs a failure without throwing.
async function timed(metric, job) {
	const started = Date.now();
	try {
		await job();
		bump(metric, { ms: Date.now() - started });
	} catch (e) {
		bump(metric + '_error', { ms: Date.now() - started });
		console.error(`cron job failed: ${metric}`, e?.message);
	}
}
