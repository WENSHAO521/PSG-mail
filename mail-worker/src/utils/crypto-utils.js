const encoder = new TextEncoder();

// Password hashing.
//
// Current format (v2):  pbkdf2_sha256$<iterations>$<saltB64>$<hashB64>
//   - stored entirely in user.password; user.salt keeps the same salt so the
//     NOT NULL column stays populated and older code paths that only copy
//     the pair around keep working.
// Legacy format (v1):   base64(SHA-256(salt + password)), no prefix, salt in
//   user.salt. Still verified so existing accounts can log in, then upgraded
//   to v2 on the next successful login (needsRehash) — never reset.
//
// PBKDF2 rather than Argon2id: workerd's WebCrypto has PBKDF2 natively but no
// Argon2, and a WASM Argon2 would add a large unaudited dependency plus CPU
// time on every login. 100,000 iterations is workerd's hard cap for PBKDF2
// (deriveBits rejects anything higher), so this is the strongest native
// setting available. The iteration count is stored per hash, so it can be
// raised later without another format change.
export const PBKDF2_PREFIX = 'pbkdf2_sha256';
export const PBKDF2_ITERATIONS = 100000;
export const PBKDF2_MIN_ITERATIONS = 10000;
const PBKDF2_HASH_BYTES = 32;

// Workers Free plan has a ~10ms CPU budget per request; 100k PBKDF2 rounds
// can exceed it there. PASSWORD_PBKDF2_ITERATIONS lets such deployments pick
// a lower (but still >= 10k) cost. Paid plans should keep the default.
export function passwordIterations(c) {
	const n = Number(c?.env?.PASSWORD_PBKDF2_ITERATIONS);
	if (!Number.isInteger(n)) return PBKDF2_ITERATIONS;
	return Math.min(PBKDF2_ITERATIONS, Math.max(PBKDF2_MIN_ITERATIONS, n));
}

function bytesToB64(bytes) {
	let s = '';
	for (const b of bytes) s += String.fromCharCode(b);
	return btoa(s);
}

function b64ToBytes(b64) {
	return Uint8Array.from(atob(b64), ch => ch.charCodeAt(0));
}

function constantTimeEqual(a, b) {
	if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}

async function pbkdf2(password, saltB64, iterations) {
	const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
	const bits = await crypto.subtle.deriveBits(
		{ name: 'PBKDF2', hash: 'SHA-256', salt: b64ToBytes(saltB64), iterations },
		key,
		PBKDF2_HASH_BYTES * 8
	);
	return bytesToB64(new Uint8Array(bits));
}

function parsePbkdf2(stored) {
	if (typeof stored !== 'string' || !stored.startsWith(PBKDF2_PREFIX + '$')) return null;
	const parts = stored.split('$');
	if (parts.length !== 4) return null;
	const iterations = Number(parts[1]);
	if (!Number.isInteger(iterations) || iterations < 1 || iterations > PBKDF2_ITERATIONS) return null;
	return { iterations, salt: parts[2], hash: parts[3] };
}

const saltHashUtils = {

	generateSalt(length = 16) {
		const array = new Uint8Array(length);
		crypto.getRandomValues(array);
		return bytesToB64(array);
	},

	// Returns { salt, hash } where hash is the full self-describing v2 string.
	async hashPassword(password, iterations = PBKDF2_ITERATIONS) {
		const salt = this.generateSalt();
		const derived = await pbkdf2(String(password), salt, iterations);
		return { salt, hash: `${PBKDF2_PREFIX}$${iterations}$${salt}$${derived}` };
	},

	// Legacy v1 hash. Kept only for verifying not-yet-migrated rows.
	async genHashPassword(password, salt) {
		const data = encoder.encode(salt + password);
		const hashBuffer = await crypto.subtle.digest('SHA-256', data);
		return bytesToB64(new Uint8Array(hashBuffer));
	},

	isLegacyHash(storedHash) {
		return !parsePbkdf2(storedHash);
	},

	needsRehash(storedHash, targetIterations = PBKDF2_ITERATIONS) {
		const parsed = parsePbkdf2(storedHash);
		return !parsed || parsed.iterations < targetIterations;
	},

	async verifyPassword(inputPassword, salt, storedHash) {
		if (typeof inputPassword !== 'string' || !inputPassword || !storedHash) return false;
		const parsed = parsePbkdf2(storedHash);
		if (parsed) {
			const derived = await pbkdf2(inputPassword, parsed.salt, parsed.iterations);
			return constantTimeEqual(derived, parsed.hash);
		}
		if (!salt) return false;
		const hash = await this.genHashPassword(inputPassword, salt);
		return constantTimeEqual(hash, storedHash);
	},

	// Cryptographically random password (initial passwords for OAuth/bulk
	// imported users). Rejection sampling avoids modulo bias.
	genRandomPwd(length = 16) {
		const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
		const limit = 256 - (256 % chars.length);
		let result = '';
		const buf = new Uint8Array(1);
		while (result.length < length) {
			crypto.getRandomValues(buf);
			if (buf[0] < limit) result += chars[buf[0] % chars.length];
		}
		return result;
	}
};

export default saltHashUtils;
