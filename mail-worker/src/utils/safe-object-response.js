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

export function hardenObjectHeaders(headers) {
	const out = new Headers(headers);
	const type = (out.get('Content-Type') || '').split(';')[0].trim().toLowerCase();

	if (!INLINE_SAFE.has(type)) {
		out.set('Content-Type', 'application/octet-stream');
		out.set('Content-Disposition', 'attachment');
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
