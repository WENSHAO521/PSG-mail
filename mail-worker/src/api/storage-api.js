import app from '../hono/hono';
import result from '../model/result';
import storageConsistencyService from '../service/storage-consistency-service';

// Read-only storage consistency report (admin; permission setting:query,
// enforced in security/security.js). Never deletes anything.
app.get('/admin/storage/audit', async (c) => {
	const { limit, cursor } = c.req.query();
	const report = await storageConsistencyService.audit(c, { limit, cursor });
	return c.json(result.ok(report));
});
