// RFC 8291 (Message Encryption for Web Push) + RFC 8188 (aes128gcm content
// coding) — implemented with only Workers-native crypto.subtle, no npm
// `web-push` dependency (that library assumes Node's `crypto`/Buffer, which
// this runtime doesn't have). Byte lengths/HKDF info strings below are
// exactly what those two RFCs specify; get any of them wrong and the target
// browser silently fails to decrypt (no useful error surfaces back to us).

const RECORD_SIZE = 4096; // matches the `web-push` reference lib's default and every push service's ~4KB body ceiling

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

// Ephemeral ECDH keypair per message (never reused), shared secret against
// the subscriber's own P-256 public key (ua_public, raw uncompressed point).
async function deriveIkm(uaPublicBytes, authSecretBytes) {
	const asKeyPair = await crypto.subtle.generateKey(
		{ name: 'ECDH', namedCurve: 'P-256' },
		true, // extractable — the raw public half becomes the wire-format keyid
		['deriveBits']
	);
	const asPublicBytes = new Uint8Array(await crypto.subtle.exportKey('raw', asKeyPair.publicKey));

	const uaPublicKey = await crypto.subtle.importKey(
		'raw', uaPublicBytes,
		{ name: 'ECDH', namedCurve: 'P-256' },
		false, []
	);

	const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits(
		{ name: 'ECDH', public: uaPublicKey },
		asKeyPair.privateKey,
		256
	));

	// RFC 8291 §3.3/3.4 — HKDF #1: ECDH secret + auth_secret (as salt) -> 32-byte IKM.
	// info = "WebPush: info" || 0x00 || ua_public || as_public (13 + 1 + 65 + 65 = 144 bytes,
	// subscriber's key first, our ephemeral key second — order matters, it's part of the spec).
	const keyInfo = concatBytes(
		new TextEncoder().encode('WebPush: info'),
		new Uint8Array([0x00]),
		uaPublicBytes,
		asPublicBytes
	);
	const ecdhSecretKey = await crypto.subtle.importKey('raw', ecdhSecret, 'HKDF', false, ['deriveBits']);
	const ikm = new Uint8Array(await crypto.subtle.deriveBits(
		{ name: 'HKDF', hash: 'SHA-256', salt: authSecretBytes, info: keyInfo },
		ecdhSecretKey,
		256
	));

	return { ikm, asPublicBytes };
}

// Encrypts `plaintextBytes` for a subscriber identified by their P-256 public
// key (65 raw bytes, 0x04 || X(32) || Y(32)) and 16-byte auth secret. Returns
// the full aes128gcm wire body: RFC 8188 header (salt || recordSize || keyIdLen
// || keyId) followed by the single AES-128-GCM ciphertext record.
async function encryptPayload(uaPublicBytes, authSecretBytes, plaintextBytes) {
	if (uaPublicBytes.length !== 65 || uaPublicBytes[0] !== 0x04) {
		throw new Error('invalid p256dh: expected a 65-byte uncompressed P-256 point');
	}
	if (authSecretBytes.length !== 16) {
		throw new Error('invalid auth secret: expected 16 bytes');
	}
	if (plaintextBytes.length > RECORD_SIZE - 17) {
		throw new Error(`web push payload too large: ${plaintextBytes.length} bytes (max ${RECORD_SIZE - 17})`);
	}

	const { ikm, asPublicBytes } = await deriveIkm(uaPublicBytes, authSecretBytes);

	// RFC 8188 §2.1 — HKDF #2: per-message random 16-byte salt -> 16-byte CEK + 12-byte nonce.
	const salt = crypto.getRandomValues(new Uint8Array(16));
	const ikmKey = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
	const cekInfo = concatBytes(new TextEncoder().encode('Content-Encoding: aes128gcm'), new Uint8Array([0x00]));
	const nonceInfo = concatBytes(new TextEncoder().encode('Content-Encoding: nonce'), new Uint8Array([0x00]));
	const cek = new Uint8Array(await crypto.subtle.deriveBits(
		{ name: 'HKDF', hash: 'SHA-256', salt, info: cekInfo }, ikmKey, 128
	));
	const nonce = new Uint8Array(await crypto.subtle.deriveBits(
		{ name: 'HKDF', hash: 'SHA-256', salt, info: nonceInfo }, ikmKey, 96
	));

	// Single record (sequence 0) -> nonce used unmodified; 0x02 = "last record" delimiter.
	const recordPlaintext = concatBytes(plaintextBytes, new Uint8Array([0x02]));
	const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
	const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
		{ name: 'AES-GCM', iv: nonce, tagLength: 128 },
		aesKey,
		recordPlaintext
	));

	// RFC 8188 §2.1 header: salt(16) || recordSize(4, big-endian) || keyIdLen(1) || keyId(asPublicBytes).
	const header = new Uint8Array(16 + 4 + 1 + asPublicBytes.length);
	header.set(salt, 0);
	new DataView(header.buffer).setUint32(16, RECORD_SIZE, false);
	header[20] = asPublicBytes.length;
	header.set(asPublicBytes, 21);

	return concatBytes(header, ciphertext);
}

const webPushCryptoService = {
	encryptPayload
};

export default webPushCryptoService;
