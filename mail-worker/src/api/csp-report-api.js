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

app.post('/csp-report', async (c) => {
	try {
		const declared = Number(c.req.header('content-length') || 0);
		if (declared <= MAX_BYTES) {
			const text = (await c.req.text()).slice(0, MAX_BYTES);
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
