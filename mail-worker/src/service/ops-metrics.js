// Low-cost operations / security counters.
//
// Events are counted in memory and written to D1 (`ops_metric`, one row per UTC day + metric) in
// one small batch at most once a minute per Worker isolate, so a burst (for example a password
// guessing attack) costs a handful of row writes, not one per attempt. Consequences, by design:
//   - counts are approximate: an isolate that is evicted before its next flush loses < 1 minute
//   - nothing identifying is stored: only a fixed metric name, a count and an optional duration
//   - a missing table (migration 0020 not applied) is tolerated; counts are then dropped
const FLUSH_INTERVAL_MS = 60_000;
const MAX_PENDING = 64;
const NAME = /^[a-z0-9_.:-]{1,48}$/;

const pending = new Map();
let lastFlush = Date.now();
let warned = false;

function today() {
	return new Date().toISOString().slice(0, 10);
}

// Accumulate only (no I/O). `ms` is an optional duration for latency tracking.
export function bump(metric, { n = 1, ms = 0 } = {}) {
	if (!NAME.test(metric)) return;
	let entry = pending.get(metric);
	if (!entry) {
		if (pending.size >= MAX_PENDING) return;
		entry = { count: 0, totalMs: 0, maxMs: 0 };
		pending.set(metric, entry);
	}
	entry.count += n;
	entry.totalMs += Math.round(ms);
	entry.maxMs = Math.max(entry.maxMs, Math.round(ms));
}

export async function flushMetrics(env) {
	if (pending.size === 0) {
		lastFlush = Date.now();
		return 0;
	}
	const snapshot = [...pending.entries()];
	pending.clear();
	lastFlush = Date.now();
	const day = today();
	try {
		await env.db.batch(snapshot.map(([metric, e]) => env.db.prepare(
			`INSERT INTO ops_metric (day, metric, count, total_ms, max_ms) VALUES (?, ?, ?, ?, ?)
			 ON CONFLICT(day, metric) DO UPDATE SET
			   count = count + excluded.count,
			   total_ms = total_ms + excluded.total_ms,
			   max_ms = MAX(max_ms, excluded.max_ms)`
		).bind(day, metric, e.count, e.totalMs, e.maxMs)));
		return snapshot.length;
	} catch (e) {
		if (!warned) {
			warned = true;
			console.warn('ops metrics not stored (apply migration 0020_ops_metric.sql):', e?.message);
		}
		return 0;
	}
}

// Request path: cheap time check, the write itself runs after the response via waitUntil.
export function maybeFlush(c) {
	if (pending.size === 0 || Date.now() - lastFlush < FLUSH_INTERVAL_MS) return;
	const task = flushMetrics(c.env);
	try {
		c.executionCtx.waitUntil(task);
	} catch {
		task.catch(() => {});
	}
}

// Convenience used from services: count + opportunistic flush.
export function recordMetric(c, metric, opts) {
	bump(metric, opts);
	if (c) maybeFlush(c);
}

// Test helper.
export function _resetForTests() {
	pending.clear();
	lastFlush = Date.now();
	warned = false;
}

export async function purgeOldMetrics(env, keepDays = 60) {
	const cutoff = new Date(Date.now() - keepDays * 86400000).toISOString().slice(0, 10);
	try {
		await env.db.prepare('DELETE FROM ops_metric WHERE day < ?').bind(cutoff).run();
	} catch {}
}

export async function readMetrics(env, days = 7) {
	const span = Math.min(Math.max(Number(days) || 7, 1), 60);
	const from = new Date(Date.now() - (span - 1) * 86400000).toISOString().slice(0, 10);
	await flushMetrics(env); // include what this isolate still holds
	const { results } = await env.db.prepare(
		'SELECT day, metric, count, total_ms, max_ms FROM ops_metric WHERE day >= ? ORDER BY day DESC, metric ASC'
	).bind(from).all();
	return results.map(r => ({
		day: r.day, metric: r.metric, count: r.count,
		avgMs: r.total_ms && r.count ? Math.round(r.total_ms / r.count) : null,
		maxMs: r.max_ms || null,
	}));
}
