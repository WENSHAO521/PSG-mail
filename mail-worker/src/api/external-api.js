import app from '../hono/hono';
import result from '../model/result';
import userContext from '../security/user-context';
import emailService from '../service/email-service';
import accountService from '../service/account-service';
import BizError from '../error/biz-error';
import { t } from '../i18n/i18n';

// External HTTP API — authenticated via X-Api-Key (see security.js `/openapi` branch),
// scoped to whichever user the key belongs to. Mounted under /openapi/*.

function toArray(v) {
	if (!v) return [];
	if (Array.isArray(v)) return v;
	return String(v).split(',').map(s => s.trim()).filter(Boolean);
}

app.post('/openapi/send', async (c) => {
	const userId = userContext.getUserId(c);
	const { from, to, cc, bcc, subject, html, text, attachments } = await c.req.json();

	if (!from) {
		throw new BizError('from is required', 400);
	}

	const accountRow = await accountService.selectByEmailIncludeDel(c, from);

	if (!accountRow) {
		throw new BizError(t('senderAccountNotExist'), 404);
	}

	const emailResult = await emailService.send(c, {
		accountId: accountRow.accountId,
		receiveEmail: toArray(to),
		cc: toArray(cc),
		bcc: toArray(bcc),
		subject: subject || '',
		text: text || '',
		content: html || '',
		attachments: attachments || [],
	}, userId);

	return c.json(result.ok(emailResult[0]));
});

app.get('/openapi/email/:id/status', async (c) => {
	const userId = userContext.getUserId(c);
	const row = await emailService.getOwned(c, c.req.param('id'), userId);

	if (!row) {
		throw new BizError(t('emailNotExist'), 404);
	}

	return c.json(result.ok({
		emailId: row.email_id,
		status: row.status,
		message: row.message,
		resendEmailId: row.resend_email_id,
		isDel: row.is_del
	}));
});

app.delete('/openapi/email/:id', async (c) => {
	const userId = userContext.getUserId(c);
	await emailService.delete(c, { emailIds: c.req.param('id') }, userId);
	return c.json(result.ok());
});

app.delete('/openapi/email/:id/permanent', async (c) => {
	const userId = userContext.getUserId(c);
	const emailIds = c.req.param('id');
	// permanentDelete only removes rows already in the trash (is_del = 1) —
	// soft-delete first so a single call can permanently remove a live email too.
	await emailService.delete(c, { emailIds }, userId);
	await emailService.permanentDelete(c, { emailIds }, userId);
	return c.json(result.ok());
});

app.post('/openapi/email/batch-delete', async (c) => {
	const userId = userContext.getUserId(c);
	const { emailIds = [], permanent = false } = await c.req.json();
	const ids = emailIds.join(',');

	if (!ids) {
		return c.json(result.ok());
	}

	await emailService.delete(c, { emailIds: ids }, userId);

	if (permanent) {
		await emailService.permanentDelete(c, { emailIds: ids }, userId);
	}

	return c.json(result.ok());
});

app.get('/openapi/email/:id/export', async (c) => {
	const userId = userContext.getUserId(c);
	const { filename, content } = await emailService.buildEml(c, c.req.param('id'), userId);
	return new Response(content, {
		headers: {
			'Content-Type': 'message/rfc822',
			'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`
		}
	});
});
