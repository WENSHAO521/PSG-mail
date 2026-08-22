import app from '../hono/hono';
import result from '../model/result';
import userContext from '../security/user-context';
import aiMailService from '../service/ai-mail-service';

app.post('/ai/email/summary', async c => {
	const { emailId } = await c.req.json();
	return c.json(result.ok(await aiMailService.summary(c, userContext.getUserId(c), emailId)));
});

app.post('/ai/email/reply-suggestion', async c => {
	const { emailId } = await c.req.json();
	return c.json(result.ok(await aiMailService.replySuggestion(c, userContext.getUserId(c), emailId)));
});

app.post('/ai/compose/transform', async c => {
	return c.json(result.ok(await aiMailService.transform(c, userContext.getUserId(c), await c.req.json())));
});

app.post('/ai/draft-translate', async c => {
	const body = await c.req.json();
	return c.json(result.ok(await aiMailService.transform(c, userContext.getUserId(c), {
		...body,
		operation: body.operation || (body.targetLang === 'en' ? 'translate_en' : 'translate_zh'),
	})));
});
