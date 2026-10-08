import app from '../hono/hono';
import schemaGuard from '../init/schema-guard';
import result from '../model/result';
import userContext from '../security/user-context';


app.get('/autoReply/get', async (c) => {
	await schemaGuard.ensure(c);
	const userId = userContext.getUserId(c);
	const row = await c.env.db.prepare('SELECT enabled, message FROM auto_reply WHERE user_id = ?').bind(userId).first();
	return c.json(result.ok(row || { enabled: 0, message: '' }));
});

app.put('/autoReply/set', async (c) => {
	await schemaGuard.ensure(c);
	const userId = userContext.getUserId(c);
	const { enabled, message } = await c.req.json();
	await c.env.db.prepare(
		`INSERT INTO auto_reply (user_id, enabled, message) VALUES (?,?,?)
		 ON CONFLICT(user_id) DO UPDATE SET enabled=excluded.enabled, message=excluded.message, update_time=CURRENT_TIMESTAMP`
	).bind(userId, enabled ? 1 : 0, message || '').run();
	return c.json(result.ok());
});
