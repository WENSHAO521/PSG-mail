import resendService from '../service/resend-service';
import app from '../hono/hono';
import { verifySvix } from '../utils/svix-verify';
app.post('/webhooks',async (c) => {
	try {
		const raw = await c.req.text();
		const secret = c.env.resend_webhook_secret;
		if (secret && !(await verifySvix(secret, c.req.raw.headers, raw))) {
			return c.text('invalid signature', 401);
		}
		await resendService.webhooks(c, JSON.parse(raw));
		return c.text('success', 200)
	} catch (e) {
		return  c.text(e.message, 500)
	}
})
