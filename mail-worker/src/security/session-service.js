import KvConst from '../const/kv-const';
import constant from '../const/constant';
import kvCache, { TTL } from '../cache/kv-cache';
import reqUtils from '../utils/req-utils';
import dayjs from 'dayjs';

// Server-side session store, KV key `auth-uid:<userId>`.
//
// Shape (backward compatible with 3.x, which only had `tokens`/`user`/
// `refreshTime`):
//   {
//     tokens:   [sessionId, ...]         // authoritative allow-list, as before
//     sessions: [{ id, createdAt, lastSeenAt, ip, os, browser, device }]
//     user:     { ...user row WITHOUT password/salt }
//     refreshTime
//   }
// A 3.x record without `sessions` keeps working; metadata is simply absent
// for those older sessions until they log in again.

export const MAX_SESSIONS = 10;

function authKey(userId) {
	return KvConst.AUTH_INFO + userId;
}

// Never keep credential material in the KV session snapshot (it is also what
// ends up in c.get('user') for every request).
export function publicUser(userRow) {
	if (!userRow) return userRow;
	const { password, salt, ...rest } = userRow;
	return rest;
}

const sessionService = {

	async read(c, userId, { fresh = false } = {}) {
		const key = authKey(userId);
		if (!fresh) {
			const hit = kvCache.get(key);
			if (hit) return hit;
		}
		const info = await c.env.kv.get(key, { type: 'json' });
		if (info) kvCache.set(key, info, TTL.AUTH);
		return info;
	},

	async write(c, userId, info) {
		const key = authKey(userId);
		await c.env.kv.put(key, JSON.stringify(info), { expirationTtl: constant.TOKEN_EXPIRE });
		kvCache.set(key, info, TTL.AUTH);
	},

	async create(c, userRow, sessionId) {
		let info = await this.read(c, userRow.userId, { fresh: true });
		if (!info || info.user?.email !== userRow.email) {
			info = { tokens: [], sessions: [], refreshTime: dayjs().toISOString() };
		}
		info.user = publicUser(userRow);
		info.tokens = Array.isArray(info.tokens) ? info.tokens : [];
		info.sessions = Array.isArray(info.sessions) ? info.sessions : [];

		const now = new Date().toISOString();
		let ua = { os: '', browser: '', device: '' };
		try { ua = reqUtils.getUserAgent(c); } catch { /* no request */ }
		let ip = '';
		try { ip = reqUtils.getIp(c); } catch { /* no request */ }

		info.tokens.push(sessionId);
		info.sessions.push({ id: sessionId, createdAt: now, lastSeenAt: now, ip, ...ua });

		// Evict the oldest sessions beyond the cap (same cap as 3.x).
		while (info.tokens.length > MAX_SESSIONS) {
			const evicted = info.tokens.shift();
			info.sessions = info.sessions.filter(s => s.id !== evicted);
		}
		info.sessions = info.sessions.filter(s => info.tokens.includes(s.id));

		await this.write(c, userRow.userId, info);
		return info;
	},

	isValid(info, sessionId) {
		return !!(info && Array.isArray(info.tokens) && sessionId && info.tokens.includes(sessionId));
	},

	list(info, currentSessionId) {
		if (!info) return [];
		const meta = new Map((info.sessions || []).map(s => [s.id, s]));
		return (info.tokens || []).map(id => {
			const s = meta.get(id) || {};
			return {
				// Expose only a short, non-reusable handle — the full session id
				// is a bearer credential's second half (jwt payload `token`).
				sessionId: id.slice(0, 8),
				createdAt: s.createdAt || null,
				lastSeenAt: s.lastSeenAt || null,
				ip: s.ip || '',
				os: s.os || '',
				browser: s.browser || '',
				device: s.device || '',
				current: id === currentSessionId
			};
		}).reverse();
	},

	// Remove sessions matching `predicate(id)`; returns how many were removed.
	async revokeWhere(c, userId, predicate) {
		const info = await this.read(c, userId, { fresh: true });
		if (!info) return 0;
		const before = info.tokens.length;
		info.tokens = info.tokens.filter(id => !predicate(id));
		info.sessions = (info.sessions || []).filter(s => info.tokens.includes(s.id));
		const removed = before - info.tokens.length;
		if (removed > 0) await this.write(c, userId, info);
		return removed;
	},

	revoke(c, userId, sessionId) {
		return this.revokeWhere(c, userId, id => id === sessionId);
	},

	// The UI only knows the 8-char handle from list().
	revokeByHandle(c, userId, handle) {
		if (typeof handle !== 'string' || handle.length < 8) return Promise.resolve(0);
		return this.revokeWhere(c, userId, id => id.startsWith(handle));
	},

	revokeOthers(c, userId, keepSessionId) {
		return this.revokeWhere(c, userId, id => id !== keepSessionId);
	},

	async revokeAll(c, userId) {
		await c.env.kv.delete(authKey(userId));
		kvCache.del(authKey(userId));
	},

	// Called at most once per day per user from the auth middleware.
	touch(info, sessionId, c) {
		const s = (info.sessions || []).find(x => x.id === sessionId);
		if (s) {
			s.lastSeenAt = new Date().toISOString();
			try { s.ip = reqUtils.getIp(c); } catch { /* ignore */ }
		}
	}
};

export default sessionService;
