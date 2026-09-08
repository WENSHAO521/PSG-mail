import app from '../hono/hono';
import result from '../model/result';
import userContext from '../security/user-context';
import aiAssistantService from '../service/ai-assistant-service';

app.post('/ai-assistant/chat', async (c) => {
	const { messages } = await c.req.json();
	const data = await aiAssistantService.chat(c, userContext.getUserId(c), messages || []);
	return c.json(result.ok(data));
});

app.post('/ai-assistant/confirm', async (c) => {
	const { confirmId, approve } = await c.req.json();
	const data = await aiAssistantService.confirm(c, userContext.getUserId(c), confirmId, !!approve);
	return c.json(result.ok(data));
});
