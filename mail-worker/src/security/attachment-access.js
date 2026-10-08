import constant from '../const/constant';

// Access control for stored objects served by the Worker (GET /oss/<key>,
// and the legacy root paths /attachments/<key> and /static/<key>).
//
// 3.x served every key to anyone. Attachment keys are content hashes
// (attachments/<sha256>.<ext>) — unguessable, but they leak through
// forwarded HTML, logs, shared screenshots, and the hash itself is a
// "do you have this exact file" oracle. Now:
//
//   static/...       public (login background etc.), unchanged
//   attachments/...  needs EITHER a short-lived HMAC signature issued by the
//                    server to a user who can read the owning email
//                    (?exp=<unix>&sig=<b64url>), OR an Authorization JWT
//                    whose user can read it.
//
// ATTACHMENT_ACCESS_MODE:
//   compat  (default) — signed URLs are issued and accepted; unsigned
//           requests are still served but logged, so old desktop/Android
//           builds and cached mail keep rendering during rollout.
//   enforce — unsigned, unauthorized requests get 403.
// Note: a public bucket domain (setting r2Domain) bypasses the Worker
// entirely and therefore this check; clear it to get enforcement.

const encoder = new TextEncoder();
const DEFAULT_TTL = 24 * 3600;
const BUCKET = 3600; // round expiry up to the hour so URLs are cache-stable
const MAX_TTL = 7 * 24 * 3600;

let cachedKey = null;
let cachedFor = null;

function b64url(bytes) {
	let s = '';
	for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
	return btoa(s).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function hmacKey(c) {
	const secret = c.env.ATTACHMENT_URL_SECRET || c.env.jwt_secret;
	if (!secret) throw new Error('no secret configured for attachment URL signing');
	if (cachedKey && cachedFor === secret) return cachedKey;
	// Domain-separated sub-key so an attachment signature can never be
	// confused with (or used to derive) a JWT signature.
	const base = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
	const derived = await crypto.subtle.sign('HMAC', base, encoder.encode('psg-mail/attachment-url/v1'));
	cachedKey = await crypto.subtle.importKey('raw', derived, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
	cachedFor = secret;
	return cachedKey;
}

function payload(key, exp) {
	return `att:v1:${key}:${exp}`;
}

export function accessMode(c) {
	return String(c.env.ATTACHMENT_ACCESS_MODE || 'compat').toLowerCase() === 'enforce' ? 'enforce' : 'compat';
}

export function isProtectedKey(key) {
	return typeof key === 'string' && key.startsWith(constant.ATTACHMENT_PREFIX);
}

// Reject traversal / odd keys before they reach any storage backend.
export function isSaneKey(key) {
	return typeof key === 'string'
		&& key.length > 0 && key.length < 512
		&& !key.includes('..') && !key.startsWith('/') && !key.includes('\\')
		&& !/[\u0000-\u001f]/.test(key);
}

function ttlOf(c) {
	const n = Number(c.env.ATTACHMENT_URL_TTL);
	return Number.isFinite(n) && n >= 300 ? Math.min(n, MAX_TTL) : DEFAULT_TTL;
}

const attachmentAccess = {

	async sign(c, key, now = Math.floor(Date.now() / 1000)) {
		const exp = Math.ceil((now + ttlOf(c)) / BUCKET) * BUCKET;
		const sig = await crypto.subtle.sign('HMAC', await hmacKey(c), encoder.encode(payload(key, exp)));
		return { exp, sig: b64url(sig) };
	},

	async signedQuery(c, key) {
		const { exp, sig } = await this.sign(c, key);
		return `exp=${exp}&sig=${sig}`;
	},

	async verify(c, key, exp, sig, now = Math.floor(Date.now() / 1000)) {
		const expNum = Number(exp);
		if (!sig || !Number.isInteger(expNum) || expNum < now || expNum > now + MAX_TTL + BUCKET) return false;
		const expected = await crypto.subtle.sign('HMAC', await hmacKey(c), encoder.encode(payload(key, expNum)));
		const a = b64url(expected);
		if (a.length !== sig.length) return false;
		let diff = 0;
		for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ sig.charCodeAt(i);
		return diff === 0;
	},

	// Can `userId` read some email that references this object key? Same
	// ownership rule as the email list APIs: own mail, or mail in a mailbox
	// shared with the user via account_share. The deployment admin can read
	// everything (they already can via /allEmail).
	async canAccess(c, user, key) {
		if (!user?.userId) return false;
		if (user.email && user.email === c.env.admin) return true;
		const row = await c.env.db.prepare(
			`SELECT 1 AS ok FROM attachments a
			 LEFT JOIN email e ON e.email_id = a.email_id
			 WHERE a.key = ?
			   AND (a.user_id = ?
			        OR e.user_id = ?
			        OR e.account_id IN (SELECT account_id FROM account_share WHERE user_id = ?))
			 LIMIT 1`
		).bind(key, user.userId, user.userId, user.userId).first();
		return !!row;
	},

	// Which of `keys` the user may reference (e.g. embed into an outgoing
	// mail). Used to stop "send me someone else's attachment by key".
	async filterAccessible(c, user, keys) {
		const out = [];
		for (const key of keys) {
			if (await this.canAccess(c, user, key)) out.push(key);
		}
		return out;
	},

	// Adds `url` (signed, relative) to every attachment row and signs the
	// `{{domain}}attachments/<key>` inline-image references in the HTML body,
	// in place. Callers have already authorized the rows.
	async decorateEmails(c, list) {
		for (const row of list) {
			if (Array.isArray(row.attList)) {
				for (const att of row.attList) {
					if (isProtectedKey(att.key)) {
						att.url = `/oss/${att.key}?${await this.signedQuery(c, att.key)}`;
					}
				}
			}
			if (typeof row.content === 'string' && row.content.includes('{{domain}}' + constant.ATTACHMENT_PREFIX)) {
				row.content = await signInlineRefs(c, row.content);
			}
		}
	}
};

const INLINE_RE = /\{\{domain\}\}(attachments\/[A-Za-z0-9._-]+)(\?[^"'\s>]*)?/g;

async function signInlineRefs(c, html) {
	const keys = new Set();
	for (const m of html.matchAll(INLINE_RE)) keys.add(m[1]);
	const q = new Map();
	for (const k of keys) q.set(k, await attachmentAccess.signedQuery(c, k));
	return html.replace(INLINE_RE, (_, key) => `{{domain}}${key}?${q.get(key)}`);
}

// Headers that make a stored object safe to serve from the app's own
// origin: no MIME sniffing, no script execution, and anything that isn't a
// plain raster image is forced to download instead of rendering (an
// attached .html/.svg would otherwise run with access to the user's token
// in localStorage).
const INLINE_SAFE = /^image\/(png|jpe?g|gif|webp|bmp|avif|x-icon|vnd\.microsoft\.icon)$/i;

export function hardenObjectResponse(resp, key) {
	const headers = new Headers(resp.headers);
	const type = (headers.get('Content-Type') || 'application/octet-stream').split(';')[0].trim();
	headers.set('X-Content-Type-Options', 'nosniff');
	headers.set('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox");
	headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
	if (!INLINE_SAFE.test(type)) {
		const existing = headers.get('Content-Disposition') || '';
		const filename = existing.match(/filename\*?=([^;]+)/i)?.[1]?.trim()
			|| encodeURIComponent(key.split('/').pop() || 'file');
		headers.set('Content-Disposition', `attachment; filename=${filename}`);
	}
	if (isProtectedKey(key)) {
		headers.set('Cache-Control', 'private, max-age=3600');
	}
	headers.delete('Set-Cookie');
	return new Response(resp.body, { status: resp.status, headers });
}

export default attachmentAccess;
