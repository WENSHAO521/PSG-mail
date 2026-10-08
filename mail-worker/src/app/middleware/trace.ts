import type { MiddlewareHandler } from 'hono';
import { createLogger } from '../../shared/logger';
import { TRACE_HEADER, resolveTraceId } from '../../shared/trace';

const log = createLogger('http');

// Assigns a trace id to every request, echoes it in the X-Trace-Id response
// header, and logs one completion line. Only the path is logged, never the
// query string — it can carry tokens (e.g. OAuth callbacks).
export const trace: MiddlewareHandler = async (c, next) => {
	const traceId = resolveTraceId(c.req.header(TRACE_HEADER));
	c.set('traceId', traceId);
	// Set before next() so error responses built by app.onError carry it too.
	c.header(TRACE_HEADER, traceId);

	const start = Date.now();
	await next();

	const user = c.get('user') as { userId?: number } | undefined;
	log.info('request', {
		traceId,
		method: c.req.method,
		path: new URL(c.req.url).pathname,
		status: c.res.status,
		durationMs: Date.now() - start,
		userId: user?.userId,
	});
};
