import app from '../hono/hono';
import schemaGuard from '../init/schema-guard';
import result from '../model/result';
import userContext from '../security/user-context';


app.get('/template/list', async (c) => {
	await schemaGuard.ensure(c);
	const userId = userContext.getUserId(c);
	const { results } = await c.env.db.prepare(
		'SELECT template_id, name, subject, content FROM email_template WHERE user_id = ? ORDER BY template_id DESC'
	).bind(userId).all();
	return c.json(result.ok(results.map(r => ({
		templateId: r.template_id,
		name: r.name,
		subject: r.subject,
		content: r.content,
	}))));
});

app.post('/template/add', async (c) => {
	await schemaGuard.ensure(c);
	const userId = userContext.getUserId(c);
	const { name, subject, content } = await c.req.json();
	const row = await c.env.db.prepare(
		'INSERT INTO email_template (user_id, name, subject, content) VALUES (?,?,?,?) RETURNING *'
	).bind(userId, name || '', subject || '', content || '').first();
	return c.json(result.ok({
		templateId: row.template_id,
		name: row.name,
		subject: row.subject,
		content: row.content,
	}));
});

app.put('/template/update', async (c) => {
	const userId = userContext.getUserId(c);
	const { templateId, name, subject, content } = await c.req.json();
	await c.env.db.prepare(
		'UPDATE email_template SET name=?, subject=?, content=? WHERE template_id=? AND user_id=?'
	).bind(name || '', subject || '', content || '', templateId, userId).run();
	return c.json(result.ok());
});

app.delete('/template/delete', async (c) => {
	const userId = userContext.getUserId(c);
	const { templateId } = c.req.query();
	await c.env.db.prepare('DELETE FROM email_template WHERE template_id=? AND user_id=?').bind(Number(templateId), userId).run();
	return c.json(result.ok());
});
