// Application-layer encryption for credentials that must live in D1/KV
// because they are created at runtime (admin-entered provider keys, per-user
// cloud-backup OAuth tokens). Static service credentials belong in Worker
// Secrets instead and never pass through here.
//
// Format:  enc:v1:<kid>:<iv b64url>:<ciphertext+tag b64url>   (AES-256-GCM)
// AAD:     a caller-supplied context label (e.g. "setting:s3SecretKey",
//          "cloud_backup:refreshToken") so a ciphertext can't be moved into
//          another field and decrypted there.
//
// Keys (Worker Secrets):
//   DATA_ENCRYPTION_KEYS   JSON object {"<kid>": "<base64 32-byte key>", ...}
//   DATA_ENCRYPTION_KEY_ID kid used for NEW writes (defaults to the last
//                          entry). Older kids stay listed for decryption, so
//                          rotation = add a key, switch the id, re-save.
//   DATA_ENCRYPTION_KEY    shorthand for a single key with kid "k1".
// With no key configured, encrypt() is a no-op (values stay plaintext, as in
// 3.x) and decrypt() passes plaintext through — so enabling encryption is a
// pure opt-in that never breaks reading existing rows.
//
// Generate a key:  node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

const PREFIX = 'enc:v1:';
const encoder = new TextEncoder();
const decoder = new TextDecoder();

const keyCache = new Map();

function b64urlEncode(bytes) {
	let s = '';
	for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
	return btoa(s).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function b64Decode(str) {
	let s = String(str).replace(/-/g, '+').replace(/_/g, '/');
	while (s.length % 4) s += '=';
	return Uint8Array.from(atob(s), ch => ch.charCodeAt(0));
}

function keyring(env) {
	let ring = {};
	if (env?.DATA_ENCRYPTION_KEYS) {
		try {
			ring = typeof env.DATA_ENCRYPTION_KEYS === 'string' ? JSON.parse(env.DATA_ENCRYPTION_KEYS) : { ...env.DATA_ENCRYPTION_KEYS };
		} catch {
			console.error('DATA_ENCRYPTION_KEYS is not valid JSON — encryption disabled');
			ring = {};
		}
	} else if (env?.DATA_ENCRYPTION_KEY) {
		ring = { k1: env.DATA_ENCRYPTION_KEY };
	}
	return ring;
}

function activeKid(env, ring) {
	const kids = Object.keys(ring);
	if (!kids.length) return null;
	const wanted = env?.DATA_ENCRYPTION_KEY_ID;
	return wanted && ring[wanted] ? wanted : kids[kids.length - 1];
}

async function importKey(kid, b64) {
	const cacheKey = kid + ':' + b64;
	if (keyCache.has(cacheKey)) return keyCache.get(cacheKey);
	const raw = b64Decode(b64);
	if (raw.length !== 32) throw new Error(`encryption key ${kid} must be 32 bytes`);
	const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
	keyCache.set(cacheKey, key);
	return key;
}

const secretBox = {

	isEncrypted(value) {
		return typeof value === 'string' && value.startsWith(PREFIX);
	},

	enabled(env) {
		return !!activeKid(env, keyring(env));
	},

	async encrypt(env, plaintext, aad = '') {
		if (plaintext == null || plaintext === '' || this.isEncrypted(plaintext)) return plaintext;
		const ring = keyring(env);
		const kid = activeKid(env, ring);
		if (!kid) return plaintext;
		const key = await importKey(kid, ring[kid]);
		const iv = crypto.getRandomValues(new Uint8Array(12));
		const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(aad) }, key, encoder.encode(String(plaintext)));
		return `${PREFIX}${kid}:${b64urlEncode(iv)}:${b64urlEncode(ct)}`;
	},

	// Returns plaintext. Unencrypted input is returned unchanged. A value that
	// can't be decrypted (unknown kid, wrong key, tampered) yields '' — never
	// the ciphertext — and logs, so a misconfiguration degrades to "provider
	// not configured" instead of sending garbage credentials anywhere.
	async decrypt(env, value, aad = '') {
		if (!this.isEncrypted(value)) return value;
		const [kid, ivB64, ctB64] = value.slice(PREFIX.length).split(':');
		const ring = keyring(env);
		if (!ring[kid]) {
			console.error(`secret-box: no key for kid "${kid}" (${aad})`);
			return '';
		}
		try {
			const key = await importKey(kid, ring[kid]);
			const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64Decode(ivB64), additionalData: encoder.encode(aad) }, key, b64Decode(ctB64));
			return decoder.decode(pt);
		} catch {
			console.error(`secret-box: decryption failed (${aad})`);
			return '';
		}
	}
};

export default secretBox;
