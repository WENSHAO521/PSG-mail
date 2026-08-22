// Correctness check for web-push-vapid-service.js's RFC 8292 ES256 JWT: signs
// a header against a real generated P-256 keypair (JWK private half, the
// exact format generate-vapid-keys.mjs produces and the Worker imports), then
// verifies the signature independently against the raw public key — proving
// the JWS is valid, not just that signing didn't throw.
import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import webPushVapidService from '../src/service/web-push-vapid-service';

function base64UrlToBytes(b64url) {
	const padded = b64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(b64url.length / 4) * 4, '=');
	const binary = atob(padded);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

describe('web-push-vapid-service (RFC 8292)', () => {
	it('produces a JWT whose signature verifies against the public key', async () => {
		const keyPair = await crypto.subtle.generateKey(
			{ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']
		);
		const privateKeyJwk = JSON.stringify(await crypto.subtle.exportKey('jwk', keyPair.privateKey));
		const publicKeyRaw = new Uint8Array(await crypto.subtle.exportKey('raw', keyPair.publicKey));
		const publicKeyB64Url = btoa(String.fromCharCode(...publicKeyRaw))
			.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

		const fakeEnv = {
			...env,
			VAPID_PRIVATE_KEY_JWK: privateKeyJwk,
			VAPID_PUBLIC_KEY: publicKeyB64Url,
			VAPID_SUBJECT: 'mailto:test@example.com'
		};

		const header = await webPushVapidService.buildAuthorizationHeader(fakeEnv, 'https://fcm.googleapis.com/wp/some-id');

		expect(header).toMatch(/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]+$/);

		const jwt = header.match(/^vapid t=([\w-]+\.[\w-]+\.[\w-]+),/)[1];
		const [headerB64, claimsB64, sigB64] = jwt.split('.');

		const claims = JSON.parse(new TextDecoder().decode(base64UrlToBytes(claimsB64)));
		expect(claims.aud).toBe('https://fcm.googleapis.com');
		expect(claims.sub).toBe('mailto:test@example.com');
		expect(typeof claims.exp).toBe('number');

		const verifyKey = await crypto.subtle.importKey(
			'raw', publicKeyRaw, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']
		);
		const valid = await crypto.subtle.verify(
			{ name: 'ECDSA', hash: { name: 'SHA-256' } },
			verifyKey,
			base64UrlToBytes(sigB64),
			new TextEncoder().encode(`${headerB64}.${claimsB64}`)
		);
		expect(valid).toBe(true);
	});

	it('throws a clear error when VAPID keys are not configured', async () => {
		// The developer may have a real .dev.vars file for local push testing.
		// Make this negative case independent of that local configuration.
		const unconfiguredEnv = { ...env };
		delete unconfiguredEnv.VAPID_PRIVATE_KEY_JWK;
		delete unconfiguredEnv.VAPID_PUBLIC_KEY;
		delete unconfiguredEnv.VAPID_SUBJECT;
		await expect(webPushVapidService.buildAuthorizationHeader(unconfiguredEnv, 'https://fcm.googleapis.com/wp/x'))
			.rejects.toThrow(/VAPID keys are not configured/);
	});
});
