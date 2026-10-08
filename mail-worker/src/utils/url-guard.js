// Outbound URL guard for user/admin supplied callback targets (web-push endpoints, webhooks).
// Workers cannot reach private networks, but the guard still refuses literals and
// internal-looking names so a stored URL can never aim the Worker (or its VAPID /
// Authorization headers) at loopback, metadata or credentialed targets.
const BLOCKED_SUFFIXES = ['.local', '.localhost', '.internal', '.lan', '.home', '.corp', '.intranet'];

function isIpLiteral(host) {
	if (host.startsWith('[') || host.includes(':')) return true; // IPv6
	return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || /^(0x[0-9a-f]+|\d+)$/i.test(host); // dotted / decimal / hex IPv4
}

export function isSafeOutboundUrl(value, { allowHttp = false, httpsPorts = [''], } = {}) {
	if (typeof value !== 'string' || value.length > 2048) return false;
	let url;
	try {
		url = new URL(value);
	} catch {
		return false;
	}
	if (url.protocol !== 'https:' && !(allowHttp && url.protocol === 'http:')) return false;
	if (url.username || url.password) return false;
	const host = url.hostname.toLowerCase().replace(/\.$/, '');
	if (!host.includes('.') || isIpLiteral(host)) return false;
	if (host === 'localhost' || BLOCKED_SUFFIXES.some(s => host.endsWith(s))) return false;
	if (!allowHttp && !httpsPorts.includes(url.port)) return false;
	return true;
}
