// Inbound-mail safety rails used by src/email/email.js:
//
//  1. Idempotent receive. Email Routing re-delivers a message when the
//     handler throws, and remote MTAs occasionally resend; 3.x stored a
//     second copy each time. The dedup key is per RECIPIENT mailbox plus the
//     Message-ID — the same Message-ID legitimately arrives once for every
//     local recipient of a multi-recipient mail, and each of them must get
//     their copy. Messages without a Message-ID fall back to a hash of the
//     raw bytes. Fails open: any error here means "not a duplicate", never
//     a lost mail. Disable with RECEIVE_DEDUP=false.
//
//  2. Auto-reply loop protection (RFC 3834 §2): never auto-reply to
//     auto-generated mail, mailing lists, bounces, or the same sender more
//     than once per window.

const DEDUP_RETENTION_DAYS = 30;
const AUTO_REPLY_WINDOW_SECONDS = 24 * 3600;

async function sha256Hex(data) {
	const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
	const digest = await crypto.subtle.digest('SHA-256', bytes);
	return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function normalizeMessageId(id) {
	if (!id) return '';
	return String(id).trim().replace(/^<|>$/g, '').toLowerCase();
}

function header(headers, name) {
	const h = (headers || []).find(x => x.key?.toLowerCase() === name);
	return h ? String(h.value || '') : '';
}

const receiveGuardService = {

	enabled(env) {
		return String(env.RECEIVE_DEDUP) !== 'false';
	},

	async dedupKey(recipient, messageId, rawBytes) {
		const to = String(recipient || '').trim().toLowerCase();
		const mid = normalizeMessageId(messageId);
		if (mid) return 'mid:' + await sha256Hex(`${to}\n${mid}`);
		return 'raw:' + await sha256Hex(`${to}\n${await sha256Hex(rawBytes)}`);
	},

	// Returns the emailId already stored for this key, or 0.
	async findDuplicate(c, key) {
		try {
			const row = await c.env.db.prepare('SELECT email_id FROM email_receive_dedup WHERE dedup_key = ?').bind(key).first();
			return row?.email_id || 0;
		} catch (e) {
			console.warn('receive dedup lookup skipped:', e?.message);
			return 0;
		}
	},

	async remember(c, key, emailId) {
		try {
			await c.env.db.prepare(
				'INSERT INTO email_receive_dedup (dedup_key, email_id) VALUES (?, ?) ON CONFLICT(dedup_key) DO NOTHING'
			).bind(key, emailId).run();
		} catch (e) {
			console.warn('receive dedup write skipped:', e?.message);
		}
	},

	async prune(c) {
		try {
			await c.env.db.prepare(`DELETE FROM email_receive_dedup WHERE create_time < datetime('now', ?)`)
				.bind(`-${DEDUP_RETENTION_DAYS} days`).run();
		} catch (e) {
			console.warn('receive dedup prune skipped:', e?.message);
		}
	},

	// RFC 3834 — returns a reason string when an auto-reply must NOT be sent.
	autoReplyBlockReason(parsed, recipient) {
		const headers = parsed?.headers || [];
		const from = String(parsed?.from?.address || '').toLowerCase();
		const local = from.split('@')[0];

		if (!from) return 'no_sender';
		if (from === String(recipient || '').toLowerCase()) return 'self';

		const autoSubmitted = header(headers, 'auto-submitted').trim().toLowerCase();
		if (autoSubmitted && autoSubmitted !== 'no') return 'auto_submitted';

		const precedence = header(headers, 'precedence').trim().toLowerCase();
		if (['bulk', 'list', 'junk', 'auto_reply'].includes(precedence)) return 'precedence';

		if (header(headers, 'list-id') || header(headers, 'list-unsubscribe') || header(headers, 'list-post')) return 'mailing_list';
		if (header(headers, 'x-autoreply') || header(headers, 'x-autorespond') || header(headers, 'x-auto-response-suppress')) return 'auto_responder';
		if (/^(mailer-daemon|postmaster|no-?reply|do-?not-?reply|bounces?)$/.test(local) || local.startsWith('bounce')) return 'system_sender';

		const returnPath = header(headers, 'return-path').trim();
		if (returnPath === '<>') return 'null_return_path';

		const contentType = header(headers, 'content-type').toLowerCase();
		if (contentType.includes('multipart/report')) return 'delivery_report';

		return null;
	},

	// One auto-reply per (user, sender) per window. true = allowed now.
	async takeAutoReplySlot(c, userId, sender) {
		const key = `auto_reply_sent:${userId}:${String(sender).toLowerCase()}`;
		if (await c.env.kv.get(key)) return false;
		await c.env.kv.put(key, '1', { expirationTtl: AUTO_REPLY_WINDOW_SECONDS });
		return true;
	}
};

export default receiveGuardService;
