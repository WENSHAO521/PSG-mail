import { Hono } from 'hono';
const app = new Hono();

import result from '../model/result';
import { cors } from 'hono/cors';
import { trace } from '../app/middleware/trace';
import { createLogger, serializeError } from '../shared/logger';

const log = createLogger('http');

app.use('*', cors());
app.use('*', trace);

// Error bodies carry the trace id so a user's screenshot can be matched to logs.
const fail = (c, body) => c.json({ ...body, traceId: c.get('traceId') });

app.onError((err, c) => {
	const traceId = c.get('traceId');
	if (err.name === 'BizError') {
		log.info('biz_error', { traceId, message: err.message, code: err.code });
	} else {
		log.error('unhandled_error', { traceId, ...serializeError(err) });
	}

	if (err.message === `Cannot read properties of undefined (reading 'get')`) {
		return fail(c, result.fail('KV数据库未绑定 KV database not bound',502));
	}

	if (err.message === `Cannot read properties of undefined (reading 'put')`) {
		return fail(c, result.fail('KV数据库未绑定 KV database not bound',502));
	}

	if (err.message === `Cannot read properties of undefined (reading 'prepare')`) {
		return fail(c, result.fail('D1数据库未绑定 D1 database not bound',502));
	}

	if (err.message?.includes('D1_ERROR: no such column')) {
		return fail(c, result.fail('数据库未更新，请联系管理员运行迁移（POST /init） Database schema is out of date, ask an admin to run pending migrations (POST /init)',502));
	}

	return fail(c, result.fail(err.message, err.code));
});

export default app;


