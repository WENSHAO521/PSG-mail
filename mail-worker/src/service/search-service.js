import { emailConst, isDel } from '../const/entity-const';

// Real backend mail search — the frontend used to only `.filter()` an
// already-in-memory page of results, so it could never find anything the
// user hadn't already scrolled to. This queries D1 directly with Gmail-
// style operators, scoped to whatever the caller can actually see (owner or
// shared account — same model as emailService.list()/latest()).
//
// Deliberately raw SQL (not drizzle's query builder): the WHERE clause is
// assembled from an arbitrary, order-independent set of operators, which
// doesn't fit drizzle's typed builder well — same reasoning as
// emailService's archiveList()/spamList()/trashList().

const OPERATORS = new Set([
	'from', 'to', 'cc', 'subject', 'after', 'before', 'has', 'is', 'in', 'label',
]);

// Splits `from:@x.org subject:"revision request" has:attachment manuscript`
// into operator tokens and free-text keyword tokens. Quoted values (operator
// or bare) keep internal whitespace; unrecognized `word:value` pairs are
// treated as plain keywords (so a literal "10:30" in a search doesn't
// misparse as an operator).
export function parseSearchQuery(raw) {
	const query = String(raw || '').trim();
	const tokens = [];
	const re = /([a-zA-Z]+):"([^"]*)"|([a-zA-Z]+):(\S+)|"([^"]*)"|(\S+)/g;
	let m;
	while ((m = re.exec(query)) !== null) {
		if (m[1] !== undefined) {
			const op = m[1].toLowerCase();
			if (OPERATORS.has(op)) tokens.push({ op, value: m[2] });
			else if (m[2]) tokens.push({ op: null, value: `${m[1]}:${m[2]}` });
		} else if (m[3] !== undefined) {
			const op = m[3].toLowerCase();
			if (OPERATORS.has(op)) tokens.push({ op, value: m[4] });
			else tokens.push({ op: null, value: `${m[3]}:${m[4]}` });
		} else if (m[5] !== undefined) {
			if (m[5]) tokens.push({ op: null, value: m[5] });
		} else if (m[6]) {
			tokens.push({ op: null, value: m[6] });
		}
	}
	return tokens;
}

function dateOnly(value) {
	// Accepts YYYY-MM-DD (and tolerates YYYY/MM/DD) — anything else is
	// ignored rather than producing a nonsensical WHERE clause.
	const normalized = String(value || '').replace(/\//g, '-');
	return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null;
}

async function getSharedAccountIds(c, userId) {
	try {
		const { results } = await c.env.db
			.prepare('SELECT account_id FROM account_share WHERE user_id = ?')
			.bind(userId).all();
		return results.map(r => r.account_id);
	} catch { return []; }
}

const searchService = {

	async search(c, params, userId) {
		let { query, accountId, allReceive, cursor, size } = params;
		size = Math.min(Number(size) || 20, 50);
		cursor = Number(cursor) || 9999999999;
		accountId = Number(accountId);
		allReceive = Number(allReceive);

		const tokens = parseSearchQuery(query);
		const sharedIds = await getSharedAccountIds(c, userId);
		const accessCond = sharedIds.length > 0
			? `(e.user_id = ? OR e.account_id IN (${sharedIds.map(() => '?').join(',')}))`
			: 'e.user_id = ?';
		const accessBinds = sharedIds.length > 0 ? [userId, ...sharedIds] : [userId];

		const conditions = [accessCond, 'e.email_id < ?'];
		const binds = [...accessBinds];
		const bindsAfterCursor = [cursor];

		if (!allReceive) {
			conditions.push('e.account_id = ?');
			bindsAfterCursor.push(accountId);
		}

		// Default scope excludes Trash only — search is expected to span the
		// whole mailbox (Inbox/Archive/Spam/Sent), matching "find old mail I
		// didn't keep in Inbox" being the entire point of a search feature.
		// An explicit in: operator narrows it.
		let scopedFolder = false;
		let keywordCount = 0;

		for (const { op, value } of tokens) {
			if (!value) continue;
			switch (op) {
				case 'from':
					conditions.push('(e.send_email LIKE ? COLLATE NOCASE OR e.name LIKE ? COLLATE NOCASE)');
					bindsAfterCursor.push(`%${value}%`, `%${value}%`);
					break;
				case 'to':
					conditions.push('e.to_email LIKE ? COLLATE NOCASE');
					bindsAfterCursor.push(`%${value}%`);
					break;
				case 'cc':
					conditions.push('e.cc LIKE ? COLLATE NOCASE');
					bindsAfterCursor.push(`%${value}%`);
					break;
				case 'subject':
					conditions.push('e.subject LIKE ? COLLATE NOCASE');
					bindsAfterCursor.push(`%${value}%`);
					break;
				case 'after': {
					const d = dateOnly(value);
					if (d) { conditions.push('e.create_time >= ?'); bindsAfterCursor.push(`${d} 00:00:00`); }
					break;
				}
				case 'before': {
					const d = dateOnly(value);
					if (d) { conditions.push('e.create_time < ?'); bindsAfterCursor.push(`${d} 00:00:00`); }
					break;
				}
				case 'has':
					if (value.toLowerCase() === 'attachment') {
						conditions.push('EXISTS (SELECT 1 FROM attachments a WHERE a.email_id = e.email_id AND a.type = 0)');
					}
					break;
				case 'is':
					if (value.toLowerCase() === 'unread') { conditions.push('e.unread = ?'); bindsAfterCursor.push(emailConst.unread.UNREAD); }
					else if (value.toLowerCase() === 'read') { conditions.push('e.unread = ?'); bindsAfterCursor.push(emailConst.unread.READ); }
					else if (value.toLowerCase() === 'starred') {
						conditions.push('EXISTS (SELECT 1 FROM star s WHERE s.email_id = e.email_id AND s.user_id = ?)');
						bindsAfterCursor.push(userId);
					}
					break;
				case 'in': {
					scopedFolder = true;
					const folder = value.toLowerCase();
					if (folder === 'inbox') {
						conditions.push('e.is_del = ? AND COALESCE(e.is_archive,0) = 0 AND COALESCE(e.is_spam,0) = 0 AND e.type = ?');
						bindsAfterCursor.push(isDel.NORMAL, emailConst.type.RECEIVE);
					} else if (folder === 'sent') {
						conditions.push('e.is_del = ? AND e.type = ?');
						bindsAfterCursor.push(isDel.NORMAL, emailConst.type.SEND);
					} else if (folder === 'archive') {
						conditions.push('e.is_del = ? AND COALESCE(e.is_archive,0) = 1');
						bindsAfterCursor.push(isDel.NORMAL);
					} else if (folder === 'spam') {
						conditions.push('e.is_del = ? AND COALESCE(e.is_spam,0) = 1');
						bindsAfterCursor.push(isDel.NORMAL);
					} else if (folder === 'trash') {
						conditions.push('e.is_del = ?');
						bindsAfterCursor.push(isDel.DELETE);
					} else {
						scopedFolder = false; // unrecognized folder — fall through to default scope
					}
					break;
				}
				case 'label':
					conditions.push(
						`EXISTS (SELECT 1 FROM mail_label_email le JOIN mail_label l ON l.label_id = le.label_id
						 WHERE le.email_id = e.email_id AND l.user_id = ? AND l.name = ? COLLATE NOCASE)`
					);
					bindsAfterCursor.push(userId, value);
					break;
				default:
					// Free-text keyword — must appear in subject, body, or sender.
					conditions.push(
						`(e.subject LIKE ? COLLATE NOCASE OR e.text LIKE ? COLLATE NOCASE OR e.content LIKE ? COLLATE NOCASE
						  OR e.name LIKE ? COLLATE NOCASE OR e.send_email LIKE ? COLLATE NOCASE)`
					);
					bindsAfterCursor.push(...Array(5).fill(`%${value}%`));
					keywordCount++;
			}
		}

		if (!scopedFolder) {
			conditions.push('e.is_del = ?');
			bindsAfterCursor.push(isDel.NORMAL);
		}

		if (!tokens.length) {
			return { list: [], total: 0, latestEmail: { emailId: 0, accountId, userId } };
		}

		const whereSql = conditions.join(' AND ');

		try {
			const { results } = await c.env.db.prepare(`
				SELECT e.*, s.star_id FROM email e
				LEFT JOIN star s ON s.email_id = e.email_id AND s.user_id = ?
				WHERE ${whereSql}
				ORDER BY e.email_id DESC LIMIT ?
			`).bind(userId, ...binds, ...bindsAfterCursor, size).all();

			const list = results.map(mapRawRow);
			return { list, total: list.length, latestEmail: list[0] || { emailId: 0, accountId, userId } };
		} catch (e) {
			console.error('search failed', e);
			return { list: [], total: 0, latestEmail: { emailId: 0, accountId, userId } };
		}
	},

};

// Same snake_case -> camelCase mapping as emailService.mapRawEmailRow, kept
// as its own small copy here rather than importing across service files for
// one helper — see that function's comment for why this mapping matters
// (frontend keys everything off `.emailId`).
function mapRawRow(row) {
	return {
		emailId: row.email_id, sendEmail: row.send_email, name: row.name, accountId: row.account_id,
		userId: row.user_id, subject: row.subject, code: row.code, text: row.text, content: row.content,
		cc: row.cc, bcc: row.bcc, recipient: row.recipient, toEmail: row.to_email, toName: row.to_name,
		inReplyTo: row.in_reply_to, relation: row.relation, messageId: row.message_id, type: row.type,
		status: row.status, resendEmailId: row.resend_email_id, message: row.message, unread: row.unread,
		createTime: row.create_time, isDel: row.is_del, isArchive: row.is_archive, isSpam: row.is_spam,
		deleteTime: row.delete_time, isStar: row.star_id != null ? 1 : 0,
	};
}

export default searchService;
