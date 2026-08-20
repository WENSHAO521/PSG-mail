import app from '../hono/hono';
import result from '../model/result';
import BizError from '../error/biz-error';
import userService from '../service/user-service';
import timingSafeEqual from '../utils/secure-compare';

// Recovery endpoint for when the admin account is locked out — the secret
// itself is the credential (same pattern as /init), so this must stay in
// security.js's `exclude` list rather than requiring a normal JWT. Read from
// a header, not a URL path segment (/reset-admin/:secret used to) — a
// secret in the URL can land in request/proxy/observability logs even over
// HTTPS, a header does not.
app.post('/reset-admin', async (c) => {
	const auth = c.req.header('Authorization') || '';
	const secret = auth.startsWith('Bearer ') ? auth.slice(7) : '';

	if (!secret || !timingSafeEqual(secret, c.env.jwt_secret)) {
		throw new BizError('secret mismatch', 401);
	}

	const { password } = await c.req.json();

	if (!password || password.length < 6) {
		throw new BizError('password must be at least 6 characters', 400);
	}

	const adminRow = await userService.selectByEmail(c, c.env.admin);

	if (!adminRow) {
		throw new BizError('admin user not found', 404);
	}

	await userService.setPwd(c, { password, userId: adminRow.userId });

	return c.json(result.ok());
});
