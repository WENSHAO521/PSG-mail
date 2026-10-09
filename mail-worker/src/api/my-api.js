import app from '../hono/hono';
import userService from '../service/user-service';
import result from '../model/result';
import userContext from '../security/user-context';
import sessionService from '../service/session-service';
import BizError from '../error/biz-error';
import { t } from '../i18n/i18n';

app.get('/my/loginUserInfo', async (c) => {
	const user = await userService.loginUserInfo(c, userContext.getUserId(c));
	return c.json(result.ok(user));
});

app.put('/my/resetPassword', async (c) => {
	await userService.changeOwnPassword(c, await c.req.json(), userContext.getUserId(c), await userContext.getToken(c));
	return c.json(result.ok());
});

app.get('/my/sessions', async (c) => {
	const list = await sessionService.list(c, userContext.getUserId(c), await userContext.getToken(c));
	return c.json(result.ok(list));
});

// Sign out every other device (the current session stays valid).
app.delete('/my/sessions', async (c) => {
	const count = await sessionService.revokeOthers(c, userContext.getUserId(c), await userContext.getToken(c));
	return c.json(result.ok({ revoked: count }));
});

app.delete('/my/sessions/:id', async (c) => {
	const ok = await sessionService.revoke(c, userContext.getUserId(c), c.req.param('id'));
	if (!ok) throw new BizError(t('authExpired'), 404);
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

app.put('/my/translate', async (c) => {
	await userService.updateTranslatePref(c, await c.req.json(), userContext.getUserId(c));
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


