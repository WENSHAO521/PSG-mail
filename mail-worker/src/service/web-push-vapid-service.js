// RFC 8292 (VAPID) — signs the ES256 JWT that authenticates this server to
// the push service (FCM/Mozilla autopush/Apple's web push all speak the same
// standard, so this has no per-vendor branching). Mirrors the RS256
// JWT-signing style already used in firebase-auth-service.js, but ECDSA
// P-256 instead of RSA, and via a JWK-format private key: Web Crypto's
// exportKey('raw', ...) is public-key-only for EC keys (no way to hand-roll
// a PKCS8 private export without ASN.1), so the generator script exports the
// private half as JWK, and this file imports it the same way.

function base64UrlFromBytes(bytes) {
	let str = '';
	for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
	return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function importVapidPrivateKey(jwkJson) {
	const jwk = JSON.parse(jwkJson);
	return crypto.subtle.importKey(
		'jwk', jwk,
		{ name: 'ECDSA', namedCurve: 'P-256' },
		false,
		['sign']
	);
}

async function signVapidJwt(privateKey, { aud, sub, exp }) {
	const header = { typ: 'JWT', alg: 'ES256' };
	const claims = { aud, sub, exp };
	const signingInput =
		`${base64UrlFromBytes(new TextEncoder().encode(JSON.stringify(header)))}.` +
		`${base64UrlFromBytes(new TextEncoder().encode(JSON.stringify(claims)))}`;

	// Web Crypto's ECDSA signature for P-256 is already raw r||s (64 bytes) —
	// exactly the fixed-length format JWS ES256 requires. Unlike Node's
	// crypto.sign() (DER by default), no re-encoding step is needed here.
	const signature = await crypto.subtle.sign(
		{ name: 'ECDSA', hash: { name: 'SHA-256' } },
		privateKey,
		new TextEncoder().encode(signingInput)
	);

	return `${signingInput}.${base64UrlFromBytes(new Uint8Array(signature))}`;
}

const webPushVapidService = {
	// Builds the `Authorization: vapid t=<jwt>, k=<publicKey>` header for a
	// push to `endpointUrl`. No Crypto-Key header — that's only used by the
	// deprecated `aesgcm` content-encoding, never `aes128gcm`. `aud` must be
	// recomputed per-endpoint (its own origin), never hardcoded to one push
	// service, since Chrome/Edge, Firefox, and Safari each use a different one.
	async buildAuthorizationHeader(env, endpointUrl) {
		const privateKeyJwk = env.VAPID_PRIVATE_KEY_JWK;
		const publicKey = env.VAPID_PUBLIC_KEY;
		if (!privateKeyJwk || !publicKey) {
			throw new Error('VAPID keys are not configured');
		}

		const privateKey = await importVapidPrivateKey(privateKeyJwk);
		const aud = new URL(endpointUrl).origin;
		const now = Math.floor(Date.now() / 1000);
		const jwt = await signVapidJwt(privateKey, {
			aud,
			sub: env.VAPID_SUBJECT || 'mailto:admin@example.com',
			exp: now + 12 * 60 * 60 // 12h; RFC max is 24h, stay well under
		});

		return `vapid t=${jwt}, k=${publicKey}`;
	}
};

export default webPushVapidService;
