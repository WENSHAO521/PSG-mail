import KvConst from '../const/kv-const';
import constant from '../const/constant';
import kvCache, { TTL } from '../cache/kv-cache';
import reqUtils from '../utils/req-utils';

// Per-device session bookkeeping on top of the existing `authInfo.tokens` list.
// `authInfo.sessions` maps token -> metadata; sessions created before this existed have
// no entry and are listed as "unknown device". The token itself is never returned to
// clients: a session is addressed by a short hash.
async function sessionId(token) {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('psg-session:' + token));
	return Array.from(new Uint8Array(digest)).slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function load(c, userId) {
	return await c.env.kv.get(KvConst.AUTH_INFO + userId, { type: 'json' });
}

async function save(c, userId, authInfo) {
	const key = KvConst.AUTH_INFO + userId;
	await c.env.kv.put(key, JSON.stringify(authInfo), { expirationTtl: constant.TOKEN_EXPIRE });
	kvCache.set(key, authInfo, TTL.AUTH);
}

const sessionService = {

	sessionId,

	// Called by login with the in-memory authInfo before it is saved.
	remember(c, authInfo, token) {
		const { os, browser, device } = reqUtils.getUserAgent(c);
		authInfo.sessions = authInfo.sessions || {};
		authInfo.sessions[token] = {
			ip: reqUtils.getIp(c),
			os, browser, device,
			createTime: new Date().toISOString()
		};
		// Drop metadata of tokens that are no longer valid.
		for (const key of Object.keys(authInfo.sessions)) {
			if (!authInfo.tokens.includes(key)) delete authInfo.sessions[key];
		}
	},

	async list(c, userId, currentToken) {
		const authInfo = await load(c, userId);
		if (!authInfo) return [];
		return await Promise.all(authInfo.tokens.map(async token => {
			const meta = authInfo.sessions?.[token] || {};
			return {
				id: await sessionId(token),
				current: token === currentToken,
				ip: meta.ip || '',
				os: meta.os || '',
				browser: meta.browser || '',
				device: meta.device || '',
				createTime: meta.createTime || null
			};
		}));
	},

	// Revoke one session by its id. Returns false when nothing matched.
	async revoke(c, userId, id) {
		const authInfo = await load(c, userId);
		if (!authInfo) return false;
		const ids = await Promise.all(authInfo.tokens.map(sessionId));
		const index = ids.indexOf(String(id));
		if (index < 0) return false;
		const [token] = authInfo.tokens.splice(index, 1);
		if (authInfo.sessions) delete authInfo.sessions[token];
		await save(c, userId, authInfo);
		return true;
	},

	// Keep only `keepToken` (sign out every other device); no keepToken signs out everywhere.
	async revokeOthers(c, userId, keepToken) {
		const authInfo = await load(c, userId);
		if (!authInfo) return 0;
		const before = authInfo.tokens.length;
		authInfo.tokens = keepToken && authInfo.tokens.includes(keepToken) ? [keepToken] : [];
		authInfo.sessions = Object.fromEntries(Object.entries(authInfo.sessions || {}).filter(([t]) => authInfo.tokens.includes(t)));
		await save(c, userId, authInfo);
		return before - authInfo.tokens.length;
	}
};

export default sessionService;
