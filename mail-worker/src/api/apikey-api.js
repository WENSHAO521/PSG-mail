import app from '../hono/hono';
import result from '../model/result';
import userContext from '../security/user-context';
import externalApiKeyService from '../service/external-api-key-service';

// Key management — normal user JWT auth (not the API key itself).

app.get('/apikey/list', async (c) => {
	const list = await externalApiKeyService.list(c, userContext.getUserId(c));
	return c.json(result.ok(list));
});

app.post('/apikey/create', async (c) => {
	const { name } = await c.req.json();
	const data = await externalApiKeyService.create(c, userContext.getUserId(c), name);
	return c.json(result.ok(data));
});

app.delete('/apikey/:id', async (c) => {
	await externalApiKeyService.revoke(c, userContext.getUserId(c), c.req.param('id'));
	return c.json(result.ok());
});
