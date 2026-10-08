const encoder = new TextEncoder();
const decoder = new TextDecoder();

const base64url = (input) => {
	const str = btoa(String.fromCharCode(...new Uint8Array(input)));
	return str.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
};

const base64urlDecode = (str) => {
	str = str.replace(/-/g, '+').replace(/_/g, '/');
	while (str.length % 4) str += '=';
	return Uint8Array.from(atob(str), c => c.charCodeAt(0));
};

function secretOf(c) {
	const secret = c.env.jwt_secret;
	if (!secret) {
		// Fail closed: an empty HMAC key makes every token forgeable. (No
		// minimum length enforced here — that would lock out deployments
		// with an existing short secret; the deploy checklist covers it.)
		throw new Error('jwt_secret is not configured');
	}
	return secret;
}

const jwtUtils = {
	async generateToken(c, payload, expiresInSeconds) {
		const header = {
			alg: 'HS256',
			typ: 'JWT'
		};

		const now = Math.floor(Date.now() / 1000);
		const exp = expiresInSeconds ? now + expiresInSeconds : undefined;

		const fullPayload = {
			...payload,
			iat: now,
			...(exp ? { exp } : {})
		};

		const headerStr = base64url(encoder.encode(JSON.stringify(header)));
		const payloadStr = base64url(encoder.encode(JSON.stringify(fullPayload)));
		const data = `${headerStr}.${payloadStr}`;

		const key = await crypto.subtle.importKey(
			'raw',
			encoder.encode(secretOf(c)),
			{ name: 'HMAC', hash: 'SHA-256' },
			false,
			['sign']
		);

		const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
		const signatureStr = base64url(signature);

		return `${data}.${signatureStr}`;
	},

	async verifyToken(c, token) {
		try {
			// Public endpoints (for example websiteConfig) legitimately arrive
			// without an Authorization header. Treat that as an anonymous request
			// instead of calling split() on undefined and polluting Worker logs.
			if (typeof token !== 'string' || !token) return null;
			const [headerB64, payloadB64, signatureB64] = token.split('.');

			if (!headerB64 || !payloadB64 || !signatureB64) return null;

			const header = JSON.parse(decoder.decode(base64urlDecode(headerB64)));
			if (header?.alg !== 'HS256') return null;

			const data = `${headerB64}.${payloadB64}`;
			const key = await crypto.subtle.importKey(
				'raw',
				encoder.encode(secretOf(c)),
				{ name: 'HMAC', hash: 'SHA-256' },
				false,
				['verify']
			);

			const valid = await crypto.subtle.verify(
				'HMAC',
				key,
				base64urlDecode(signatureB64),
				encoder.encode(data)
			);

			if (!valid) return null;

			const payloadJson = decoder.decode(base64urlDecode(payloadB64));
			const payload = JSON.parse(payloadJson);

			const now = Math.floor(Date.now() / 1000);
			// Tokens issued by 3.x carry no exp; those stay valid exactly as
			// long as their session id is in the KV allow-list (checked by
			// security.js), which has its own 30-day TTL.
			if (payload.exp && payload.exp < now) return null;

			return payload;

		} catch (err) {
			if (String(err?.message).startsWith('jwt_secret')) console.error(err.message);
			return null;
		}
	}
};

export default jwtUtils;
