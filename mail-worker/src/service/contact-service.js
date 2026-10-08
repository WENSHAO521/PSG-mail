// Auto contacts: everyone the user has exchanged mail with, derived from the
// email table. The derivation aggregates the user's whole mail history, so the
// result is cached in KV for a couple of minutes (and dropped when a contact
// is removed) instead of being recomputed on every contacts/autocomplete read. Addresses the user sent
// to count double, since a reply means a real two-way contact; frequent
// contacts need at least one sent message, which keeps newsletters and
// notification senders out however much they mail.
const MAX_CONTACTS = 500;
const CACHE_TTL_SECONDS = 120;
const cacheKey = (userId) => `contacts:${userId}`;
const SENT_WEIGHT = 2;
const FREQUENT_MIN_SCORE = 4;
const FREQUENT_MAX = 30;
const AUTOMATED = /^(no-?reply|do-?not-?reply|donotreply|mailer-daemon|postmaster|bounces?|notifications?|alerts?)([+._-]|@)/i;

const RECEIVED_SQL = (spam) => `
	SELECT lower(trim(send_email)) AS email, name, COUNT(*) AS cnt, MAX(create_time) AS last
	FROM email
	WHERE user_id = ? AND type = 0 AND send_email IS NOT NULL AND send_email != ''${spam ? ' AND COALESCE(is_spam, 0) = 0' : ''}
	GROUP BY lower(trim(send_email))`;

// recipient / cc hold JSON arrays of { address, name }.
const SENT_SQL = (column) => `
	SELECT lower(trim(json_extract(j.value, '$.address'))) AS email,
	       json_extract(j.value, '$.name') AS name, COUNT(*) AS cnt, MAX(e.create_time) AS last
	FROM email e, json_each(CASE WHEN json_valid(e.${column}) THEN e.${column} ELSE '[]' END) j
	WHERE e.user_id = ? AND e.type = 1 AND json_extract(j.value, '$.address') IS NOT NULL
	GROUP BY 1`;

async function rows(c, sql, ...binds) {
	const { results } = await c.env.db.prepare(sql).bind(...binds).all();
	return results || [];
}

async function hiddenSet(c, userId) {
	try {
		return new Set((await rows(c, 'SELECT email FROM psg_contact_hidden WHERE user_id = ?', userId)).map(r => r.email));
	} catch {
		return new Set(); // migration 0014 not applied yet
	}
}

const contactService = {
	async list(c, userId) {
		try {
			const cached = await c.env.kv.get(cacheKey(userId), { type: 'json' });
			if (Array.isArray(cached)) return cached;
		} catch {} // cache is best effort
		const list = await this.compute(c, userId);
		try {
			await c.env.kv.put(cacheKey(userId), JSON.stringify(list), { expirationTtl: CACHE_TTL_SECONDS });
		} catch {}
		return list;
	},

	async compute(c, userId) {
		let received;
		try {
			received = await rows(c, RECEIVED_SQL(true), userId);
		} catch {
			received = await rows(c, RECEIVED_SQL(false), userId); // no is_spam column yet
		}
		const [sentTo, sentCc, own, hidden] = await Promise.all([
			rows(c, SENT_SQL('recipient'), userId),
			rows(c, SENT_SQL('cc'), userId),
			rows(c, 'SELECT lower(email) AS email FROM account WHERE user_id = ?', userId),
			hiddenSet(c, userId),
		]);
		const ownSet = new Set(own.map(r => r.email));

		const map = new Map();
		const add = (r, field) => {
			const email = r.email;
			if (!email || !email.includes('@') || ownSet.has(email) || hidden.has(email)) return;
			const item = map.get(email) || { email, name: '', received: 0, sent: 0, lastTime: '' };
			item[field] += Number(r.cnt) || 0;
			if (r.name && (!item.name || r.last > item.lastTime)) item.name = String(r.name).trim();
			if (r.last > item.lastTime) item.lastTime = r.last;
			map.set(email, item);
		};
		received.forEach(r => add(r, 'received'));
		sentTo.forEach(r => add(r, 'sent'));
		sentCc.forEach(r => add(r, 'sent'));

		const list = [...map.values()].map(item => ({
			...item,
			automated: AUTOMATED.test(item.email),
			score: item.received + item.sent * SENT_WEIGHT,
		}));
		const frequent = new Set(list
			.filter(i => i.sent > 0 && !i.automated && i.score >= FREQUENT_MIN_SCORE)
			.sort((a, b) => b.score - a.score)
			.slice(0, FREQUENT_MAX)
			.map(i => i.email));

		return list
			.map(({ score, ...item }) => ({ ...item, total: item.received + item.sent, frequent: frequent.has(item.email), score }))
			.sort((a, b) => (b.frequent - a.frequent) || (b.score - a.score) || String(b.lastTime).localeCompare(String(a.lastTime)))
			.slice(0, MAX_CONTACTS)
			.map(({ score, ...item }) => item);
	},

	async hide(c, userId, email) {
		const value = String(email || '').trim().toLowerCase();
		if (!value) return;
		await c.env.db.prepare('INSERT OR IGNORE INTO psg_contact_hidden (user_id, email) VALUES (?, ?)').bind(userId, value).run();
		try { await c.env.kv.delete(cacheKey(userId)); } catch {}
	},
};

export default contactService;
