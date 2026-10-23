import app from '../hono/hono';
import result from '../model/result';
import userContext from '../security/user-context';
import mailRuleService from '../service/mail-rule-service';

app.get('/rule/list', async (c) => {
	return c.json(result.ok(await mailRuleService.list(c, userContext.getUserId(c))));
});

app.post('/rule/add', async (c) => {
	return c.json(result.ok(await mailRuleService.create(c, userContext.getUserId(c), await c.req.json())));
});

app.put('/rule/update', async (c) => {
	return c.json(result.ok(await mailRuleService.update(c, userContext.getUserId(c), await c.req.json())));
});

app.delete('/rule/delete', async (c) => {
	await mailRuleService.remove(c, userContext.getUserId(c), c.req.query('id'));
	return c.json(result.ok());
});

app.post('/rule/import', async (c) => {
	const { rules } = await c.req.json();
	return c.json(result.ok(await mailRuleService.importLocal(c, userContext.getUserId(c), rules)));
});
