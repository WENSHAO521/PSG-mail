import BizError from '../error/biz-error';
import settingService from './setting-service';

// Google Translate for the in-place email translation. With a Cloud
// Translation API key the official v2 endpoint is used; without one, the
// keyless endpoint Google's own web widgets call (free, rate-limited).
const GOOGLE_LANG = { zh: 'zh-CN', en: 'en' };
const KEYLESS_URL = 'https://translate.googleapis.com/translate_a/t';
const CLOUD_URL = 'https://translation.googleapis.com/language/translate/v2';
const BATCH_CHARS = 4000;
const BATCH_ITEMS = 100;
const CONCURRENCY = 4;

function decodeEntities(s) {
	return String(s)
		.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
		.replace(/&quot;/g, '"').replace(/&apos;/g, "'")
		.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

function batchesOf(items) {
	const batches = [];
	let cur = [], size = 0;
	items.forEach((text, i) => {
		if (!text) return;
		if (cur.length && (size + text.length > BATCH_CHARS || cur.length >= BATCH_ITEMS)) {
			batches.push(cur); cur = []; size = 0;
		}
		cur.push(i); size += text.length;
	});
	if (cur.length) batches.push(cur);
	return batches;
}

async function keyless(input, target) {
	const body = new URLSearchParams();
	input.forEach(q => body.append('q', q));
	const res = await fetch(`${KEYLESS_URL}?client=gtx&sl=auto&tl=${target}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
		body,
	});
	if (!res.ok) throw new BizError(`Google 翻译请求失败 (${res.status})`, 502);
	let data = await res.json();
	if (!Array.isArray(data)) data = [data];
	// Each item is "text" or ["text", detectedLang].
	return data.map(item => (Array.isArray(item) ? item[0] : item)).map(v => (typeof v === 'string' ? v : ''));
}

async function cloud(input, target, key) {
	// The key goes in a header, not the query string, so it can't end up in
	// request logs or error messages that echo the URL.
	const res = await fetch(CLOUD_URL, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', 'X-goog-api-key': key },
		body: JSON.stringify({ q: input, target, format: 'text' }),
	});
	const data = await res.json().catch(() => null);
	if (!res.ok) throw new BizError(`Google 翻译请求失败: ${data?.error?.message || res.status}`, 502);
	return (data?.data?.translations || []).map(t => decodeEntities(t?.translatedText || ''));
}

const CACHE_TTL_SECONDS = 86400;

const translateService = {
	async cacheKey(userId, provider, targetLang, source) {
		const data = new TextEncoder().encode(JSON.stringify([provider, targetLang || '', source]));
		const hash = await crypto.subtle.digest('SHA-256', data);
		const hex = [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
		return `translate:${userId}:${hex}`;
	},

	async cacheGet(c, key, length) {
		try {
			const hit = await c.env.kv.get(key, { type: 'json' });
			return Array.isArray(hit) && hit.length === length ? hit : null;
		} catch { return null; } // cache is best effort
	},

	async cachePut(c, key, segments) {
		try {
			await c.env.kv.put(key, JSON.stringify(segments), { expirationTtl: CACHE_TTL_SECONDS });
		} catch {}
	},

	// The user's own choice (Settings → Account) wins over the admin default;
	// their own key wins over the admin's.
	async provider(c, userId) {
		const setting = await settingService.query(c);
		let pref = null;
		if (userId) {
			try {
				pref = await c.env.db
					.prepare('SELECT translate_provider, google_translate_key FROM psg_user_pref WHERE user_id = ?')
					.bind(userId).first();
			} catch {} // migration 0015 not applied yet
		}
		const chosen = pref?.translate_provider || setting.translateProvider;
		return {
			provider: chosen === 'ai' ? 'ai' : 'google',
			key: pref?.google_translate_key || setting.googleTranslateKey || '',
		};
	},

	// One translation per segment, same order; segments Google drops keep
	// their original text. Throws only when no batch succeeded.
	async googleSegments(source, targetLang, key = '') {
		const target = GOOGLE_LANG[targetLang] || targetLang || GOOGLE_LANG.zh;
		const out = source.slice();
		const batches = batchesOf(source);
		const failures = [];
		let next = 0;
		const worker = async () => {
			while (next < batches.length) {
				const batch = batches[next++];
				const input = batch.map(i => source[i]);
				try {
					const result = key ? await cloud(input, target, key) : await keyless(input, target);
					if (result.length !== input.length) throw new BizError('Google 翻译返回的条数不符', 502);
					batch.forEach((idx, k) => { if (result[k] && result[k].trim()) out[idx] = result[k]; });
				} catch (e) {
					failures.push(e);
				}
			}
		};
		await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batches.length) }, worker));
		if (batches.length && failures.length === batches.length) {
			console.error('Google translate failed', failures[0]?.message || failures[0]);
			throw failures[0] instanceof BizError ? failures[0] : new BizError('Google 翻译暂时不可用', 502);
		}
		return out;
	},
};

export default translateService;
