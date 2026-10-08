import app from '../hono/hono';
import userService from '../service/user-service';
import result from '../model/result';
import userContext from '../security/user-context';
import sessionService from '../security/session-service';
import securityAuditService, { SecurityEvent } from '../service/security-audit-service';
import BizError from '../error/biz-error';
import { t } from '../i18n/i18n';

app.get('/my/loginUserInfo', async (c) => {
	const user = await userService.loginUserInfo(c, userContext.getUserId(c));
	return c.json(result.ok(user));
});

app.put('/my/resetPassword', async (c) => {
	await userService.resetPassword(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok());
});

app.put('/my/signature', async (c) => {
	await userService.updateSignature(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok());
});

app.put('/my/signatures', async (c) => {
	const data = await userService.updateSignatures(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok(data));
});

app.put('/my/undoSendSeconds', async (c) => {
	await userService.updateUndoSendSeconds(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok());
});

app.put('/my/replyFromReceived', async (c) => {
	await userService.updateReplyFromReceived(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok());
});

app.get('/my/directory', async (c) => {
	const data = await userService.directory(c);
	return c.json(result.ok(data));
});

app.delete('/my/delete', async (c) => {
	await userService.delete(c, userContext.getUserId(c));
	return c.json(result.ok());
});

app.put('/my/avatar', async (c) => {
	const { avatar } = await c.req.json();
	await userService.saveAvatar(c, avatar, userContext.getUserId(c));
	return c.json(result.ok());
});

app.delete('/my/avatar', async (c) => {
	await userService.clearAvatar(c, userContext.getUserId(c));
	return c.json(result.ok());
});

// Any authenticated user can fetch another user's avatar by email
app.get('/my/avatar', async (c) => {
	const email = c.req.query('email');
	const avatar = await userService.getAvatarByEmail(c, email);
	return c.json(result.ok({ avatar }));
});



// ── Device / session management ─────────────────────────────────────────
app.get('/my/sessions', async (c) => {
	const userId = userContext.getUserId(c);
	const info = await sessionService.read(c, userId, { fresh: true });
	const current = await userContext.getToken(c);
	return c.json(result.ok(sessionService.list(info, current)));
});

app.delete('/my/sessions/:handle', async (c) => {
	const userId = userContext.getUserId(c);
	const removed = await sessionService.revokeByHandle(c, userId, c.req.param('handle'));
	if (!removed) throw new BizError(t('sessionNotFound'), 404);
	await securityAuditService.log(c, SecurityEvent.SESSION_REVOKE, { userId, detail: { handle: c.req.param('handle') } });
	return c.json(result.ok());
});

app.post('/my/sessions/revokeOthers', async (c) => {
	const userId = userContext.getUserId(c);
	const current = await userContext.getToken(c);
	const removed = await sessionService.revokeOthers(c, userId, current);
	await securityAuditService.log(c, SecurityEvent.SESSION_REVOKE_OTHERS, { userId, detail: { removed } });
	return c.json(result.ok({ removed }));
});

app.get('/my/securityLog', async (c) => {
	const list = await securityAuditService.listByUser(c, userContext.getUserId(c), c.req.query('limit'));
	return c.json(result.ok(list));
});
