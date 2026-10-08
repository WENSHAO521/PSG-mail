import r2Service from '../service/r2-service';
import app from '../hono/hono';
import jwtUtils from '../utils/jwt-utils';
import constant from '../const/constant';
import sessionService from '../security/session-service';
import attachmentAccess, { accessMode, hardenObjectResponse, isProtectedKey, isSaneKey } from '../security/attachment-access';
import securityAuditService, { SecurityEvent } from '../service/security-audit-service';
import userContext from '../security/user-context';
import result from '../model/result';
import BizError from '../error/biz-error';
import { t } from '../i18n/i18n';

// Who is calling, if they sent a valid session JWT (fetch()-based downloads
// in the app do; <img>/<a href> can't, and use the signed query instead).
async function sessionUser(c) {
	const payload = await jwtUtils.verifyToken(c, c.req.header(constant.TOKEN_HEADER));
	if (!payload) return null;
	const info = await sessionService.read(c, payload.userId);
	return sessionService.isValid(info, payload.token) ? info.user : null;
}

// /oss/* is in security.js's `exclude` list (it must serve <img> tags that
// carry no Authorization header), so ALL access control happens here.
app.get('/oss/*', async (c) => {
	let key = c.req.path.split('/oss/')[1] || '';
	try { key = decodeURIComponent(key); } catch { return c.text('Bad Request', 400); }

	if (!isSaneKey(key)) {
		return c.text('Bad Request', 400);
	}

	if (isProtectedKey(key)) {
		const { exp, sig } = c.req.query();
		let allowed = !!sig && await attachmentAccess.verify(c, key, exp, sig);

		if (!allowed) {
			const user = await sessionUser(c);
			allowed = !!user && await attachmentAccess.canAccess(c, user, key);
		}

		if (!allowed) {
			if (accessMode(c) === 'enforce') {
				await securityAuditService.log(c, SecurityEvent.ATTACHMENT_DENIED, { detail: { key: key.slice(0, 40) } });
				return c.text('Forbidden', 403);
			}
			console.warn('[attachment-access] unsigned attachment request served in compat mode:', key.slice(0, 40));
		}
	}

	const obj = await r2Service.getObj(c, key);

	if (!obj) {
		return c.text('Not Found', 404);
	}

	// KV/S3 backends already return a fully-formed Response (correct
	// Content-Type/Content-Disposition) — only R2ObjectBody needs wrapping.
	const resp = obj instanceof Response ? obj : new Response(obj.body, {
		headers: {
			'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream',
			...(obj.httpMetadata?.contentDisposition ? { 'Content-Disposition': obj.httpMetadata.contentDisposition } : {})
		}
	});

	return hardenObjectResponse(resp, key);
});

// Exchange object keys for short-lived signed URLs. Only keys the caller can
// read are returned; the rest are silently omitted. Authenticated route
// (not under /oss, so security.js applies the normal JWT check).
app.post('/attachment/sign', async (c) => {
	const body = await c.req.json().catch(() => ({}));
	const keys = Array.isArray(body?.keys) ? body.keys.filter(k => isSaneKey(k) && isProtectedKey(k)).slice(0, 100) : null;
	if (!keys) throw new BizError(t('attAccessDenied'), 400);
	const user = userContext.getUser(c);
	const allowed = await attachmentAccess.filterAccessible(c, user, [...new Set(keys)]);
	const urls = {};
	for (const key of allowed) {
		urls[key] = `/oss/${key}?${await attachmentAccess.signedQuery(c, key)}`;
	}
	return c.json(result.ok(urls));
});
