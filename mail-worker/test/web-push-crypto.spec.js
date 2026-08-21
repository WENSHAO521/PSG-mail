// Round-trip correctness check for web-push-crypto-service.js's RFC 8291 +
// RFC 8188 (aes128gcm) implementation: no live push service is needed — this
// generates a fake "subscriber" ECDH keypair + auth secret exactly like a
// real browser's PushSubscription would produce, runs encryptPayload()
// (the real production code path), then decrypts the result back using the
// same HKDF/AES-GCM steps run in reverse with the subscriber's private key,
// and asserts the round-tripped JSON matches. This exercises the exact
// crypto.subtle calls Workers runs in production (vitest-pool-workers runs
// real Workers runtime, not a Node polyfill).
import { describe, it, expect } from 'vitest';
import webPushCryptoService from '../src/service/web-push-crypto-service';

function concatBytes(...parts) {
	const total = parts.reduce((n, p) => n + p.length, 0);
	const out = new Uint8Array(total);
	let offset = 0;
	for (const p of parts) {
		out.set(p, offset);
		offset += p.length;
	}
	return out;
}

async function decryptPayload(subscriberPrivateKey, uaPublicBytes, authSecretBytes, wireBody) {
	// Parse the RFC 8188 header: salt(16) || recordSize(4, BE) || keyIdLen(1) || keyId(as_public).
	const salt = wireBody.slice(0, 16);
	const keyIdLen = wireBody[20];
	const asPublicBytes = wireBody.slice(21, 21 + keyIdLen);
	const ciphertext = wireBody.slice(21 + keyIdLen);

	const asPublicKey = await crypto.subtle.importKey(
		'raw', asPublicBytes, { name: 'ECDH', namedCurve: 'P-256' }, false, []
	);
	const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits(
		{ name: 'ECDH', public: asPublicKey }, subscriberPrivateKey, 256
	));

	const keyInfo = concatBytes(
		new TextEncoder().encode('WebPush: info'),
		new Uint8Array([0x00]),
		uaPublicBytes,
		asPublicBytes
	);
	const ecdhSecretKey = await crypto.subtle.importKey('raw', ecdhSecret, 'HKDF', false, ['deriveBits']);
	const ikm = new Uint8Array(await crypto.subtle.deriveBits(
		{ name: 'HKDF', hash: 'SHA-256', salt: authSecretBytes, info: keyInfo }, ecdhSecretKey, 256
	));

	const ikmKey = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
	const cekInfo = concatBytes(new TextEncoder().encode('Content-Encoding: aes128gcm'), new Uint8Array([0x00]));
	const nonceInfo = concatBytes(new TextEncoder().encode('Content-Encoding: nonce'), new Uint8Array([0x00]));
	const cek = new Uint8Array(await crypto.subtle.deriveBits(
		{ name: 'HKDF', hash: 'SHA-256', salt, info: cekInfo }, ikmKey, 128
	));
	const nonce = new Uint8Array(await crypto.subtle.deriveBits(
		{ name: 'HKDF', hash: 'SHA-256', salt, info: nonceInfo }, ikmKey, 96
	));

	const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
	const recordPlaintext = new Uint8Array(await crypto.subtle.decrypt(
		{ name: 'AES-GCM', iv: nonce, tagLength: 128 }, aesKey, ciphertext
	));

	// Strip the trailing 0x02 "last record" delimiter.
	return recordPlaintext.slice(0, -1);
}

describe('web-push-crypto-service (RFC 8291 / RFC 8188 aes128gcm)', () => {
	it('round-trips a JSON payload through encrypt -> decrypt', async () => {
		const subscriberKeyPair = await crypto.subtle.generateKey(
			{ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']
		);
		const uaPublicBytes = new Uint8Array(await crypto.subtle.exportKey('raw', subscriberKeyPair.publicKey));
		const authSecretBytes = crypto.getRandomValues(new Uint8Array(16));

		const payload = { title: 'New mail', body: 'From: test@example.com', data: { emailId: 42 } };
		const plaintextBytes = new TextEncoder().encode(JSON.stringify(payload));

		const wireBody = await webPushCryptoService.encryptPayload(uaPublicBytes, authSecretBytes, plaintextBytes);

		expect(wireBody.length).toBeGreaterThan(21 + 65); // header alone is 86 bytes for a 65-byte keyid

		const decryptedBytes = await decryptPayload(subscriberKeyPair.privateKey, uaPublicBytes, authSecretBytes, wireBody);
		const decrypted = JSON.parse(new TextDecoder().decode(decryptedBytes));

		expect(decrypted).toEqual(payload);
	});

	it('rejects a malformed p256dh (wrong length)', async () => {
		const authSecretBytes = crypto.getRandomValues(new Uint8Array(16));
		const badPublic = new Uint8Array(64); // one byte short
		await expect(webPushCryptoService.encryptPayload(badPublic, authSecretBytes, new Uint8Array([1])))
			.rejects.toThrow(/65-byte/);
	});

	it('rejects a malformed auth secret (wrong length)', async () => {
		const subscriberKeyPair = await crypto.subtle.generateKey(
			{ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']
		);
		const uaPublicBytes = new Uint8Array(await crypto.subtle.exportKey('raw', subscriberKeyPair.publicKey));
		const badAuth = new Uint8Array(8);
		await expect(webPushCryptoService.encryptPayload(uaPublicBytes, badAuth, new Uint8Array([1])))
			.rejects.toThrow(/16 bytes/);
	});
});
