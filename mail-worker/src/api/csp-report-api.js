import app from '../hono/hono';
import { bump } from '../service/ops-metrics';

// Receiver for Content-Security-Policy-Report-Only violation reports (policy: mail-vue/public/_headers,
// commented out until enabled in a test environment). Public by necessity - browsers send reports
// without credentials - so it keeps nothing from the report body: it only counts, per directive
// name from a fixed list, in the aggregated ops metrics. URLs/sources are never stored (they can
// carry tokens or addresses). Always 204; the body is read with a hard size cap.
const DIRECTIVES = new Set(['script-src', 'style-src', 'img-src', 'font-src', 'connect-src', 'frame-src', 'worker-src', 'media-src', 'object-src', 'form-action', 'base-uri']);
const MAX_BYTES = 8 * 1024;

function directiveOf(report) {
	const raw = String(report?.['effective-directive'] || report?.effectiveDirective || report?.['violated-directive'] || '')
		.split(' ')[0].toLowerCase().replace(/-elem$|-attr$/, '');
	return DIRECTIVES.has(raw) ? raw : 'other';
}

// Reads at most MAX_BYTES from the request stream. Returns null when the body is larger (declared or
// actual), so a chunked / length-less upload can never be buffered whole in the isolate.
async function readLimited(request) {
	const declared = Number(request.headers.get('content-length') || 0);
	if (declared > MAX_BYTES) return null;
	if (!request.body) return '';
	const reader = request.body.getReader();
	const chunks = [];
	let size = 0;
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			size += value.byteLength;
			if (size > MAX_BYTES) {
				await reader.cancel();
				return null;
			}
			chunks.push(value);
		}
	} finally {
		reader.releaseLock?.();
	}
	const all = new Uint8Array(size);
	let offset = 0;
	for (const chunk of chunks) { all.set(chunk, offset); offset += chunk.byteLength; }
	return new TextDecoder().decode(all);
}

app.post('/csp-report', async (c) => {
	try {
		const text = await readLimited(c.req.raw);
		if (text) {
			const body = JSON.parse(text);
			// legacy {"csp-report": {...}} or Reporting API [{type, body}, ...]
			const reports = Array.isArray(body) ? body.map(r => r?.body) : [body?.['csp-report']];
			for (const report of reports.slice(0, 10)) {
				if (report) bump('csp.violation.' + directiveOf(report));
			}
		}
	} catch {} // malformed reports are ignored
	return c.body(null, 204);
});
