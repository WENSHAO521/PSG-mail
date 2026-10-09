import { bump } from '../service/ops-metrics'
/**
 * Module-level in-memory TTL cache for KV reads.
 * Cloudflare Worker isolates reuse the same module instance across many
 * requests, so this cache cuts KV reads dramatically for hot paths like
 * /setting/websiteConfig (unauthenticated) and per-request auth checks.
 *
 * Size cap: evict the oldest entry when the store exceeds MAX_ENTRIES to
 * prevent unbounded memory growth in long-lived isolates.
 */

const MAX_ENTRIES = 2000
const store = new Map()

function evictExpiredOrOldest() {
	const now = Date.now()
	for (const [k, v] of store) {
		if (now > v.expiry) { store.delete(k); return }
	}
	// No expired entry found — delete the oldest (first inserted)
	const oldest = store.keys().next().value
	if (oldest !== undefined) store.delete(oldest)
}

function get(key) {
	const entry = store.get(key)
	if (!entry) { bump('cache.miss'); return null }
	if (Date.now() > entry.expiry) {
		store.delete(key)
		bump('cache.miss')
		return null
	}
	bump('cache.hit')
	return entry.value
}

function set(key, value, ttlSeconds) {
	if (store.size >= MAX_ENTRIES) evictExpiredOrOldest()
	store.set(key, { value, expiry: Date.now() + ttlSeconds * 1000 })
}

function del(key) {
	store.delete(key)
}

// Exported TTLs (seconds)
export const TTL = {
	SETTING: 60,   // settings change rarely; 60 s is fine
	AUTH:    30,   // short enough that logout/ban takes effect quickly
	PERM:    120,  // role permissions; 2 min stale window is acceptable
}

export default { get, set, del }
