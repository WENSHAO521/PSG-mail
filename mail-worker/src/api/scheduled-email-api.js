import app from '../hono/hono';
import result from '../model/result';
import userContext from '../security/user-context';
import scheduledEmailService from '../service/scheduled-email-service';

app.post('/email/schedule', async (c) => {
	const row = await scheduledEmailService.create(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok(row));
});

app.get('/email/schedule/list', async (c) => {
	const list = await scheduledEmailService.list(c, userContext.getUserId(c));
	return c.json(result.ok(list));
});

app.put('/email/schedule/:id/cancel', async (c) => {
	const row = await scheduledEmailService.cancel(c, c.req.param('id'), userContext.getUserId(c));
	return c.json(result.ok(row));
});

app.put('/email/schedule/:id/reschedule', async (c) => {
	const row = await scheduledEmailService.reschedule(c, c.req.param('id'), userContext.getUserId(c), await c.req.json());
	return c.json(result.ok(row));
});

app.post('/email/schedule/:id/send-now', async (c) => {
	const row = await scheduledEmailService.sendNow(c, c.req.param('id'), userContext.getUserId(c));
	return c.json(result.ok(row));
});

// Cancels the schedule and returns the full payload (incl. attachments) so
// Compose can reopen with everything intact — see
// scheduledEmailService.beginEdit for why this isn't an in-place PATCH.
app.post('/email/schedule/:id/edit', async (c) => {
	const payload = await scheduledEmailService.beginEdit(c, c.req.param('id'), userContext.getUserId(c));
	return c.json(result.ok(payload));
});
