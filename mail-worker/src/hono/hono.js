import { Hono } from 'hono';
const app = new Hono();

import result from '../model/result';
import { cors } from 'hono/cors';

// CORS. Auth is a bearer token in the Authorization header — never a cookie —
// so a permissive origin policy cannot be used for CSRF. Deployments that
// want to pin origins anyway (recommended) set CORS_ORIGINS to a
// comma-separated list, e.g.
//   CORS_ORIGINS = "https://mail.example.com,capacitor://localhost,http://localhost,app://."
// Unset keeps the 3.x behavior ("*") so existing desktop/Android builds keep
// working.
function corsOrigins(env) {
	const raw = env?.CORS_ORIGINS;
	if (!raw) return null;
	return String(raw).split(',').map(s => s.trim()).filter(Boolean);
}

app.use('*', async (c, next) => {
	const allowed = corsOrigins(c.env);
	const mw = cors({
		origin: allowed ? (origin) => (allowed.includes(origin) ? origin : null) : '*',
		allowHeaders: ['Authorization', 'Content-Type', 'Accept-Language', 'X-Api-Key', 'X-Lang'],
		allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
		maxAge: 600,
	});
	return mw(c, next);
});

// Baseline security headers on every API response. (Object responses from
// /oss get a stricter CSP in security/attachment-access.js.)
app.use('*', async (c, next) => {
	await next();
	const h = c.res.headers;
	if (!h.has('X-Content-Type-Options')) h.set('X-Content-Type-Options', 'nosniff');
	if (!h.has('Referrer-Policy')) h.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	if (!h.has('X-Frame-Options')) h.set('X-Frame-Options', 'DENY');
	if (!h.has('Content-Security-Policy') && (h.get('Content-Type') || '').includes('application/json')) {
		h.set('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
	}
});

app.onError((err, c) => {
	if (err.name === 'BizError') {
		console.log(err.message);
	} else {
		console.error(err);
	}

	if (err.message === `Cannot read properties of undefined (reading 'get')`) {
		return c.json(result.fail('KV数据库未绑定 KV database not bound',502));
	}

	if (err.message === `Cannot read properties of undefined (reading 'put')`) {
		return c.json(result.fail('KV数据库未绑定 KV database not bound',502));
	}

	if (err.message === `Cannot read properties of undefined (reading 'prepare')`) {
		return c.json(result.fail('D1数据库未绑定 D1 database not bound',502));
	}

	if (err.message?.includes('D1_ERROR: no such column') || err.message?.includes('D1_ERROR: no such table')) {
		return c.json(result.fail('数据库未更新，请联系管理员运行迁移（POST /init） Database schema is out of date, ask an admin to run pending migrations (POST /init)',502));
	}

	// Only BizError messages are written for end users. Anything else (D1
	// errors with SQL fragments, provider SDK errors carrying request ids or
	// credential hints, stack-ish TypeErrors) stays in the Worker log.
	if (err.name === 'BizError') {
		return c.json(result.fail(err.message, err.code));
	}
	const ref = crypto.randomUUID().slice(0, 8);
	console.error('unhandled error ref', ref);
	return c.json(result.fail(`服务器内部错误 Internal server error (ref ${ref})`, 500));
});

export default app;
