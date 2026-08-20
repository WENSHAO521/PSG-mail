import app from '../hono/hono';
import result from '../model/result';
import userContext from '../security/user-context';
import notificationService from '../service/notification-service';

app.post('/notification/device', async (c) => {
	await notificationService.ensureTable(c);
	const userId = userContext.getUserId(c);
	const body = await c.req.json();
	await notificationService.registerDevice(c, userId, body);
	return c.json(result.ok());
});

app.get('/notification/devices', async (c) => {
	await notificationService.ensureTable(c);
	const userId = userContext.getUserId(c);
	const data = await notificationService.listDevices(c, userId);
	return c.json(result.ok(data));
});

app.delete('/notification/device/:id', async (c) => {
	await notificationService.ensureTable(c);
	const userId = userContext.getUserId(c);
	const id = c.req.param('id');
	await notificationService.removeDevice(c, userId, id);
	return c.json(result.ok());
});

app.post('/notification/test', async (c) => {
	await notificationService.ensureTable(c);
	const userId = userContext.getUserId(c);
	await notificationService.sendTest(c, userId);
	return c.json(result.ok());
});
