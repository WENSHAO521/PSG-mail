import { timingSafeEqual } from './secure-compare';
const encoder = new TextEncoder();

const PBKDF2_PREFIX = 'pbkdf2-sha256';
const PBKDF2_ITERATIONS = 100000;

function parseHash(storedHash) {
	if (typeof storedHash !== 'string') return null;
	const parts = storedHash.split('$');
	if (parts.length !== 3 || parts[0] !== PBKDF2_PREFIX) return null;
	const iterations = Number(parts[1]);
	if (!Number.isInteger(iterations) || iterations < 1 || iterations > PBKDF2_ITERATIONS) return null;
	return { iterations };
}

const saltHashUtils = {

	generateSalt(length = 16) {
		const array = new Uint8Array(length);
		crypto.getRandomValues(array);
		return btoa(String.fromCharCode(...array));
	},


	// New hashes are PBKDF2-HMAC-SHA256 stored as `pbkdf2-sha256$<iterations>$<b64>`.
	// Rows without that prefix are legacy single-round SHA-256 hashes; they still
	// verify, and login-service re-hashes them on the next successful login.
	// 100000 is the highest iteration count the Workers runtime accepts.
	async hashPassword(password) {
		const salt = this.generateSalt();
		const hash = await this.pbkdf2Hash(password, salt, PBKDF2_ITERATIONS);
		return { salt, hash };
	},

	async pbkdf2Hash(password, salt, iterations) {
		const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
		const bits = await crypto.subtle.deriveBits(
			{ name: 'PBKDF2', hash: 'SHA-256', salt: encoder.encode(salt), iterations },
			keyMaterial,
			256
		);
		return `${PBKDF2_PREFIX}$${iterations}$${btoa(String.fromCharCode(...new Uint8Array(bits)))}`;
	},

	needsRehash(storedHash) {
		const parsed = parseHash(storedHash);
		return !parsed || parsed.iterations < PBKDF2_ITERATIONS;
	},

	async genHashPassword(password, salt) {
		const data = encoder.encode(salt + password);
		const hashBuffer = await crypto.subtle.digest('SHA-256', data);
		const hashArray = Array.from(new Uint8Array(hashBuffer));
		return btoa(String.fromCharCode(...hashArray));
	},

	async verifyPassword(inputPassword, salt, storedHash) {
		const parsed = parseHash(storedHash);
		const hash = parsed
			? await this.pbkdf2Hash(inputPassword, salt, parsed.iterations)
			: await this.genHashPassword(inputPassword, salt);
		return timingSafeEqual(hash, storedHash);
	},

	genRandomPwd(length = 8) {
		const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
		// Rejection sampling keeps the characters uniform (256 % 62 != 0).
		const limit = 256 - (256 % chars.length);
		let result = '';
		while (result.length < length) {
			for (const byte of crypto.getRandomValues(new Uint8Array(length))) {
				if (byte < limit && result.length < length) result += chars[byte % chars.length];
			}
		}
		return result;
	}
};

export default saltHashUtils;
