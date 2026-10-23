// Helpers for the inbound email() handler, kept pure so they can be tested
// without a real ForwardableEmailMessage.

// Collect the raw message as bytes. Decoding each chunk on its own corrupts
// any multi-byte UTF-8 character that straddles a chunk boundary, so the
// bytes are handed to the MIME parser whole and it decodes them once.
export async function readRaw(stream) {
	const reader = stream.getReader();
	const chunks = [];
	let size = 0;
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		chunks.push(value);
		size += value.byteLength;
	}
	const out = new Uint8Array(size);
	let offset = 0;
	for (const chunk of chunks) {
		out.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return out;
}

// Comma separated address settings: tolerate spaces and case differences.
export function splitAddressList(str) {
	if (!str) return [];
	return String(str).split(',').map(item => item.trim().toLowerCase()).filter(Boolean);
}

const NO_REPLY_SENDER = /^(no-?reply|do-?not-?reply|mailer-daemon|postmaster|bounces?)([+.\-_@]|$)/i;

function header(email, key) {
	const row = (email.headers || []).find(item => item.key?.toLowerCase() === key);
	return row ? String(row.value || '').trim().toLowerCase() : '';
}

// RFC 3834: never auto-reply to automated mail, bounces or mailing lists,
// or to ourselves. This is what keeps two auto-responders from looping.
export function shouldAutoReply(email, recipient) {
	const sender = String(email.from?.address || '').trim().toLowerCase();
	if (!sender || !sender.includes('@')) return false;
	if (sender === String(recipient || '').trim().toLowerCase()) return false;
	if (NO_REPLY_SENDER.test(sender)) return false;

	const autoSubmitted = header(email, 'auto-submitted');
	if (autoSubmitted && autoSubmitted !== 'no') return false;
	if (['bulk', 'list', 'junk', 'auto_reply'].includes(header(email, 'precedence'))) return false;
	if (header(email, 'list-id') || header(email, 'list-unsubscribe')) return false;
	if (header(email, 'x-autoreply') || header(email, 'x-autorespond') || header(email, 'x-auto-response-suppress')) return false;

	return true;
}

export function escapeHtml(str) {
	return String(str)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}
