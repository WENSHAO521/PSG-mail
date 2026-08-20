// Constant-time string comparison for secret checks (bootstrap /init,
// /reset-admin) that authenticate via a shared secret instead of a normal
// JWT — a plain `===`/`!==` short-circuits on the first differing byte,
// which leaks timing information an attacker can use to guess the secret
// one byte at a time. Not a hot path (these are rarely-invoked bootstrap/
// recovery endpoints), but cheap to do correctly.
//
// The length check below does leak the secret's LENGTH via early-return
// timing — an accepted, standard tradeoff (Node's own `crypto.timingSafeEqual`
// throws outright on a length mismatch rather than comparing at all).
// Leaking length is far less exploitable than leaking content byte-by-byte.
export function timingSafeEqual(a, b) {
	const encoder = new TextEncoder();
	const aBytes = encoder.encode(String(a ?? ''));
	const bBytes = encoder.encode(String(b ?? ''));
	if (aBytes.length !== bBytes.length) return false;

	let diff = 0;
	for (let i = 0; i < aBytes.length; i++) {
		diff |= aBytes[i] ^ bBytes[i];
	}
	return diff === 0;
}

export default timingSafeEqual;
