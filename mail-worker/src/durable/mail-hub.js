import { DurableObject } from 'cloudflare:workers';

// One instance per user (named by userId). Open tabs hold a WebSocket here
// and get a one-line "new mail" hint the moment a mail is stored, so the
// app no longer has to poll /email/latest every 30 seconds to find out.
//
// Free-plan notes: this is a SQLite-backed class (the only kind the free
// plan allows) and uses the Hibernation API, so an idle connection costs
// no duration: the object is evicted from memory while the sockets stay
// open. The client's keep-alive "ping" is answered by the runtime itself
// (setWebSocketAutoResponse) without waking the object.
export class MailHub extends DurableObject {

	constructor(ctx, env) {
		super(ctx, env);
		ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
	}

	async fetch(request) {
		if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
			return new Response('Expected WebSocket upgrade', { status: 426 });
		}
		const pair = new WebSocketPair();
		this.ctx.acceptWebSocket(pair[1]);
		const headers = new Headers();
		const protocol = request.headers.get('X-Realtime-Protocol');
		if (protocol) headers.set('Sec-WebSocket-Protocol', protocol);
		return new Response(null, { status: 101, webSocket: pair[0], headers });
	}

	// RPC from the Worker after a mail is stored. Sending is not billed.
	async notify(payload) {
		const message = JSON.stringify(payload);
		for (const socket of this.ctx.getWebSockets()) {
			try {
				socket.send(message);
			} catch {
				try { socket.close(1011, 'Delivery failed'); } catch {}
			}
		}
	}

	// Clients only ever send the auto-answered ping; ignore anything else.
	async webSocketMessage() {}

	async webSocketClose(socket, code) {
		// close() only accepts 1000 or 3000-4999; 1005/1006 come from the peer.
		const reply = code >= 3000 && code <= 4999 ? code : 1000;
		try { socket.close(reply, 'Closing'); } catch {}
	}

	async webSocketError(socket) {
		try { socket.close(1011, 'Error'); } catch {}
	}
}
