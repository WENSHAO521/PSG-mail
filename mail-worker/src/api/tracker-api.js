import app from '../hono/hono';
import result from '../model/result';
import userContext from '../security/user-context';
import trackerService from '../service/tracker-service';

app.get('/tracker/allow', async (c) => {
	return c.json(result.ok(await trackerService.listAllowed(c, userContext.getUserId(c))));
});

app.post('/tracker/allow', async (c) => {
	const { email } = await c.req.json();
	await trackerService.allow(c, userContext.getUserId(c), email);
	return c.json(result.ok());
});

app.delete('/tracker/allow', async (c) => {
	await trackerService.disallow(c, userContext.getUserId(c), c.req.query('email'));
	return c.json(result.ok());
});
