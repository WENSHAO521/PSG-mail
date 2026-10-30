import app from '../hono/hono';
import result from '../model/result';
import userContext from '../security/user-context';

const ENSURE = `CREATE TABLE IF NOT EXISTS email_template (template_id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, name TEXT NOT NULL DEFAULT '', subject TEXT NOT NULL DEFAULT '', content TEXT NOT NULL DEFAULT '', create_time DATETIME DEFAULT CURRENT_TIMESTAMP)`;

// category / favorite come from migrations/0026_template_meta.sql; a database
// without them still lists templates (as uncategorised, not favorite).
function toTemplate(r) {
	return {
		templateId: r.template_id,
		name: r.name,
		subject: r.subject,
		content: r.content,
		category: r.category || '',
		favorite: !!r.favorite,
	};
}

function cleanCategory(v) {
	return String(v ?? '').trim().slice(0, 50);
}

app.get('/template/list', async (c) => {
	try { await c.env.db.prepare(ENSURE).run(); } catch {}
	const userId = userContext.getUserId(c);
	const { results } = await c.env.db.prepare(
		'SELECT * FROM email_template WHERE user_id = ? ORDER BY template_id DESC'
	).bind(userId).all();
	return c.json(result.ok(results.map(toTemplate)));
});

app.post('/template/add', async (c) => {
	try { await c.env.db.prepare(ENSURE).run(); } catch {}
	const userId = userContext.getUserId(c);
	const { name, subject, content, category } = await c.req.json();
	const row = await c.env.db.prepare(
		'INSERT INTO email_template (user_id, name, subject, content) VALUES (?,?,?,?) RETURNING *'
	).bind(userId, name || '', subject || '', content || '').first();
	if (cleanCategory(category)) {
		try {
			await c.env.db.prepare('UPDATE email_template SET category = ? WHERE template_id = ?')
				.bind(cleanCategory(category), row.template_id).run();
			row.category = cleanCategory(category);
		} catch { /* column not migrated yet */ }
	}
	return c.json(result.ok(toTemplate(row)));
});

app.put('/template/update', async (c) => {
	const userId = userContext.getUserId(c);
	const { templateId, name, subject, content } = await c.req.json();
	await c.env.db.prepare(
		'UPDATE email_template SET name=?, subject=?, content=? WHERE template_id=? AND user_id=?'
	).bind(name || '', subject || '', content || '', templateId, userId).run();
	return c.json(result.ok());
});

// Category and/or favorite; only the fields passed are changed.
app.put('/template/meta', async (c) => {
	const userId = userContext.getUserId(c);
	const { templateId, category, favorite } = await c.req.json();
	const sets = [];
	const binds = [];
	if (category !== undefined) { sets.push('category = ?'); binds.push(cleanCategory(category)); }
	if (favorite !== undefined) { sets.push('favorite = ?'); binds.push(favorite ? 1 : 0); }
	if (sets.length) {
		await c.env.db.prepare(`UPDATE email_template SET ${sets.join(', ')} WHERE template_id = ? AND user_id = ?`)
			.bind(...binds, Number(templateId), userId).run();
	}
	return c.json(result.ok());
});

app.delete('/template/delete', async (c) => {
	const userId = userContext.getUserId(c);
	const { templateId } = c.req.query();
	await c.env.db.prepare('DELETE FROM email_template WHERE template_id=? AND user_id=?').bind(Number(templateId), userId).run();
	return c.json(result.ok());
});
