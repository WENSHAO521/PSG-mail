// Inbound webhook verification.
//
// One interface for every provider: verify(c, provider, rawBody) resolves to
// { ok: true, id } or { ok: false, reason }. Each provider entry knows where
// its secret lives and how its signature is computed; replay protection
// (timestamp window + one-time message id in KV) is shared.
//
// Resend signs with Svix / Standard Webhooks:
//   headers  svix-id, svix-timestamp, svix-signature ("v1,<b64> v1,<b64>...")
//   secret   "whsec_<base64 key>"  (Worker Secret RESEND_WEBHOOK_SECRET)
//   signed   `${id}.${timestamp}.${rawBody}` with HMAC-SHA256
// https://resend.com/docs/dashboard/webhooks/verify-webhooks-requests

const encoder = new TextEncoder();
export const TOLERANCE_SECONDS = 5 * 60;
const REPLAY_TTL = 24 * 3600;

function b64ToBytes(b64) {
	return Uint8Array.from(atob(b64), ch => ch.charCodeAt(0));
}

function bytesToB64(buf) {
	let s = '';
	for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
	return btoa(s);
}

function safeEqual(a, b) {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}

// Standard Webhooks / Svix scheme (also used by other providers).
async function verifyStandardWebhook({ secret, id, timestamp, signatureHeader, rawBody, now }) {
	if (!secret) return { ok: false, reason: 'secret_not_configured' };
	if (!id || !timestamp || !signatureHeader) return { ok: false, reason: 'missing_headers' };

	const ts = Number(timestamp);
	if (!Number.isInteger(ts) || Math.abs(now - ts) > TOLERANCE_SECONDS) {
		return { ok: false, reason: 'timestamp_out_of_window' };
	}

	const keyB64 = secret.startsWith('whsec_') ? secret.slice(6) : secret;
	let keyBytes;
	try { keyBytes = b64ToBytes(keyB64); } catch { return { ok: false, reason: 'bad_secret' }; }

	const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
	const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(`${id}.${timestamp}.${rawBody}`));
	const expected = bytesToB64(mac);

	const candidates = signatureHeader.split(' ')
		.map(part => part.split(','))
		.filter(([version, sig]) => version === 'v1' && sig)
		.map(([, sig]) => sig);

	if (!candidates.some(sig => safeEqual(sig, expected))) {
		return { ok: false, reason: 'bad_signature' };
	}
	return { ok: true, id };
}

const PROVIDERS = {
	resend: {
		secret: (c) => c.env.RESEND_WEBHOOK_SECRET,
		verify: (c, rawBody, now) => verifyStandardWebhook({
			secret: c.env.RESEND_WEBHOOK_SECRET,
			id: c.req.header('svix-id') || c.req.header('webhook-id'),
			timestamp: c.req.header('svix-timestamp') || c.req.header('webhook-timestamp'),
			signatureHeader: c.req.header('svix-signature') || c.req.header('webhook-signature'),
			rawBody,
			now
		})
	}
	// Further providers (Mailjet event API, Alibaba DirectMail callbacks…)
	// register here with their own secret + scheme.
};

function replayKey(provider, id) {
	return `webhook_seen:${provider}:${id}`;
}

const webhookVerifier = {

	providers: Object.keys(PROVIDERS),

	// WEBHOOK_ALLOW_UNSIGNED=true restores the 3.x behavior (accept anything)
	// for a deployment that has not configured the signing secret yet. Off by
	// default: an unsigned status webhook lets anyone mark mail as
	// delivered/bounced.
	allowUnsigned(c) {
		return String(c.env.WEBHOOK_ALLOW_UNSIGNED) === 'true';
	},

	async verify(c, provider, rawBody, now = Math.floor(Date.now() / 1000)) {
		const p = PROVIDERS[provider];
		if (!p) return { ok: false, reason: 'unknown_provider' };

		if (!p.secret(c)) {
			return this.allowUnsigned(c)
				? { ok: true, id: null, unsigned: true }
				: { ok: false, reason: 'secret_not_configured' };
		}

		const res = await p.verify(c, rawBody, now);
		if (!res.ok) return res;

		// Replay protection: each message id is applied once. The id is
		// recorded by markProcessed() only AFTER the handler succeeded, so a
		// provider retry of a delivery that failed on our side still gets
		// processed. (The timestamp window bounds how long ids need
		// remembering; KV keeps them 24h.)
		if (await c.env.kv.get(replayKey(provider, res.id))) {
			return { ok: false, reason: 'replay', id: res.id, duplicate: true };
		}
		return res;
	},

	async markProcessed(c, provider, id) {
		if (!id) return;
		await c.env.kv.put(replayKey(provider, id), '1', { expirationTtl: REPLAY_TTL });
	}
};

export { verifyStandardWebhook };
export default webhookVerifier;
