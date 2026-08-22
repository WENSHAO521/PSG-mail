import app from '../hono/hono';
import result from '../model/result';
import userContext from '../security/user-context';
import forwardingService from '../service/forwarding-service';

app.get('/forwarding/query', async c => {
	const data = await forwardingService.query(c, userContext.getUserId(c));
	return c.json(result.ok(data));
});

app.post('/forwarding/add', async c => {
	const { targetEmail } = await c.req.json();
	const data = await forwardingService.add(c, userContext.getUserId(c), targetEmail);
	return c.json(result.ok(data));
});

app.post('/forwarding/:id/resend', async c => {
	const data = await forwardingService.resend(c, userContext.getUserId(c), c.req.param('id'));
	return c.json(result.ok(data));
});

app.post('/forwarding/:id/verify', async c => {
	const { code } = await c.req.json();
	const data = await forwardingService.verify(c, userContext.getUserId(c), c.req.param('id'), code);
	return c.json(result.ok(data));
});

app.put('/forwarding/:id', async c => {
	const data = await forwardingService.update(c, userContext.getUserId(c), c.req.param('id'), await c.req.json());
	return c.json(result.ok(data));
});

app.delete('/forwarding/:id', async c => {
	await forwardingService.remove(c, userContext.getUserId(c), c.req.param('id'));
	return c.json(result.ok());
});

app.get('/forwarding/admin/query', async c => {
	return c.json(result.ok(await forwardingService.adminQuery(c)));
});

app.put('/forwarding/admin/:id/status', async c => {
	const { enabled } = await c.req.json();
	return c.json(result.ok(await forwardingService.adminSetStatus(c, c.req.param('id'), !!enabled)));
});
