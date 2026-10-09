import kvCache, { TTL } from '../cache/kv-cache';
import orm from '../entity/orm';
import { externalApiKey } from '../entity/external-api-key';
import { and, eq, desc, or, isNull, lt } from 'drizzle-orm';

async function sha256Hex(str) {
	const data = new TextEncoder().encode(str);
	const hashBuffer = await crypto.subtle.digest('SHA-256', data);
	return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function randomToken() {
	const bytes = new Uint8Array(24);
	crypto.getRandomValues(bytes);
	const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
	return `cm_live_${hex}`;
}

const externalApiKeyService = {

	// Returns the plaintext token once — only the SHA-256 hash + a short
	// display prefix are persisted, matching how a real API key vendor would do it.
	async create(c, userId, name) {
		const token = randomToken();
		const keyHash = await sha256Hex(token);
		const keyPrefix = token.slice(0, 14);
		await orm(c).insert(externalApiKey).values({
			userId,
			name: name || '',
			keyHash,
			keyPrefix,
			status: 1
		}).run();
		return { token, keyPrefix };
	},

	list(c, userId) {
		return orm(c).select({
			id: externalApiKey.id,
			name: externalApiKey.name,
			keyPrefix: externalApiKey.keyPrefix,
			status: externalApiKey.status,
			lastUsedTime: externalApiKey.lastUsedTime,
			createTime: externalApiKey.createTime,
		}).from(externalApiKey)
			.where(eq(externalApiKey.userId, userId))
			.orderBy(desc(externalApiKey.id))
			.all();
	},

	async revoke(c, userId, id) {
		await orm(c).delete(externalApiKey)
			.where(and(eq(externalApiKey.id, Number(id)), eq(externalApiKey.userId, userId)))
			.run();
		// Other isolates drop their cached entry within TTL.AUTH (30 s).
	},

	// Returns the owning userId, or null if the key is missing/revoked.
	async verify(c, plaintextKey) {
		if (!plaintextKey) return null;
		const keyHash = await sha256Hex(plaintextKey);
		// Short isolate-local cache (same 30 s window as sessions): API clients poll, and each
		// call used to cost a D1 read. Only the hash is cached, never the key.
		const cacheKey = 'apikey:' + keyHash;
		const cached = kvCache.get(cacheKey);
		if (cached) return cached;
		const row = await orm(c).select().from(externalApiKey)
			.where(and(eq(externalApiKey.keyHash, keyHash), eq(externalApiKey.status, 1)))
			.get();
		if (!row) return null;
		// "Last used" is informational: write it at most every 10 minutes
		// instead of on every call (one D1 write per request adds up fast).
		// The cutoff is part of the UPDATE, so concurrent requests that all saw
		// a stale value still produce a single write.
		const last = row.lastUsedTime ? Date.parse(row.lastUsedTime) : 0;
		if (!(Date.now() - last < 10 * 60 * 1000)) {
			const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
			await orm(c).update(externalApiKey)
				.set({ lastUsedTime: new Date().toISOString() })
				.where(and(
					eq(externalApiKey.id, row.id),
					or(isNull(externalApiKey.lastUsedTime), lt(externalApiKey.lastUsedTime, cutoff))
				))
				.run();
		}
		kvCache.set(cacheKey, row.userId, TTL.AUTH);
		return row.userId;
	}
};

export default externalApiKeyService;
