// Fixed-window failure counters in KV, for brute-force protection on
// password-checking endpoints (login, mailbox bind, public token).
//
// KV is eventually consistent across colos, so an attacker spreading guesses
// across many PoPs can get somewhat more than `limit` attempts per window —
// acceptable for the threat model (it still caps an online attack at a
// handful of guesses per minute instead of thousands). For stricter
// guarantees bind a Workers Rate Limiting binding as RATE_LIMITER; it is
// consulted first when present.

const PREFIX = 'rl:';

async function read(c, key) {
	const raw = await c.env.kv.get(PREFIX + key);
	return Number(raw || 0);
}

const rateLimit = {

	// true when `key` has hit `limit` failures in the current window.
	async isLimited(c, key, limit) {
		if (c.env.RATE_LIMITER?.limit) {
			try {
				const { success } = await c.env.RATE_LIMITER.limit({ key });
				if (!success) return true;
			} catch { /* fall through to KV counter */ }
		}
		return (await read(c, key)) >= limit;
	},

	async fail(c, key, windowSeconds) {
		const n = await read(c, key);
		// KV minimum TTL is 60s.
		await c.env.kv.put(PREFIX + key, String(n + 1), { expirationTtl: Math.max(60, windowSeconds) });
		return n + 1;
	},

	async reset(c, key) {
		await c.env.kv.delete(PREFIX + key);
	}
};

export default rateLimit;
