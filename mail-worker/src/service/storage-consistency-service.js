import r2Service from './r2-service';
import constant from '../const/constant';

// Object-storage consistency: a retry queue for failed deletions, and a
// read-only audit comparing stored objects with attachments rows.
//
// Nothing here deletes an object that is still referenced: every deletion
// re-checks the attachments table immediately before acting.

const MAX_ATTEMPTS = 5;
const BATCH = 50;

async function isReferenced(c, key) {
	const row = await c.env.db.prepare('SELECT 1 AS ok FROM attachments WHERE key = ? LIMIT 1').bind(key).first();
	return !!row;
}

const storageConsistencyService = {

	async enqueue(c, keys, error) {
		const msg = String(error?.message || error || '').slice(0, 500);
		for (const key of keys) {
			try {
				await c.env.db.prepare(
					`INSERT INTO attachment_cleanup_job (object_key, last_error) VALUES (?, ?)
					 ON CONFLICT(object_key) DO UPDATE SET status = 'pending', last_error = excluded.last_error, update_time = CURRENT_TIMESTAMP`
				).bind(key, msg).run();
			} catch (e) {
				// Table missing (migration not applied): at least make the orphan visible in logs.
				console.error('orphaned object (cleanup queue unavailable):', key, e?.message);
			}
		}
	},

	// Cron. Returns a summary for logging/tests.
	async processDue(c) {
		const summary = { done: 0, skipped: 0, retried: 0, failed: 0 };
		let rows = [];
		try {
			({ results: rows } = await c.env.db.prepare(
				`SELECT id, object_key, attempts FROM attachment_cleanup_job
				 WHERE status = 'pending' AND next_attempt_at <= CURRENT_TIMESTAMP ORDER BY id LIMIT ?`
			).bind(BATCH).all());
		} catch {
			return summary;
		}

		for (const job of rows) {
			if (await isReferenced(c, job.object_key)) {
				await c.env.db.prepare(`UPDATE attachment_cleanup_job SET status = 'skipped', update_time = CURRENT_TIMESTAMP WHERE id = ?`).bind(job.id).run();
				summary.skipped++;
				continue;
			}
			try {
				await r2Service.delete(c, [job.object_key]);
				await c.env.db.prepare(`UPDATE attachment_cleanup_job SET status = 'done', attempts = attempts + 1, update_time = CURRENT_TIMESTAMP WHERE id = ?`).bind(job.id).run();
				summary.done++;
			} catch (e) {
				const attempts = job.attempts + 1;
				const final = attempts >= MAX_ATTEMPTS;
				// Exponential backoff: 30 min, 1 h, 2 h, 4 h …
				const delayMin = 30 * 2 ** (attempts - 1);
				await c.env.db.prepare(
					`UPDATE attachment_cleanup_job SET status = ?, attempts = ?, last_error = ?, next_attempt_at = datetime('now', ?), update_time = CURRENT_TIMESTAMP WHERE id = ?`
				).bind(final ? 'failed' : 'pending', attempts, String(e?.message || e).slice(0, 500), `+${delayMin} minutes`, job.id).run();
				if (final) {
					// Alert hook: Workers Observability picks up console.error.
					console.error(`[ALERT] attachment object delete failed permanently: ${job.object_key}`);
					summary.failed++;
				} else {
					summary.retried++;
				}
			}
		}
		return summary;
	},

	// Read-only audit (admin). Lists up to `limit` stored attachment objects
	// and reports those with no attachments row, plus queue health. Never
	// deletes anything. Supported for KV and R2; S3 listing is not
	// implemented (reported as such).
	async audit(c, { limit = 1000, cursor } = {}) {
		const storageType = await r2Service.storageType(c);
		const report = { storageType, scanned: 0, orphans: [], cursor: null, queue: {} };

		try {
			const { results } = await c.env.db.prepare(
				`SELECT status, COUNT(*) AS n FROM attachment_cleanup_job GROUP BY status`
			).all();
			for (const r of results) report.queue[r.status] = r.n;
		} catch { /* table missing */ }

		let keys = [];
		const max = Math.min(Number(limit) || 1000, 1000);
		if (storageType === 'R2') {
			const page = await c.env.r2.list({ prefix: constant.ATTACHMENT_PREFIX, limit: max, cursor });
			keys = page.objects.map(o => o.key);
			report.cursor = page.truncated ? page.cursor : null;
		} else if (storageType === 'KV') {
			const page = await c.env.kv.list({ prefix: constant.ATTACHMENT_PREFIX, limit: max, cursor });
			keys = page.keys.map(k => k.name);
			report.cursor = page.list_complete ? null : page.cursor;
		} else {
			report.note = 'S3 listing not implemented — audit covers the cleanup queue only (pending verification against a real S3 endpoint).';
			return report;
		}

		report.scanned = keys.length;
		for (let i = 0; i < keys.length; i += 50) {
			const chunk = keys.slice(i, i + 50);
			const { results } = await c.env.db.prepare(
				`SELECT DISTINCT key FROM attachments WHERE key IN (${chunk.map(() => '?').join(',')})`
			).bind(...chunk).all();
			const referenced = new Set(results.map(r => r.key));
			report.orphans.push(...chunk.filter(k => !referenced.has(k)));
		}
		return report;
	}
};

export default storageConsistencyService;
