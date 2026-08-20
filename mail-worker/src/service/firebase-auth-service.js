import kvConst from '../const/kv-const';

// Exchanges the Firebase service-account credentials for a short-lived
// Google OAuth access token, scoped to FCM HTTP v1 send. Cached in KV so
// each outgoing push doesn't pay for a fresh RSA sign + token exchange.
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const TOKEN_TTL = 3600;
const CACHE_TTL = TOKEN_TTL - 120; // refresh a couple minutes before Google expires it

function base64UrlFromBytes(bytes) {
	let str = '';
	for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
	return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlFromString(str) {
	return base64UrlFromBytes(new TextEncoder().encode(str));
}

function pemToArrayBuffer(pem) {
	const clean = pem
		.replace(/-----BEGIN PRIVATE KEY-----/, '')
		.replace(/-----END PRIVATE KEY-----/, '')
		.replace(/\\n/g, '')
		.replace(/\s+/g, '');
	const binary = atob(clean);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes.buffer;
}

async function signJwt(clientEmail, privateKeyPem) {
	const key = await crypto.subtle.importKey(
		'pkcs8',
		pemToArrayBuffer(privateKeyPem),
		{ name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
		false,
		['sign']
	);

	const now = Math.floor(Date.now() / 1000);
	const header = { alg: 'RS256', typ: 'JWT' };
	const claims = {
		iss: clientEmail,
		scope: SCOPE,
		aud: TOKEN_URL,
		iat: now,
		exp: now + TOKEN_TTL
	};

	const signingInput = `${base64UrlFromString(JSON.stringify(header))}.${base64UrlFromString(JSON.stringify(claims))}`;
	const signature = await crypto.subtle.sign(
		{ name: 'RSASSA-PKCS1-v1_5' },
		key,
		new TextEncoder().encode(signingInput)
	);

	return `${signingInput}.${base64UrlFromBytes(new Uint8Array(signature))}`;
}

const firebaseAuthService = {

	async getAccessToken(c) {
		const { env } = c;
		const cached = await env.kv.get(kvConst.FIREBASE_ACCESS_TOKEN);
		if (cached) return cached;

		const clientEmail = env.FIREBASE_CLIENT_EMAIL;
		const privateKey = env.FIREBASE_PRIVATE_KEY;

		if (!clientEmail || !privateKey) {
			throw new Error('Firebase service account secrets are not configured');
		}

		const jwt = await signJwt(clientEmail, privateKey);

		const res = await fetch(TOKEN_URL, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
				assertion: jwt
			})
		});

		if (!res.ok) {
			const text = await res.text();
			throw new Error(`Firebase OAuth token exchange failed (${res.status}): ${text}`);
		}

		const { access_token } = await res.json();
		await env.kv.put(kvConst.FIREBASE_ACCESS_TOKEN, access_token, { expirationTtl: CACHE_TTL });
		return access_token;
	}
};

export default firebaseAuthService;
