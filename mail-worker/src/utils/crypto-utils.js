import { timingSafeEqual } from './secure-compare';
const encoder = new TextEncoder();

const saltHashUtils = {

	generateSalt(length = 16) {
		const array = new Uint8Array(length);
		crypto.getRandomValues(array);
		return btoa(String.fromCharCode(...array));
	},


	async hashPassword(password) {
		const salt = this.generateSalt();
		const hash = await this.genHashPassword(password, salt);
		return { salt, hash };
	},

	async genHashPassword(password, salt) {
		const data = encoder.encode(salt + password);
		const hashBuffer = await crypto.subtle.digest('SHA-256', data);
		const hashArray = Array.from(new Uint8Array(hashBuffer));
		return btoa(String.fromCharCode(...hashArray));
	},

	async verifyPassword(inputPassword, salt, storedHash) {
		const hash = await this.genHashPassword(inputPassword, salt);
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
