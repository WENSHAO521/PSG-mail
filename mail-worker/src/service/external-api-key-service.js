import orm from '../entity/orm';
import { externalApiKey } from '../entity/external-api-key';
import { and, eq, desc } from 'drizzle-orm';

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
	},

	// Returns the owning userId, or null if the key is missing/revoked.
	async verify(c, plaintextKey) {
		if (!plaintextKey) return null;
		const keyHash = await sha256Hex(plaintextKey);
		const row = await orm(c).select().from(externalApiKey)
			.where(and(eq(externalApiKey.keyHash, keyHash), eq(externalApiKey.status, 1)))
			.get();
		if (!row) return null;
		await orm(c).update(externalApiKey)
			.set({ lastUsedTime: new Date().toISOString() })
			.where(eq(externalApiKey.id, row.id))
			.run();
		return row.userId;
	}
};

export default externalApiKeyService;
