import app from '../hono/hono';
import schemaGuard from '../init/schema-guard';
import result from '../model/result';
import userContext from '../security/user-context';


function parseContacts(raw) {
	try {
		const parsed = JSON.parse(raw || '[]');
		return parsed.map(item =>
			typeof item === 'string' ? { name: '', email: item } : item
		);
	} catch { return []; }
}

app.get('/contactGroup/list', async (c) => {
	await schemaGuard.ensure(c);
	const userId = userContext.getUserId(c);
	const { results } = await c.env.db.prepare(
		'SELECT group_id, name, emails FROM contact_group WHERE user_id = ? ORDER BY group_id DESC'
	).bind(userId).all();
	return c.json(result.ok(results.map(r => ({ groupId: r.group_id, name: r.name, contacts: parseContacts(r.emails) }))));
});

app.post('/contactGroup/add', async (c) => {
	await schemaGuard.ensure(c);
	const userId = userContext.getUserId(c);
	const { name, contacts } = await c.req.json();
	const row = await c.env.db.prepare(
		'INSERT INTO contact_group (user_id, name, emails) VALUES (?,?,?) RETURNING *'
	).bind(userId, name || '', JSON.stringify(contacts || [])).first();
	return c.json(result.ok({ groupId: row.group_id, name: row.name, contacts: parseContacts(row.emails) }));
});

app.put('/contactGroup/update', async (c) => {
	const userId = userContext.getUserId(c);
	const { groupId, name, contacts } = await c.req.json();
	await c.env.db.prepare(
		'UPDATE contact_group SET name=?, emails=? WHERE group_id=? AND user_id=?'
	).bind(name || '', JSON.stringify(contacts || []), groupId, userId).run();
	return c.json(result.ok());
});

app.delete('/contactGroup/delete', async (c) => {
	const userId = userContext.getUserId(c);
	const { groupId } = c.req.query();
	await c.env.db.prepare('DELETE FROM contact_group WHERE group_id=? AND user_id=?').bind(Number(groupId), userId).run();
	return c.json(result.ok());
});
