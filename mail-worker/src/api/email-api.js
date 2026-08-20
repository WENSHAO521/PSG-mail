import app from '../hono/hono';
import emailService from '../service/email-service';
import result from '../model/result';
import userContext from '../security/user-context';
import attService from '../service/att-service';
import BizError from '../error/biz-error';
import { t } from '../i18n/i18n';

app.get('/email/list', async (c) => {
	const data = await emailService.list(c, c.req.query(), userContext.getUserId(c));
	return c.json(result.ok(data));
});

app.get('/email/latest', async (c) => {
	const list = await emailService.latest(c, c.req.query(), userContext.getUserId(c));
	return c.json(result.ok(list));
});

// Single-email fetch for the new-mail sync path (Firebase push carries only
// emailId/accountId; the client calls this to get the full row for Inbox
// display). Scoped to the caller's own/shared mail — see emailService.detail.
app.get('/email/detail', async (c) => {
	const row = await emailService.detail(c, c.req.query('emailId'), userContext.getUserId(c));
	if (!row) throw new BizError(t('emailNotExist'), 404);
	return c.json(result.ok(row));
});

app.delete('/email/delete', async (c) => {
	await emailService.delete(c, c.req.query(), userContext.getUserId(c));
	return c.json(result.ok());
});

app.get('/email/attList', async (c) => {
	const attList = await attService.list(c, c.req.query(), userContext.getUserId(c));
	return c.json(result.ok(attList));
});

app.post('/email/send', async (c) => {
	const email = await emailService.send(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok(email));
});

app.put('/email/read', async (c) => {
	await emailService.read(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok());
})

app.put('/email/spam', async (c) => {
	await emailService.markSpam(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok());
})

app.put('/email/unspam', async (c) => {
	await emailService.unmarkSpam(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok());
})

app.put('/email/archive', async (c) => {
	await emailService.archiveEmail(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok());
})

app.put('/email/unarchive', async (c) => {
	await emailService.unarchiveEmail(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok());
})

app.get('/email/archive/list', async (c) => {
	const data = await emailService.archiveList(c, c.req.query(), userContext.getUserId(c));
	return c.json(result.ok(data));
})

app.get('/email/spam/list', async (c) => {
	const data = await emailService.spamList(c, c.req.query(), userContext.getUserId(c));
	return c.json(result.ok(data));
})

app.put('/email/restore', async (c) => {
	await emailService.restore(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok());
})

app.get('/email/trash/list', async (c) => {
	const data = await emailService.trashList(c, c.req.query(), userContext.getUserId(c));
	return c.json(result.ok(data));
})

app.delete('/email/permanent-delete', async (c) => {
	await emailService.permanentDelete(c, c.req.query(), userContext.getUserId(c));
	return c.json(result.ok());
})

app.get('/email/export-eml/:emailId', async (c) => {
	const { filename, content } = await emailService.buildEml(c, c.req.param('emailId'), userContext.getUserId(c));
	return new Response(content, {
		headers: {
			'Content-Type': 'message/rfc822',
			'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`
		}
	});
})

