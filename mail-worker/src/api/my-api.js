import app from '../hono/hono';
import userService from '../service/user-service';
import result from '../model/result';
import userContext from '../security/user-context';

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


