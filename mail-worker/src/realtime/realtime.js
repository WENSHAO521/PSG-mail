import jwtUtils from '../utils/jwt-utils';
import KvConst from '../const/kv-const';

// Real-time "new mail" hints over WebSocket (ported from upstream
// cloud-mail's MailHub, adapted): GET /api/realtime upgrades and is handed to
// the user's MailHub Durable Object; afterReceive calls notifyNewMail().
//
// The session JWT travels in the Sec-WebSocket-Protocol header
// (new WebSocket(url, ['psg-mail', token])), never in the URL, so it does not
// end up in access logs. Browsers can't read the HTTP status of a failed
// handshake, so a rejected socket is accepted and closed with 4401, which the
// client takes as "stop reconnecting".

export const REALTIME_PATH = '/api/realtime';
export const REALTIME_PROTOCOL = 'psg-mail';
const CLOSE_UNAUTHORIZED = 4401;

function protocolsOf(request) {
	return (request.headers.get('Sec-WebSocket-Protocol') || '')
		.split(',').map(item => item.trim()).filter(Boolean);
}

export function tokenFromProtocols(protocols) {
	if (protocols[0] !== REALTIME_PROTOCOL) return '';
	return protocols[1] || '';
}

// Same-host only: another site must not be able to open a socket with a
// stolen token. A missing Origin (non-browser client) is allowed; the token
// check still applies.
export function hasValidOrigin(request) {
	const origin = request.headers.get('Origin');
	if (!origin) return true;
	try {
		const originHost = new URL(origin).hostname;
		const reqHost = new URL(request.url).hostname;
		if (originHost === reqHost) return true;
		const local = host => host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
		return local(originHost) && local(reqHost);
	} catch {
		return false;
	}
}

// Same checks as the API's session check: valid signature and the session
// still listed in KV (signed-out or revoked sessions can't connect).
export async function realtimeUser(env, token) {
	if (!token) return null;
	const result = await jwtUtils.verifyToken({ env }, token);
	if (!result?.userId || !result?.token) return null;
	const authInfo = await env.kv.get(KvConst.AUTH_INFO + result.userId, { type: 'json' });
	if (!authInfo?.tokens?.includes(result.token)) return null;
	return { userId: result.userId };
}

function reject(protocol) {
	const pair = new WebSocketPair();
	pair[1].accept();
	pair[1].close(CLOSE_UNAUTHORIZED, 'Unauthorized');
	const headers = new Headers();
	if (protocol) headers.set('Sec-WebSocket-Protocol', protocol);
	return new Response(null, { status: 101, webSocket: pair[0], headers });
}

export async function handleRealtimeUpgrade(request, env) {
	if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
		return new Response('Expected WebSocket upgrade', { status: 426 });
	}
	if (!env.MAIL_HUB) {
		return new Response('Realtime unavailable', { status: 503 });
	}
	const protocols = protocolsOf(request);
	const protocol = protocols[0] === REALTIME_PROTOCOL ? REALTIME_PROTOCOL : '';
	if (!hasValidOrigin(request)) return reject(protocol);
	const user = await realtimeUser(env, tokenFromProtocols(protocols));
	if (!user) return reject(protocol);

	const stub = env.MAIL_HUB.get(env.MAIL_HUB.idFromName(String(user.userId)));
	const headers = new Headers(request.headers);
	// Never forward the token into the object; echo only the protocol name.
	headers.delete('Sec-WebSocket-Protocol');
	if (protocol) headers.set('X-Realtime-Protocol', protocol);
	return stub.fetch(new Request('https://mail-hub/connect', { headers }));
}

// Called once a mail is stored in a user's mailbox. Best effort: a failure
// here never affects receipt; the client's fallback poll catches up.
export async function notifyNewMail(env, { userId, accountId, emailId }) {
	if (!env?.MAIL_HUB || !userId || !emailId) return;
	try {
		await env.MAIL_HUB.get(env.MAIL_HUB.idFromName(String(userId))).notify({ type: 'new_mail', emailId, accountId: accountId || 0 });
	} catch (e) {
		console.error('realtime notify failed', e?.message || e);
	}
}
