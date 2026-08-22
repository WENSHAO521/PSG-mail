import app from '../hono/hono';
import result from '../model/result';
import userContext from '../security/user-context';
import notificationEventService from '../service/notification-event-service';

app.get('/notification/events', async c => {
	const data = await notificationEventService.list(c, userContext.getUserId(c), c.req.query());
	return c.json(result.ok(data));
});

app.post('/notification/events/read', async c => {
	const { ids } = await c.req.json();
	await notificationEventService.markRead(c, userContext.getUserId(c), ids);
	return c.json(result.ok());
});

app.post('/notification/events/read-all', async c => {
	await notificationEventService.markAllRead(c, userContext.getUserId(c));
	return c.json(result.ok());
});
