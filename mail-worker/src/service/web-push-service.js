import webPushCryptoService from './web-push-crypto-service';
import webPushVapidService from './web-push-vapid-service';

function base64UrlToBytes(b64url) {
	const padded = b64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(b64url.length / 4) * 4, '=');
	const binary = atob(padded);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

const webPushService = {
	// device: { id, endpoint, p256dh, auth }. Same success/error contract as
	// firebase-push-service.js#sendPush (throws with .invalidDevice on a dead
	// subscription) so notification-service.js's dispatch loop and
	// disableDeviceById-style cleanup work unmodified across both transports.
	async sendPush(c, device, payload) {
		const { env } = c;

		const uaPublic = base64UrlToBytes(device.p256dh);
		const authSecret = base64UrlToBytes(device.auth);
		const plaintext = new TextEncoder().encode(JSON.stringify(payload));

		const body = await webPushCryptoService.encryptPayload(uaPublic, authSecret, plaintext);
		const authorization = await webPushVapidService.buildAuthorizationHeader(env, device.endpoint);

		const res = await fetch(device.endpoint, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/octet-stream',
				'Content-Encoding': 'aes128gcm',
				'TTL': '86400',
				'Urgency': 'normal',
				'Authorization': authorization
			},
			body
		});

		if (res.ok) return true;

		const text = await res.text().catch(() => '');
		const error = new Error(`Web Push send failed (${res.status}): ${text}`);
		error.status = res.status;
		// RFC 8030 §7 — 404/410 means the push service itself has dropped this
		// subscription (uninstalled/expired/unsubscribed) — a dead device, safe
		// to auto-disable. Anything else (401/403 bad VAPID, 413 too large, 429
		// rate limited, 5xx transient) is not a reason to disable the device.
		error.invalidDevice = res.status === 404 || res.status === 410;
		throw error;
	}
};

export default webPushService;
