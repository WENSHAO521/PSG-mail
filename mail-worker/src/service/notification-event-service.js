function parsePayload(value) {
	try { return JSON.parse(value || '{}'); } catch { return {}; }
}

const notificationEventService = {
	async createNewMail(c) {
		const { env, userId, accountId, email } = c;
		if (!userId || !email?.emailId) return null;
		try {
			const payload = JSON.stringify({
				type: 'new_mail',
				emailId: email.emailId,
				accountId,
				from: email.sendEmail || '',
				subject: email.subject || '',
			});
			await env.db.prepare(
				`INSERT INTO notification_event (user_id, account_id, email_id, event_type, title, body, payload)
				 VALUES (?, ?, ?, 'new_mail', ?, ?, ?)`
			).bind(
				userId,
				accountId || 0,
				email.emailId,
				email.name || email.sendEmail || 'PSG Mail',
				email.subject || '',
				payload,
			).run();
		} catch (error) {
			// Notification persistence is deliberately isolated from mail receipt.
			console.error('notification event create failed', error?.message || error);
		}
	},

	async list(c, userId, { cursor, limit } = {}) {
		const pageSize = Math.min(100, Math.max(1, Number(limit) || 30));
		const cursorId = Math.max(0, Number(cursor) || 0);
		const { results } = await c.env.db.prepare(
			`SELECT id, account_id AS accountId, email_id AS emailId, event_type AS eventType,
				title, body, payload, read_at AS readAt, created_at AS createdAt
			 FROM notification_event WHERE user_id = ? AND id < ?
			 ORDER BY id DESC LIMIT ?`
		).bind(userId, cursorId || 9223372036854775807, pageSize).all();
		return results.map(row => ({ ...row, payload: parsePayload(row.payload), unread: !row.readAt }));
	},

	async markRead(c, userId, ids = []) {
		const list = [...new Set((Array.isArray(ids) ? ids : [ids]).map(Number).filter(Boolean))];
		if (!list.length) return;
		const placeholders = list.map(() => '?').join(',');
		await c.env.db.prepare(
			`UPDATE notification_event SET read_at = CURRENT_TIMESTAMP WHERE user_id = ? AND id IN (${placeholders})`
		).bind(userId, ...list).run();
	},

	async markAllRead(c, userId) {
		await c.env.db.prepare(
			`UPDATE notification_event SET read_at = CURRENT_TIMESTAMP WHERE user_id = ? AND read_at IS NULL`
		).bind(userId).run();
	},
};

export default notificationEventService;
