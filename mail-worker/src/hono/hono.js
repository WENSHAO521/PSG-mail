import { Hono } from 'hono';
const app = new Hono();

import result from '../model/result';
import { maybeFlush } from '../service/ops-metrics';
import { cors } from 'hono/cors';
// Authentication is a bearer header (no cookies), so a wildcard origin cannot ride a
// browser session. Deployments can still pin it: cors_origins = "https://mail.example.com,app://obsidian"
// (comma separated). Unset keeps the previous wildcard so native/Electron/Capacitor clients keep working.
app.use('*', async (c, next) => {
	const configured = String(c.env?.cors_origins || '').split(',').map(o => o.trim()).filter(Boolean);
	if (configured.length === 0) return cors()(c, next);
	return cors({ origin: origin => (configured.includes(origin) ? origin : null) })(c, next);
});

// Baseline hardening for every API response. Cache-Control is only defaulted (stored objects
// under /oss set their own); authenticated JSON must never be stored by a shared cache.
app.use('*', async (c, next) => {
	await next();
	const h = c.res.headers;
	if (!h.has('X-Content-Type-Options')) h.set('X-Content-Type-Options', 'nosniff');
	if (!h.has('Referrer-Policy')) h.set('Referrer-Policy', 'no-referrer');
	if (!h.has('Cache-Control') && !c.req.path.startsWith('/oss/')) h.set('Cache-Control', 'no-store');
	maybeFlush(c); // at most one small D1 batch per minute per isolate, after the response
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

	if (err.message?.includes('D1_ERROR: no such column')) {
		return c.json(result.fail('数据库未更新，请联系管理员运行迁移（POST /init） Database schema is out of date, ask an admin to run pending migrations (POST /init)',502));
	}

	if (err.name === 'BizError') {
		return c.json(result.fail(err.message, err.code));
	}

	if (err instanceof SyntaxError) {
		return c.json(result.fail('Invalid request body', 400));
	}

	// Anything else is an unexpected internal error (SQL text, provider responses, stack
	// fragments): details stay in the server log, the client gets a generic message.
	return c.json(result.fail('Internal server error', 500));
});

export default app;


