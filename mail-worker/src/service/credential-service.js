import { bump } from './ops-metrics';

// Application-layer encryption for credentials stored in D1 / KV (provider API keys, bot tokens,
// OAuth tokens of cloud backups, per-user translation keys).
//
// Opt-in: it is active only when the Worker secret `credential_master_key` (>= 32 chars) exists.
// Without it nothing changes — values stay plaintext, exactly as before — so deploying this code
// cannot break an installation. With it:
//   write  -> AES-256-GCM, value stored as  enc:v1:<iv>:<ciphertext>   (base64url)
//   read   -> transparently decrypted; legacy plaintext values keep working until migrated
// Each field gets its own key (HKDF-SHA256 over the master key with the field context as `info`)
// and the context is also authenticated data, so a ciphertext copied into another field or table
// does not decrypt.
//
// Rotation: set the new key as `credential_master_key`, keep the old one as
// `credential_master_key_previous` (decrypt-only), run the admin "migrate" action to re-encrypt
// everything, then delete the previous key.
const PREFIX = 'enc:v1:';
const MIN_KEY_LENGTH = 32;
const enc = new TextEncoder();
const dec = new TextDecoder();

const keyCache = new Map(); // `${slot}|${context}` -> { master, key }
let warnedBadKey = false;

function b64url(bytes) {
	return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function unb64url(str) {
	str = str.replace(/-/g, '+').replace(/_/g, '/');
	while (str.length % 4) str += '=';
	return Uint8Array.from(atob(str), ch => ch.charCodeAt(0));
}

function masterKey(env, slot) {
	const value = slot === 'previous' ? env.credential_master_key_previous : env.credential_master_key;
	if (typeof value !== 'string' || !value) return null;
	if (value.length < MIN_KEY_LENGTH) {
		if (!warnedBadKey) {
			warnedBadKey = true;
			console.error(`credential master key ignored: it must be at least ${MIN_KEY_LENGTH} characters`);
		}
		return null;
	}
	return value;
}

async function deriveKey(master, slot, context) {
	const id = `${slot}|${context}`;
	const hit = keyCache.get(id);
	if (hit && hit.master === master) return hit.key;
	const base = await crypto.subtle.importKey('raw', enc.encode(master), 'HKDF', false, ['deriveKey']);
	const key = await crypto.subtle.deriveKey(
		{ name: 'HKDF', hash: 'SHA-256', salt: enc.encode('psg-mail/credentials/v1'), info: enc.encode(context) },
		base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
	);
	keyCache.set(id, { master, key });
	return key;
}

const credentialService = {

	isEncrypted(value) {
		return typeof value === 'string' && value.startsWith(PREFIX);
	},

	enabled(env) {
		return !!masterKey(env, 'current');
	},

	// Plaintext in, stored form out. Empty values, already-encrypted values and "no key configured"
	// pass through unchanged.
	async encrypt(env, value, context) {
		if (typeof value !== 'string' || !value || this.isEncrypted(value)) return value;
		const master = masterKey(env, 'current');
		if (!master) return value;
		const key = await deriveKey(master, 'current', context);
		const iv = crypto.getRandomValues(new Uint8Array(12));
		const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(context) }, key, enc.encode(value));
		return `${PREFIX}${b64url(iv)}:${b64url(ct)}`;
	},

	// Stored form in, plaintext out. Plaintext (legacy) values are returned as they are. A value that
	// cannot be decrypted (missing/wrong key, tampering) yields '' — never the ciphertext — and is counted.
	async decrypt(env, value, context) {
		if (!this.isEncrypted(value)) return value;
		const [ivPart, ctPart] = value.slice(PREFIX.length).split(':');
		if (!ivPart || !ctPart) return '';
		for (const slot of ['current', 'previous']) {
			const master = masterKey(env, slot);
			if (!master) continue;
			try {
				const key = await deriveKey(master, slot, context);
				const plain = await crypto.subtle.decrypt(
					{ name: 'AES-GCM', iv: unb64url(ivPart), additionalData: enc.encode(context) }, key, unb64url(ctPart));
				return dec.decode(plain);
			} catch {}
		}
		bump('credentials.undecryptable');
		console.error('credential could not be decrypted for', context, '(missing or wrong credential_master_key?)');
		return '';
	},

	// True if the stored value is not in the current encrypted form (plaintext, or under the previous key).
	async needsMigration(env, value, context) {
		if (typeof value !== 'string' || !value) return false;
		if (!this.isEncrypted(value)) return true;
		const [ivPart, ctPart] = value.slice(PREFIX.length).split(':');
		const master = masterKey(env, 'current');
		if (!master || !ivPart || !ctPart) return false;
		try {
			const key = await deriveKey(master, 'current', context);
			await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64url(ivPart), additionalData: enc.encode(context) }, key, unb64url(ctPart));
			return false;
		} catch {
			return true;
		}
	},
};

export default credentialService;
