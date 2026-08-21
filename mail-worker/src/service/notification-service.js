import firebasePushService from './firebase-push-service';
import webPushSubscriptionService from './web-push-subscription-service';
import BizError from '../error/biz-error';
import kvConst from '../const/kv-const';

export const ENSURE = `CREATE TABLE IF NOT EXISTS notification_device (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	user_id INTEGER NOT NULL,
	installation_uuid TEXT,
	platform TEXT NOT NULL,
	target_kind TEXT NOT NULL,
	target_value TEXT NOT NULL,
	device_name TEXT,
	enabled INTEGER NOT NULL DEFAULT 1,
	last_seen_at TEXT,
	created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
	UNIQUE(user_id, target_kind, target_value)
)`;

const ENSURE_INDEX = `CREATE INDEX IF NOT EXISTS idx_notification_device_user
	ON notification_device (user_id, enabled)`;

const PLATFORMS = new Set(['android', 'web', 'ios', 'windows', 'macos', 'linux']);
// FCM HTTP v1's "token" field only accepts an actual registration token —
// a bare Firebase Installation ID can't be sent to directly, so that's the
// only target kind worth persisting today.
const TARGET_KINDS = new Set(['fcm_token']);
// Cloudflare KV requires expirationTtl >= 60 — a lower value makes the KV
// `put()` below throw on every single call, in production too, which is why
// this is 60 and not some shorter "feels responsive" cooldown.
const TEST_COOLDOWN_SECONDS = 60;

const notificationService = {

	async ensureTable(c) {
		try {
			await c.env.db.prepare(ENSURE).run();
			await c.env.db.prepare(ENSURE_INDEX).run();
		} catch {}
	},

	validateDeviceInput(body) {
		const { platform, targetKind, target, deviceName, installationUuid } = body || {};

		if (!PLATFORMS.has(platform)) {
			throw new BizError(`platform must be one of: ${[...PLATFORMS].join(', ')}`, 400);
		}
		if (!TARGET_KINDS.has(targetKind)) {
			throw new BizError(`targetKind must be one of: ${[...TARGET_KINDS].join(', ')}`, 400);
		}
		if (typeof target !== 'string' || !target || target.length > 4096) {
			throw new BizError('target is required and must be at most 4096 characters', 400);
		}
		if (deviceName != null && (typeof deviceName !== 'string' || deviceName.length > 100)) {
			throw new BizError('deviceName must be at most 100 characters', 400);
		}
		if (installationUuid != null && (typeof installationUuid !== 'string' || installationUuid.length > 100)) {
			throw new BizError('installationUuid must be at most 100 characters', 400);
		}
	},

	async registerDevice(c, userId, body) {
		this.validateDeviceInput(body);
		const { platform, targetKind, target, deviceName, installationUuid } = body;

		await c.env.db.prepare(
			`INSERT INTO notification_device (user_id, installation_uuid, platform, target_kind, target_value, device_name, enabled, last_seen_at, updated_at)
			 VALUES (?,?,?,?,?,?,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
			 ON CONFLICT(user_id, target_kind, target_value) DO UPDATE SET
			 	installation_uuid = excluded.installation_uuid,
			 	platform = excluded.platform,
			 	device_name = excluded.device_name,
			 	enabled = 1,
			 	last_seen_at = CURRENT_TIMESTAMP,
			 	updated_at = CURRENT_TIMESTAMP`
		).bind(userId, installationUuid || null, platform, targetKind, target, deviceName || null).run();
	},

	async listDevices(c, userId) {
		const { results } = await c.env.db.prepare(
			`SELECT id, platform, target_kind as targetKind, device_name as deviceName, enabled, last_seen_at as lastSeenAt, created_at as createdAt
			 FROM notification_device WHERE user_id = ? ORDER BY created_at DESC`
		).bind(userId).all();
		return results;
	},

	async removeDevice(c, userId, id) {
		await c.env.db.prepare(`DELETE FROM notification_device WHERE id = ? AND user_id = ?`).bind(id, userId).run();
	},

	async disableDeviceById(c, id) {
		try {
			await c.env.db.prepare(
				`UPDATE notification_device SET enabled = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
			).bind(id).run();
		} catch (e) {
			console.error('disableDeviceById failed', id, e);
		}
	},

	// Fans a new-mail push out to every enabled notification_device row
	// (Android FCM + any still-registered legacy web FCM tokens — see
	// migrations/README.md's migration-strategy note). Never throws into the
	// caller — a push failure must not affect mail receipt.
	async dispatchToFirebaseDevices(c) {
		const { env, userId, accountId, email } = c;
		const stats = { attempted: 0, succeeded: 0, failed: 0, reason: null };

		try {
			await this.ensureTable({ env });

			const { results } = await env.db.prepare(
				`SELECT id, platform, target_kind as targetKind, target_value as targetValue
				 FROM notification_device WHERE user_id = ? AND enabled = 1`
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
					await firebasePushService.sendPush({ env }, device, payload);
					stats.succeeded++;
				} catch (e) {
					stats.failed++;
					if (!stats.reason) {
						stats.reason = /firebase.*secrets|FIREBASE_PROJECT_ID/i.test(e.message)
							? 'FIREBASE_NOT_CONFIGURED'
							: /oauth token exchange/i.test(e.message)
								? 'FIREBASE_AUTH_FAILED'
								: 'FCM_SEND_FAILED';
					}
					console.error('push send failed for device', device.id, e.message);
					if (e && e.invalidDevice) {
						await this.disableDeviceById({ env }, device.id);
					}
				}
			}));
		} catch (e) {
			console.error('dispatchToFirebaseDevices failed', e);
			stats.reason = stats.reason || 'FCM_SEND_FAILED';
		}

		return stats;
	},

	// Fans a new-mail push out across BOTH device pools — notification_device
	// (Android FCM + legacy web FCM tokens) and web_push_subscription
	// (standards Web Push for browser/PWA, see web-push-subscription-service.js)
	// — and merges the delivery stats. A pool with zero rows never masks a
	// real failure in the other pool: NO_REGISTERED_DEVICE only wins when both
	// pools attempted zero sends.
	async dispatchNewMail(c) {
		const { env, userId, accountId, email } = c;

		const [firebaseStats, webPushStats] = await Promise.all([
			this.dispatchToFirebaseDevices(c),
			webPushSubscriptionService.dispatchNewMail({ env, userId, accountId, email })
		]);

		const stats = {
			attempted: firebaseStats.attempted + webPushStats.attempted,
			succeeded: firebaseStats.succeeded + webPushStats.succeeded,
			failed: firebaseStats.failed + webPushStats.failed,
			reason: null
		};

		if (stats.attempted === 0) {
			stats.reason = 'NO_REGISTERED_DEVICE';
		} else if (stats.succeeded === 0) {
			stats.reason = firebaseStats.reason && firebaseStats.reason !== 'NO_REGISTERED_DEVICE'
				? firebaseStats.reason
				: webPushStats.reason;
		}

		return stats;
	},

	async sendTest(c, userId) {
		const limitKey = kvConst.NOTIFICATION_TEST_LIMIT + userId;
		if (await c.env.kv.get(limitKey)) {
			throw new BizError(`Please wait ${TEST_COOLDOWN_SECONDS}s between test notifications`, 429);
		}
		await c.env.kv.put(limitKey, '1', { expirationTtl: TEST_COOLDOWN_SECONDS });

		// Scoped to notification_device only (Android FCM + legacy web FCM) —
		// web_push_subscription has its own /web-push/test endpoint (see
		// web-push-subscription-service.js#sendTest) so a test click for one
		// platform never fires a push at the other.
		const stats = await this.dispatchToFirebaseDevices({
			env: c.env,
			userId,
			accountId: 0,
			email: { name: 'PSG Mail', sendEmail: 'system', subject: 'This is a test notification', emailId: 0 }
		});

		if (stats.attempted === 0) {
			throw new BizError('NO_REGISTERED_DEVICE', 404);
		}
		if (stats.succeeded === 0) {
			throw new BizError(stats.reason || 'FCM_SEND_FAILED', 502);
		}

		return stats;
	}
};

export default notificationService;
