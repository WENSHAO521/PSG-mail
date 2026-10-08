// Conversation (thread) reconstruction for one user's accessible mail.
//
// Order of evidence (RFC 5322 §3.6.4):
//   1. Message-ID / In-Reply-To / References links — walked in both
//      directions (ancestors named by the seed's References, descendants whose
//      In-Reply-To points at any message already in the thread).
//   2. Subject is only a CONTROLLED fallback: used when step 1 found no
//      relation at all, and then only for mail in the same mailbox, within a
//      time window, that shares a participant with the seed. A subject match
//      alone ("Re: hello") never joins two threads.
//
// Everything is filtered to mail the caller may read, so a thread can never
// pull in someone else's message just because they share a Message-ID.

const MAX_MESSAGES = 100;
const MAX_ROUNDS = 6;
const SUBJECT_WINDOW_DAYS = 30;
const SUBJECT_MAX = 20;

export function extractIds(value, { keepCase = false } = {}) {
	const ids = [];
	for (const m of String(value || '').match(/<[^<>\s]+>/g) || []) {
		const id = keepCase ? m : m.toLowerCase();
		if (!ids.includes(id)) ids.push(id);
	}
	return ids;
}

// "Re: [PSG] Fwd: 回复：Subject" → "[psg] subject" — reply/forward prefixes in
// the languages this product handles.
export function normalizeSubject(subject) {
	let s = String(subject || '').trim();
	// A mailing-list tag may sit before the prefix: "[PSG] Re: subject".
	const prefix = /^\s*(\[[^\]]{1,30}\]\s*)?(re|fw|fwd|aw|wg|antw|sv|vs|回复|答复|回覆|轉發|转发|回信|전달|답장)\s*(\[\d+\])?\s*[:：]\s*/i;
	for (let i = 0; i < 10 && prefix.test(s); i++) s = s.replace(prefix, '$1');
	return s.replace(/\s+/g, ' ').trim().toLowerCase();
}

function placeholders(n) {
	return Array.from({ length: n }, () => '?').join(',');
}

function participants(row) {
	const set = new Set();
	const add = (a) => { if (a) set.add(String(a).toLowerCase()); };
	add(row.send_email);
	add(row.to_email);
	for (const field of [row.recipient, row.cc]) {
		try { for (const p of JSON.parse(field || '[]')) add(p.address); } catch { /* ignore */ }
	}
	return set;
}

const COLS = `email_id, account_id, user_id, send_email, name, to_email, recipient, cc, subject, text, message_id, in_reply_to, relation, type, create_time, unread, is_del`;

const threadService = {

	// accessSql/accessBinds restrict rows to what the caller may read.
	async load(c, seed, { accessSql, accessBinds }) {
		const db = c.env.db;
		const byId = new Map([[seed.email_id, seed]]);
		const known = new Set();      // normalized Message-IDs in the thread
		const wanted = new Set();     // ids referenced but not yet fetched
		// normalized id -> raw spellings seen, so lookups can use the plain
		// message_id / in_reply_to indexes (LOWER(col) would force a scan).
		const spellings = new Map();
		const spell = (v) => {
			for (const raw of extractIds(v, { keepCase: true })) {
				const n = raw.toLowerCase();
				if (!spellings.has(n)) spellings.set(n, new Set([n]));
				spellings.get(n).add(raw);
			}
		};
		const sqlIds = (ids) => [...new Set(ids.flatMap(i => [...(spellings.get(i) || [i])]))];
		const noteIds = (row) => {
			spell(row.message_id); spell(row.in_reply_to); spell(row.relation);
			const own = extractIds(row.message_id);
			own.forEach(i => known.add(i));
			[...extractIds(row.in_reply_to), ...extractIds(row.relation)].forEach(i => { if (!known.has(i)) wanted.add(i); });
		};
		noteIds(seed);

		for (let round = 0; round < MAX_ROUNDS && byId.size < MAX_MESSAGES; round++) {
			const fetchIds = [...wanted].filter(i => !known.has(i)).slice(0, 40);
			const childIds = [...known].slice(0, 40);
			let added = 0;

			if (fetchIds.length) {
				// Raw Message-ID strings are stored as received (usually "<id>").
				// Compare case-insensitively on the normalized form.
				const binds = sqlIds(fetchIds);
				const { results } = await db.prepare(
					`SELECT ${COLS} FROM email WHERE message_id IN (${placeholders(binds.length)}) AND ${accessSql} LIMIT ${MAX_MESSAGES}`
				).bind(...binds, ...accessBinds).all();
				for (const r of results) {
					if (!byId.has(r.email_id)) { byId.set(r.email_id, r); noteIds(r); added++; }
				}
				fetchIds.forEach(i => wanted.delete(i));
			}

			if (childIds.length) {
				const binds = sqlIds(childIds);
				const { results } = await db.prepare(
					`SELECT ${COLS} FROM email WHERE in_reply_to IN (${placeholders(binds.length)}) AND ${accessSql} LIMIT ${MAX_MESSAGES}`
				).bind(...binds, ...accessBinds).all();
				for (const r of results) {
					if (!byId.has(r.email_id)) { byId.set(r.email_id, r); noteIds(r); added++; }
				}
			}
			if (!added) break;
		}

		let matchedBy = 'headers';
		let messages = [...byId.values()];

		// Controlled subject fallback — only when headers found nothing.
		if (messages.length === 1) {
			const norm = normalizeSubject(seed.subject);
			if (norm.length >= 4) {
				// The mailbox owner is in every message of their own mailbox, so
				// their address proves nothing — only OTHER people count.
				const owner = await db.prepare('SELECT email FROM account WHERE account_id = ?').bind(seed.account_id).first();
				const ownerAddr = String(owner?.email || '').toLowerCase();
				const others = (row) => { const p = participants(row); p.delete(ownerAddr); return p; };
				const mine = others(seed);
				const { results } = await db.prepare(
					`SELECT ${COLS} FROM email WHERE account_id = ? AND email_id != ? AND ${accessSql}
					 AND create_time >= datetime(?, ?) AND create_time <= datetime(?, ?)
					 AND subject LIKE ? COLLATE NOCASE ORDER BY email_id DESC LIMIT 100`
				).bind(seed.account_id, seed.email_id, ...accessBinds,
					seed.create_time, `-${SUBJECT_WINDOW_DAYS} days`, seed.create_time, `+${SUBJECT_WINDOW_DAYS} days`,
					`%${norm.replace(/[%_]/g, '')}%`).all();
				const extra = results.filter(r => {
					if (normalizeSubject(r.subject) !== norm) return false;
					for (const p of others(r)) if (mine.has(p)) return true;
					return false;
				}).slice(0, SUBJECT_MAX);
				if (extra.length) {
					messages = messages.concat(extra);
					matchedBy = 'subject';
				} else {
					matchedBy = 'none';
				}
			} else {
				matchedBy = 'none';
			}
		}

		messages.sort((a, b) => String(a.create_time).localeCompare(String(b.create_time)) || a.email_id - b.email_id);
		return {
			seedEmailId: seed.email_id,
			matchedBy,
			truncated: byId.size >= MAX_MESSAGES,
			messages,
		};
	}
};

export default threadService;
