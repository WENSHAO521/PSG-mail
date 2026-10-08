import PostalMime from 'postal-mime';
import r2Service from './r2-service';
import constant from '../const/constant';
import fileUtils from '../utils/file-utils';
import { emailConst, isDel } from '../const/entity-const';
import BizError from '../error/biz-error';
import receiveGuardService from './receive-guard-service';

// One RFC 5322 / MIME implementation for every .eml this app produces
// (single-mail export, cloud backup) and the matching importer used for
// restore. 3.x had two diverging generators: the export one wrote Cc as
// "[object Object]" and dropped inline images; the backup one declared
// quoted-printable but wrote raw HTML and carried no attachments at all.
//
// Structure produced:
//   multipart/mixed
//   ├─ multipart/related
//   │  ├─ multipart/alternative (text/plain, text/html)
//   │  └─ inline images (Content-ID, referenced as cid: from the HTML)
//   └─ attachments

const MAX_EML_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const MAX_IMPORT_BYTES = 25 * 1024 * 1024;

function bytesToBase64(buf) {
	const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
	let binary = '';
	for (let i = 0; i < bytes.length; i += 0x8000) {
		binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	}
	return btoa(binary);
}

const utf8Base64 = (str) => bytesToBase64(new TextEncoder().encode(String(str ?? '')));
const wrap76 = (b64) => b64.replace(/(.{76})/g, '$1\r\n');

// CR/LF stripped so untrusted values can't inject header lines.
export function headerSafe(v) {
	return String(v ?? '').replace(/[\r\n]+/g, ' ').trim();
}

export function encodeWord(str) {
	const s = headerSafe(str);
	return /^[\x20-\x7E]*$/.test(s) ? s : `=?UTF-8?B?${utf8Base64(s)}?=`;
}

function formatAddress(addr) {
	if (!addr) return '';
	if (typeof addr === 'string') return headerSafe(addr);
	const email = headerSafe(addr.address || addr.email || '');
	if (!email) return '';
	const name = headerSafe(addr.name || '').replace(/"/g, '');
	return name ? `${encodeWord(name).startsWith('=?') ? encodeWord(name) : `"${name}"`} <${email}>` : email;
}

function parseList(json) {
	if (Array.isArray(json)) return json;
	try {
		const v = JSON.parse(json || '[]');
		return Array.isArray(v) ? v : [];
	} catch {
		return [];
	}
}

function boundary(tag, id) {
	return `psg_${tag}_${id}_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

function rfc2822Date(createTime) {
	if (!createTime) return new Date().toUTCString().replace('GMT', '+0000');
	const iso = String(createTime).includes('T') ? String(createTime) : String(createTime).replace(' ', 'T') + 'Z';
	const d = new Date(iso);
	return (isNaN(d) ? new Date() : d).toUTCString().replace('GMT', '+0000');
}

// Accepts drizzle (camelCase) or raw D1 (snake_case) email rows.
function normalizeRow(row) {
	const pick = (camel, snake) => row[camel] ?? row[snake];
	return {
		emailId: pick('emailId', 'email_id'),
		sendEmail: pick('sendEmail', 'send_email'),
		name: row.name,
		toEmail: pick('toEmail', 'to_email'),
		toName: pick('toName', 'to_name'),
		recipient: row.recipient,
		cc: row.cc,
		subject: row.subject,
		text: row.text,
		content: row.content,
		messageId: pick('messageId', 'message_id'),
		inReplyTo: pick('inReplyTo', 'in_reply_to'),
		relation: row.relation,
		createTime: pick('createTime', 'create_time'),
	};
}

export function safeEmlFilename(row) {
	const r = normalizeRow(row);
	const date = r.createTime ? String(r.createTime).slice(0, 10) : 'unknown';
	const subject = (r.subject || 'no-subject').replace(/[\\/:*?"<>|\r\n]/g, '_').slice(0, 60);
	return `${date}_${subject}_${r.emailId}.eml`;
}

const emlService = {

	async attachmentsOf(c, emailId) {
		const { results } = await c.env.db.prepare(
			`SELECT key, filename, mime_type AS mimeType, size, type, content_id AS contentId
			 FROM attachments WHERE email_id = ? ORDER BY att_id`
		).bind(emailId).all();
		return results;
	},

	// Build a complete .eml for an (already authorized) email row.
	async build(c, rawRow, { includeAttachments = true } = {}) {
		const row = normalizeRow(rawRow);
		const atts = includeAttachments ? await this.attachmentsOf(c, row.emailId) : [];

		const to = parseList(row.recipient);
		const toHeader = (to.length ? to : [{ address: row.toEmail, name: row.toName }]).map(formatAddress).filter(Boolean).join(', ');
		const ccHeader = parseList(row.cc).map(formatAddress).filter(Boolean).join(', ');
		const senderDomain = String(row.sendEmail || '').split('@')[1] || 'psg-mail.local';

		const headers = [
			`From: ${formatAddress({ address: row.sendEmail || 'unknown@unknown', name: row.name })}`,
			toHeader ? `To: ${toHeader}` : null,
			ccHeader ? `Cc: ${ccHeader}` : null,
			`Subject: ${encodeWord(row.subject || '(no subject)')}`,
			`Date: ${rfc2822Date(row.createTime)}`,
			`Message-ID: ${headerSafe(row.messageId) || `<psg-${row.emailId}@${senderDomain}>`}`,
			row.inReplyTo ? `In-Reply-To: ${headerSafe(row.inReplyTo)}` : null,
			row.relation ? `References: ${headerSafe(row.relation)}` : null,
			`X-PSG-Mail-Id: ${Number(row.emailId) || 0}`,
			'MIME-Version: 1.0',
		].filter(Boolean);

		// Split into inline (has a Content-ID) and regular attachments; load
		// object bytes within an overall size budget.
		const inline = [];
		const regular = [];
		const omitted = [];
		let budget = MAX_EML_ATTACHMENT_BYTES;
		for (const a of atts) {
			if ((a.size || 0) > budget) { omitted.push(a.filename || a.key); continue; }
			let bytes = null;
			try {
				const obj = await r2Service.getObj(c, a.key);
				if (obj) bytes = new Uint8Array(obj instanceof ArrayBuffer ? obj : await obj.arrayBuffer());
			} catch (e) {
				console.error('eml: attachment read failed', a.key, e?.message);
			}
			if (!bytes) { omitted.push(a.filename || a.key); continue; }
			budget -= bytes.length;
			const entry = { ...a, bytes, cid: a.contentId ? String(a.contentId).replace(/^<|>$/g, '') : null };
			(entry.cid ? inline : regular).push(entry);
		}
		if (omitted.length) headers.push(`X-PSG-Omitted-Attachments: ${encodeWord(omitted.join(', '))}`);

		// Inline images are stored as "{{domain}}attachments/<key>" (optionally
		// with a signed query) — point them back at their MIME part.
		let html = row.content || '';
		for (const img of inline) {
			const re = new RegExp(`\\{\\{domain\\}\\}${img.key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\?[^"'\\s>]*)?`, 'g');
			html = html.replace(re, `cid:${img.cid}`);
		}

		const bAlt = boundary('alt', row.emailId);
		const alternative = [
			`Content-Type: multipart/alternative; boundary="${bAlt}"`,
			'',
			`--${bAlt}`,
			'Content-Type: text/plain; charset=UTF-8',
			'Content-Transfer-Encoding: base64',
			'',
			wrap76(utf8Base64(row.text || '')),
			`--${bAlt}`,
			'Content-Type: text/html; charset=UTF-8',
			'Content-Transfer-Encoding: base64',
			'',
			wrap76(utf8Base64(html || row.text || '')),
			`--${bAlt}--`,
		];

		const part = (a, disposition) => {
			const mime = headerSafe(a.mimeType || 'application/octet-stream');
			const name = headerSafe(a.filename || 'attachment').replace(/"/g, '');
			const encName = encodeWord(name);
			return [
				`Content-Type: ${mime}; name="${encName}"`,
				'Content-Transfer-Encoding: base64',
				`Content-Disposition: ${disposition}; filename="${encName}"`,
				...(a.cid ? [`Content-ID: <${headerSafe(a.cid)}>`] : []),
				'',
				wrap76(bytesToBase64(a.bytes)),
			];
		};

		let body = alternative;
		if (inline.length) {
			const bRel = boundary('rel', row.emailId);
			body = [
				`Content-Type: multipart/related; boundary="${bRel}"`,
				'',
				`--${bRel}`,
				...alternative,
				...inline.flatMap(a => [`--${bRel}`, ...part(a, 'inline')]),
				`--${bRel}--`,
			];
		}
		if (regular.length) {
			const bMix = boundary('mix', row.emailId);
			body = [
				`Content-Type: multipart/mixed; boundary="${bMix}"`,
				'',
				`--${bMix}`,
				...body,
				...regular.flatMap(a => [`--${bMix}`, ...part(a, 'attachment')]),
				`--${bMix}--`,
			];
		}

		return headers.concat(body).join('\r\n') + '\r\n';
	},

	// Restore: import one .eml into a mailbox the caller owns or shares.
	// Idempotent per mailbox + Message-ID (shares the receive dedup table, so
	// importing a mail that was already received is a no-op). Returns an
	// integrity summary the caller can compare with the source file.
	async import(c, { userId, accountRow, rawBytes, asType }) {
		if (!rawBytes?.length) throw new BizError('empty .eml', 400);
		if (rawBytes.length > MAX_IMPORT_BYTES) throw new BizError('.eml too large (max 25MB)', 413);

		const parsed = await PostalMime.parse(rawBytes);
		const dedupKey = await receiveGuardService.dedupKey(accountRow.email, parsed.messageId, rawBytes);
		const existing = await receiveGuardService.findDuplicate(c, dedupKey);
		if (existing) {
			return { duplicate: true, emailId: existing };
		}

		const fromAddr = String(parsed.from?.address || '').toLowerCase();
		const type = asType ?? (fromAddr === String(accountRow.email).toLowerCase() ? emailConst.type.SEND : emailConst.type.RECEIVE);

		const attachments = [];
		for (const item of parsed.attachments || []) {
			const bytes = item.content instanceof ArrayBuffer ? new Uint8Array(item.content) : item.content;
			attachments.push({
				...item,
				content: bytes,
				key: constant.ATTACHMENT_PREFIX + await fileUtils.getBuffHash(bytes) + fileUtils.getExtFileName(item.filename),
				size: bytes.byteLength ?? bytes.length,
			});
		}

		// Same HTML rewrite the live receive path uses (cid: → {{domain}}key).
		const { default: emailService } = await import('./email-service');
		const { default: attService } = await import('./att-service');
		const params = {
			toEmail: accountRow.email,
			toName: '',
			sendEmail: parsed.from?.address || '',
			name: parsed.from?.name || '',
			subject: parsed.subject || '',
			content: parsed.html || '',
			text: parsed.text || '',
			cc: JSON.stringify(parsed.cc || []),
			bcc: JSON.stringify(parsed.bcc || []),
			recipient: JSON.stringify(parsed.to || []),
			inReplyTo: parsed.inReplyTo || '',
			relation: parsed.references || '',
			messageId: parsed.messageId || '',
			userId: accountRow.userId,
			accountId: accountRow.accountId,
			type,
			status: type === emailConst.type.SEND ? emailConst.status.SENT : emailConst.status.RECEIVE,
			unread: emailConst.unread.READ,
			isDel: isDel.NORMAL,
		};
		if (parsed.date) {
			const d = new Date(parsed.date);
			if (!isNaN(d)) params.createTime = d.toISOString().replace('T', ' ').slice(0, 19);
		}

		const row = await emailService.receive(c, params, attachments.filter(a => a.contentId), '');
		await receiveGuardService.remember(c, dedupKey, row.emailId);

		if (attachments.length) {
			for (const a of attachments) {
				a.emailId = row.emailId;
				a.userId = accountRow.userId;
				a.accountId = accountRow.accountId;
			}
			await attService.addAtt(c, attachments);
		}

		return {
			duplicate: false,
			emailId: row.emailId,
			importedBy: userId,
			subject: params.subject,
			messageId: params.messageId,
			attachments: attachments.map(a => ({ filename: a.filename, size: a.size, key: a.key })),
		};
	}
};

export default emlService;
