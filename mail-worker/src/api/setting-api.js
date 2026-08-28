import app from '../hono/hono';
import result from '../model/result';
import settingService from '../service/setting-service';
import emailService from '../service/email-service';
import userContext from "../security/user-context";
import alibabaDirectmailService from '../service/alibaba-directmail-service';

app.put('/setting/set', async (c) => {
	await settingService.set(c, await c.req.json());
	return c.json(result.ok());
});

app.get('/setting/query', async (c) => {
	const setting = await settingService.get(c);
	return c.json(result.ok(setting));
});

app.get('/setting/websiteConfig', async (c) => {
	const setting = await settingService.websiteConfig(c);
	return c.json(result.ok(setting));
})

app.put('/setting/setBackground', async (c) => {
	const key = await settingService.setBackground(c, await c.req.json());
	return c.json(result.ok(key));
});

app.delete('/setting/deleteBackground', async (c) => {
	await settingService.deleteBackground(c);
	return c.json(result.ok());
});

app.put('/setting/setBlacklist', async (c) => {
	const setting = await settingService.setBlacklist(c, await c.req.json());
	return c.json(result.ok(setting));
})

app.get('/setting/providerUsage', async (c) => {
	const usage = await emailService.getProviderUsage(c);
	return c.json(result.ok(usage));
});

app.post('/setting/alibaba-directmail/test-connection', async c => {
	alibabaDirectmailService.assertAdmin(c);
	const body = await c.req.json().catch(() => ({}));
	const data = await alibabaDirectmailService.testConnection(c, body);
	return c.json(result.ok(data));
});

app.post('/setting/alibaba-directmail/test-notification', async c => {
	alibabaDirectmailService.assertAdmin(c);
	const { recipient } = await c.req.json();
	const data = await alibabaDirectmailService.sendTestNotification(c, userContext.getUserId(c), recipient);
	return c.json(result.ok({ ...data, submitted: true }));
});
