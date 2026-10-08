import app from '../hono/hono';
import result from '../model/result';
import userContext from '../security/user-context';
import retentionPolicyService from '../service/retention-policy-service';

// Admin-only (security.js: setting:query for reads, setting:set for writes).
app.get('/admin/retention/policy', async (c) => {
	return c.json(result.ok(await retentionPolicyService.get(c)));
});

app.get('/admin/retention/preview', async (c) => {
	return c.json(result.ok(await retentionPolicyService.preview(c)));
});

app.put('/admin/retention/policy', async (c) => {
	const policy = await retentionPolicyService.update(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok(policy));
});

app.post('/admin/retention/approve', async (c) => {
	return c.json(result.ok(await retentionPolicyService.approve(c, userContext.getUserId(c))));
});
