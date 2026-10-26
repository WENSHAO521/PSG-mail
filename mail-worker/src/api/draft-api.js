import app from '../hono/hono';
import result from '../model/result';
import userContext from '../security/user-context';
import draftService from '../service/draft-service';

app.get('/draft/list', async (c) => {
	return c.json(result.ok(await draftService.list(c, userContext.getUserId(c))));
});

app.post('/draft/save', async (c) => {
	return c.json(result.ok(await draftService.save(c, userContext.getUserId(c), await c.req.json())));
});

app.delete('/draft/delete', async (c) => {
	const userId = userContext.getUserId(c);
	await draftService.remove(c, userId, c.req.query('draftIds'));
	return c.json(result.ok());
});
