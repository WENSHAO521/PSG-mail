// Real-time new-mail hints: /api/realtime WebSocket → MailHub Durable Object.
import { env, SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import jwtUtils from '../src/utils/jwt-utils';
import { notifyNewMail, hasValidOrigin, tokenFromProtocols } from '../src/realtime/realtime';

async function session(userId, sessionToken) {
	await env.kv.put('auth-uid:' + userId, JSON.stringify({ tokens: [sessionToken], user: { userId, email: `u${userId}@example.com` } }));
	return jwtUtils.generateToken({ env }, { userId, token: sessionToken });
}

function upgrade(protocols, origin = 'https://example.com') {
	const headers = { Upgrade: 'websocket', Origin: origin };
	if (protocols) headers['Sec-WebSocket-Protocol'] = protocols.join(', ');
	return SELF.fetch('https://example.com/api/realtime', { headers });
}

function nextMessage(ws) {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error('no message')), 3000);
		ws.addEventListener('message', (e) => { clearTimeout(timer); resolve(e.data); }, { once: true });
	});
}

function nextClose(ws) {
	return new Promise((resolve) => ws.addEventListener('close', (e) => resolve(e.code), { once: true }));
}

describe('realtime', () => {
	it('takes the token from the subprotocol list only when it starts with psg-mail', () => {
		expect(tokenFromProtocols(['psg-mail', 'abc'])).toBe('abc');
		expect(tokenFromProtocols(['other', 'abc'])).toBe('');
		expect(tokenFromProtocols([])).toBe('');
	});

	it('rejects foreign origins', () => {
		const req = (origin) => new Request('https://mail.example.com/api/realtime', { headers: origin ? { Origin: origin } : {} });
		expect(hasValidOrigin(req('https://mail.example.com'))).toBe(true);
		expect(hasValidOrigin(req('https://evil.example.net'))).toBe(false);
		expect(hasValidOrigin(req(null))).toBe(true);
	});

	it('closes with 4401 when the session is missing or revoked', async () => {
		const jwt = await jwtUtils.generateToken({ env }, { userId: 9101, token: 'gone' });
		const res = await upgrade(['psg-mail', jwt]);
		expect(res.status).toBe(101);
		expect(res.headers.get('Sec-WebSocket-Protocol')).toBe('psg-mail');
		const ws = res.webSocket;
		const closed = nextClose(ws);
		ws.accept();
		expect(await closed).toBe(4401);
	});

	it('delivers a new-mail hint to the user\'s open socket and answers ping', async () => {
		const jwt = await session(9102, 'live-token');
		const res = await upgrade(['psg-mail', jwt]);
		expect(res.status).toBe(101);
		expect(res.headers.get('Sec-WebSocket-Protocol')).toBe('psg-mail');
		const ws = res.webSocket;
		ws.accept();

		const pong = nextMessage(ws);
		ws.send('ping');
		expect(await pong).toBe('pong');

		const hint = nextMessage(ws);
		await notifyNewMail(env, { userId: 9102, accountId: 7, emailId: 55 });
		expect(JSON.parse(await hint)).toEqual({ type: 'new_mail', emailId: 55, accountId: 7 });

		// Another user's mail never reaches this socket.
		let leaked = false;
		ws.addEventListener('message', () => { leaked = true; });
		await notifyNewMail(env, { userId: 9103, accountId: 8, emailId: 56 });
		await new Promise(r => setTimeout(r, 200));
		expect(leaked).toBe(false);
		ws.close(1000);
	});

	it('refuses a non-WebSocket request', async () => {
		const res = await SELF.fetch('https://example.com/api/realtime');
		expect(res.status).toBe(426);
	});
});
