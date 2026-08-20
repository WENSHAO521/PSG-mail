import app from '../hono/hono';
import result from '../model/result';
import userContext from '../security/user-context';
import labelService from '../service/label-service';
import emailService from '../service/email-service';

app.post('/label/create', async (c) => {
	const row = await labelService.create(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok(row));
});

app.put('/label/:id', async (c) => {
	const row = await labelService.update(c, c.req.param('id'), await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok(row));
});

app.delete('/label/:id', async (c) => {
	await labelService.remove(c, c.req.param('id'), userContext.getUserId(c));
	return c.json(result.ok());
});

app.get('/label/list', async (c) => {
	const list = await labelService.list(c, userContext.getUserId(c));
	return c.json(result.ok(list));
});

app.post('/label/apply', async (c) => {
	const data = await labelService.apply(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok(data));
});

app.post('/label/remove', async (c) => {
	const data = await labelService.removeFromEmails(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok(data));
});

app.get('/label/:id/emails', async (c) => {
	const userId = userContext.getUserId(c);
	const data = await labelService.emailsForLabel(c, c.req.param('id'), userId, c.req.query());
	await emailService.emailAddAtt(c, data.list);
	await labelService.attachLabels(c, data.list);
	return c.json(result.ok(data));
});
