// Outbound delivery audit trail (table email_delivery_event, migrations/0014).
// One row per provider event or send attempt; email.status stays the
// "current state" column the UI reads, this table is the history behind it.
// Writes never throw — an audit hiccup must not fail a send or a webhook.

const deliveryEventService = {

	async record(c, { emailId = 0, provider, providerMessageId = null, providerEventId = null, eventType, status = null, detail = null }) {
		try {
			await c.env.db.prepare(
				`INSERT INTO email_delivery_event (email_id, provider, provider_message_id, provider_event_id, event_type, status, detail)
				 VALUES (?, ?, ?, ?, ?, ?, ?)
				 ON CONFLICT(provider, provider_event_id) DO NOTHING`
			).bind(
				Number(emailId) || 0,
				String(provider || ''),
				providerMessageId,
				providerEventId,
				String(eventType || ''),
				status,
				detail == null ? null : String(detail).slice(0, 2000)
			).run();
		} catch (e) {
			console.warn('delivery event write skipped:', e?.message);
		}
	},

	async listByEmail(c, emailId) {
		try {
			const { results } = await c.env.db.prepare(
				`SELECT id, provider, event_type AS eventType, status, detail, create_time AS createTime
				 FROM email_delivery_event WHERE email_id = ? ORDER BY id ASC LIMIT 200`
			).bind(Number(emailId)).all();
			return results;
		} catch {
			return [];
		}
	}
};

export default deliveryEventService;
