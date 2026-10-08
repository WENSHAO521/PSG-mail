import app from '../hono/hono';
import result from '../model/result';
import userContext from '../security/user-context';
import contactService from '../service/contact-service';

app.get('/contact/list', async (c) => {
	return c.json(result.ok(await contactService.list(c, userContext.getUserId(c))));
});

app.delete('/contact/hide', async (c) => {
	await contactService.hide(c, userContext.getUserId(c), c.req.query('email'));
	return c.json(result.ok());
});
