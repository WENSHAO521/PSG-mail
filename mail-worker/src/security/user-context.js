import JwtUtils from '../utils/jwt-utils';
import constant from '../const/constant';

const userContext = {
	getUserId(c) {
		return c.get('user').userId;
	},

	getUser(c) {
		return c.get('user');
	},

	// Session id of the current request. security.js stores it after
	// verifying the JWT; the fallback re-verifies for routes outside the
	// authenticated chain (e.g. websiteConfig).
	async getToken(c) {
		const cached = c.get?.('sessionId');
		if (cached) return cached;
		const jwt = c.req.header(constant.TOKEN_HEADER);
		const result = await JwtUtils.verifyToken(c,jwt);
		return result?.token;
	},
};
export default userContext;
