import app from '../hono/hono';
import result from '../model/result';
import userContext from '../security/user-context';
import searchService from '../service/search-service';
import emailService from '../service/email-service';
import labelServiceModule from '../service/label-service';

// POST (not GET) — the query can combine several operators plus free text
// and is naturally a small JSON body, matching the existing /email/schedule
// style for "structured, possibly-growing request shape" endpoints here.
app.post('/email/search', async (c) => {
	const userId = userContext.getUserId(c);
	const data = await searchService.search(c, await c.req.json(), userId);
	await emailService.emailAddAtt(c, data.list);
	await labelServiceModule.attachLabels(c, data.list);
	return c.json(result.ok(data));
});
