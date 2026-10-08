// Stored objects (inbound attachments, backgrounds) are served from the same
// origin as the app, and their Content-Type / Content-Disposition come from the
// sender's mail. Anything that a browser would render as active content
// (text/html, image/svg+xml, ...) must never be served inline, or opening the
// URL runs the sender's script with access to the app's storage.

const INLINE_SAFE = new Set([
	'image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp', 'image/avif',
	'image/bmp', 'image/x-icon', 'image/vnd.microsoft.icon',
	'video/mp4', 'video/webm', 'audio/mpeg', 'audio/ogg', 'audio/wav',
	'application/pdf',
]);

// Prefers the RFC 5987 filename* form (decoded), falls back to filename=.
function originalFilename(disposition) {
	let name = '';
	const ext = /filename\*\s*=\s*utf-8'[^']*'([^;]+)/i.exec(disposition);
	if (ext) {
		try { name = decodeURIComponent(ext[1].trim()); } catch { name = ext[1].trim(); }
	} else {
		const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(disposition);
		if (plain) name = plain[1].trim();
	}
	return name.replace(/[\u0000-\u001f"\\;\/]/g, '_');
}

// encodeURIComponent leaves ' ( ) * raw, which RFC 5987 does not allow.
function rfc5987(value) {
	return encodeURIComponent(value).replace(/['()*]/g, ch => '%' + ch.charCodeAt(0).toString(16).toUpperCase());
}

export function hardenObjectHeaders(headers) {
	const out = new Headers(headers);
	const type = (out.get('Content-Type') || '').split(';')[0].trim().toLowerCase();

	if (!INLINE_SAFE.has(type)) {
		out.set('Content-Type', 'application/octet-stream');
		// Force a download but keep the (sanitized) original filename.
		const name = originalFilename(out.get('Content-Disposition') || '');
		if (!name) {
			out.set('Content-Disposition', 'attachment');
		} else {
			const ascii = name.replace(/[^\x20-\x7e]/g, '_');
			out.set('Content-Disposition', `attachment; filename="${ascii}"; filename*=UTF-8''${rfc5987(name)}`);
		}
	}

	out.set('X-Content-Type-Options', 'nosniff');
	out.set('Content-Security-Policy', "sandbox; default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'");
	return out;
}

export function safeObjectResponse(obj) {
	if (obj instanceof Response) {
		return new Response(obj.body, { status: obj.status, headers: hardenObjectHeaders(obj.headers) });
	}

	const headers = new Headers();
	headers.set('Content-Type', obj.httpMetadata?.contentType || 'application/octet-stream');
	if (obj.httpMetadata?.contentDisposition) headers.set('Content-Disposition', obj.httpMetadata.contentDisposition);
	if (obj.httpMetadata?.cacheControl) headers.set('Cache-Control', obj.httpMetadata.cacheControl);
	return new Response(obj.body, { headers: hardenObjectHeaders(headers) });
}
