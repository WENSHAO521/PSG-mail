import app from '../hono/hono';
import result from '../model/result';
import { APP_VERSION } from '../shared/version';
import { readSchemaReport } from '../db/schema-version';
import { createLogger } from '../shared/logger';

const log = createLogger('schema');
let warned = false;

// Unauthenticated (see `exclude` in security.js): lets deploy smoke tests and
// admins see whether migrations were applied. Exposes only version numbers.
app.get('/health', async (c) => {
	const schema = await readSchemaReport(c.env.db);
	if (schema.status === 'behind' && !warned) {
		// Once per isolate; a 503 would also break deployments that never ran
		// wrangler migrations but work fine with the legacy POST /init.
		warned = true;
		log.warn('schema_behind', { traceId: c.get('traceId'), applied: schema.applied, expected: schema.expected });
	}
	return c.json(result.ok({ version: APP_VERSION, schema }));
});
