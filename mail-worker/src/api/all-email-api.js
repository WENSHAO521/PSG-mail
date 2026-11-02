import app from '../hono/hono';
import emailService from '../service/email-service';
import result from '../model/result';
import mailClaimService from '../service/mail-claim-service';

app.get('/allEmail/list', async (c) => {
	const data = await emailService.allList(c, c.req.query());
	return c.json(result.ok(data));
})

app.delete('/allEmail/delete', async (c) => {
	await emailService.allEmailDelete(c, c.req.query());
	return c.json(result.ok());
})

app.delete('/allEmail/batchDelete', async (c) => {
	await emailService.batchDelete(c, c.req.query());
	return c.json(result.ok());
})

app.get('/allEmail/latest', async (c) => {
	const list = await emailService.allEmailLatest(c, c.req.query());
	return c.json(result.ok(list));
})

// Unclaimed mail: list mailboxes it may go to, then assign it (super admin only).
app.get('/allEmail/claimTargets', async (c) => {
	return c.json(result.ok(await mailClaimService.targets(c, c.req.query())));
})

app.post('/allEmail/claim', async (c) => {
	return c.json(result.ok(await mailClaimService.claim(c, await c.req.json())));
})
