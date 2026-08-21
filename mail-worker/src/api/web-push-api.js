import app from '../hono/hono';
import result from '../model/result';
import userContext from '../security/user-context';
import webPushSubscriptionService from '../service/web-push-subscription-service';

app.post('/web-push/subscription', async (c) => {
	const userId = userContext.getUserId(c);
	const body = await c.req.json();
	await webPushSubscriptionService.registerSubscription(c, userId, body);
	return c.json(result.ok());
});

app.get('/web-push/subscriptions', async (c) => {
	const userId = userContext.getUserId(c);
	const data = await webPushSubscriptionService.listSubscriptions(c, userId);
	return c.json(result.ok(data));
});

app.delete('/web-push/subscription/:id', async (c) => {
	const userId = userContext.getUserId(c);
	const id = c.req.param('id');
	await webPushSubscriptionService.removeSubscription(c, userId, id);
	return c.json(result.ok());
});

app.post('/web-push/test', async (c) => {
	const userId = userContext.getUserId(c);
	const stats = await webPushSubscriptionService.sendTest(c, userId);
	return c.json(result.ok(stats));
});
