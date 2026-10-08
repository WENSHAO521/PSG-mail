// Verifies a Resend (Svix) webhook signature. Enforced only when the
// `resend_webhook_secret` variable is configured, so existing deployments keep
// working until the secret is added.
const enc = new TextEncoder();

function b64ToBytes(b64) {
	return Uint8Array.from(atob(b64), ch => ch.charCodeAt(0));
}

export async function verifySvix(secret, headers, rawBody, toleranceSeconds = 300) {
	const id = headers.get('svix-id');
	const timestamp = headers.get('svix-timestamp');
	const sigHeader = headers.get('svix-signature');
	if (!id || !timestamp || !sigHeader) return false;

	const ts = Number(timestamp);
	if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > toleranceSeconds) return false;

	let key;
	try {
		key = await crypto.subtle.importKey('raw', b64ToBytes(secret.replace(/^whsec_/, '')),
			{ name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
	} catch {
		return false;
	}

	const data = enc.encode(`${id}.${timestamp}.${rawBody}`);
	for (const part of sigHeader.split(' ')) {
		const [version, sig] = part.split(',');
		if (version !== 'v1' || !sig) continue;
		try {
			if (await crypto.subtle.verify('HMAC', key, b64ToBytes(sig), data)) return true;
		} catch {}
	}
	return false;
}
