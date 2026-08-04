import app from '../hono/hono';
import result from '../model/result';
import BizError from '../error/biz-error';
import userService from '../service/user-service';

// Recovery endpoint for when the admin account is locked out — the URL secret
// itself is the credential (same pattern as /init/:secret), so this must stay
// in security.js's `exclude` list rather than requiring a normal JWT.
app.post('/reset-admin/:secret', async (c) => {
	const secret = c.req.param('secret');

	if (secret !== c.env.jwt_secret) {
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
