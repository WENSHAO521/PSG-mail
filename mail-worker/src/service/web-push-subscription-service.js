import webPushService from './web-push-service';
import BizError from '../error/biz-error';
import kvConst from '../const/kv-const';

// Cloudflare KV requires expirationTtl >= 60 (see notification-service.js's
// identical note) — matches that file's cooldown value, kept as a separate
// KV key so a web test click never shares/consumes an Android test's cooldown.
const TEST_COOLDOWN_SECONDS = 60;

function base64UrlToBytes(b64url) {
	try {
		const padded = b64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(b64url.length / 4) * 4, '=');
		const binary = atob(padded);
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
		return bytes;
	} catch {
		return null;
	}
}

const webPushSubscriptionService = {

	validateSubscriptionInput(body) {
		const { endpoint, p256dh, auth, deviceName } = body || {};

		if (typeof endpoint !== 'string' || !/^https:\/\//.test(endpoint) || endpoint.length > 2048) {
			throw new BizError('endpoint must be an https URL', 400);
		}
		if (typeof p256dh !== 'string' || p256dh.length > 200) {
			throw new BizError('p256dh is required', 400);
		}
		if (typeof auth !== 'string' || auth.length > 100) {
			throw new BizError('auth is required', 400);
		}
		const p256dhBytes = base64UrlToBytes(p256dh);
		if (!p256dhBytes || p256dhBytes.length !== 65 || p256dhBytes[0] !== 0x04) {
			throw new BizError('p256dh must decode to a 65-byte uncompressed P-256 point', 400);
		}
		const authBytes = base64UrlToBytes(auth);
		if (!authBytes || authBytes.length !== 16) {
			throw new BizError('auth must decode to 16 bytes', 400);
		}
		if (deviceName != null && (typeof deviceName !== 'string' || deviceName.length > 100)) {
			throw new BizError('deviceName must be at most 100 characters', 400);
		}
	},

	async registerSubscription(c, userId, body) {
		this.validateSubscriptionInput(body);
		const { endpoint, p256dh, auth, deviceName, userAgent, platform } = body;

		await c.env.db.prepare(
			`INSERT INTO web_push_subscription (user_id, endpoint, p256dh, auth, platform, device_name, user_agent, enabled, last_seen_time, update_time)
			 VALUES (?,?,?,?,?,?,?,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
			 ON CONFLICT(endpoint) DO UPDATE SET
			 	user_id = excluded.user_id,
			 	p256dh = excluded.p256dh,
			 	auth = excluded.auth,
			 	platform = excluded.platform,
			 	device_name = excluded.device_name,
			 	user_agent = excluded.user_agent,
			 	enabled = 1,
			 	last_seen_time = CURRENT_TIMESTAMP,
			 	update_time = CURRENT_TIMESTAMP`
		).bind(userId, endpoint, p256dh, auth, platform || 'web', deviceName || null, userAgent || null).run();
	},

	async listSubscriptions(c, userId) {
		const { results } = await c.env.db.prepare(
			`SELECT id, platform, device_name as deviceName, user_agent as userAgent, enabled,
			 	last_seen_time as lastSeenTime, create_time as createTime
			 FROM web_push_subscription WHERE user_id = ? ORDER BY create_time DESC`
		).bind(userId).all();
		return results;
	},

	async removeSubscription(c, userId, id) {
		await c.env.db.prepare(`DELETE FROM web_push_subscription WHERE id = ? AND user_id = ?`).bind(id, userId).run();
	},

	async disableById(c, id) {
		try {
			await c.env.db.prepare(
				`UPDATE web_push_subscription SET enabled = 0, update_time = CURRENT_TIMESTAMP WHERE id = ?`
			).bind(id).run();
		} catch (e) {
			console.error('web_push_subscription disableById failed', id, e);
		}
	},

	// Fans a new-mail push out to every enabled web subscription for the user.
	// Never throws into the caller — mirrors notification-service.js#dispatchNewMail
	// (called alongside it, same stats shape, so the two can be merged by the caller).
	async dispatchNewMail(c) {
		const { env, userId, email, accountId } = c;
		const stats = { attempted: 0, succeeded: 0, failed: 0, reason: null };

		try {
			const { results } = await env.db.prepare(
				`SELECT id, endpoint, p256dh, auth FROM web_push_subscription WHERE user_id = ? AND enabled = 1`
			).bind(userId).all();

			if (!results || results.length === 0) {
				stats.reason = 'NO_REGISTERED_DEVICE';
				return stats;
			}

			stats.attempted = results.length;

			const payload = {
				title: email.name || email.sendEmail || 'PSG Mail',
				body: email.subject || '',
				data: {
					type: 'new_mail',
					emailId: email.emailId,
					accountId,
					name: email.name || email.sendEmail || '',
					subject: email.subject || ''
				}
			};

			await Promise.all(results.map(async device => {
				try {
					await webPushService.sendPush({ env }, device, payload);
					stats.succeeded++;
				} catch (e) {
					stats.failed++;
					if (!stats.reason) {
						stats.reason = /VAPID keys are not configured/.test(e.message)
							? 'WEB_PUSH_NOT_CONFIGURED'
							: (e.status === 401 || e.status === 403)
								? 'WEB_PUSH_AUTH_FAILED'
								: 'WEB_PUSH_SEND_FAILED';
					}
					console.error('web push send failed for device', device.id, e.message);
					if (e && e.invalidDevice) {
						await this.disableById({ env }, device.id);
					}
				}
			}));
		} catch (e) {
			console.error('web_push_subscription dispatchNewMail failed', e);
			stats.reason = stats.reason || 'WEB_PUSH_SEND_FAILED';
		}

		return stats;
	},

	async sendTest(c, userId) {
		const limitKey = kvConst.WEB_PUSH_TEST_LIMIT + userId;
		if (await c.env.kv.get(limitKey)) {
			throw new BizError(`Please wait ${TEST_COOLDOWN_SECONDS}s between test notifications`, 429);
		}
		await c.env.kv.put(limitKey, '1', { expirationTtl: TEST_COOLDOWN_SECONDS });

		const stats = await this.dispatchNewMail({
			env: c.env,
			userId,
			accountId: 0,
			email: { name: 'PSG Mail', sendEmail: 'system', subject: 'This is a test notification', emailId: 0 }
		});

		if (stats.attempted === 0) {
			throw new BizError('NO_REGISTERED_DEVICE', 404);
		}
		if (stats.succeeded === 0) {
			throw new BizError(stats.reason || 'WEB_PUSH_SEND_FAILED', 502);
		}

		return stats;
	}
};

export default webPushSubscriptionService;
