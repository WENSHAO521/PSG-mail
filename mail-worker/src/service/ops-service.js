import dayjs from 'dayjs';
import { readMetrics } from './ops-metrics';
import r2Service from './r2-service';
import { emailConst } from '../const/entity-const';

async function safe(promise, fallback = null) {
	try { return await promise; } catch { return fallback; }
}

const opsService = {

	// Admin view: aggregated counters + live gauges. Every gauge is an indexed, bounded read and
	// each is optional (a table from a skipped migration just reports null).
	async overview(c, days) {
		const date = dayjs().format('YYYY-MM-DD');
		const [metrics, storage, aiToday, scheduled, forwardingFailed] = await Promise.all([
			safe(readMetrics(c.env, days), []),
			safe(r2Service.storageType(c), null),
			safe(c.env.db.prepare(
				`SELECT task, SUM(request_count) AS requests, SUM(input_units) AS inputUnits FROM ai_usage WHERE usage_date = ? GROUP BY task`
			).bind(date).all().then(r => r.results), []),
			safe(c.env.db.prepare(
				`SELECT status, COUNT(*) AS n FROM scheduled_email WHERE status IN ('pending','processing','failed') GROUP BY status`
			).all().then(r => Object.fromEntries(r.results.map(x => [x.status, x.n]))), null),
			safe(c.env.db.prepare(
				`SELECT COUNT(*) AS n FROM forward_delivery_log WHERE status = 'failed'`
			).first().then(r => r.n), null),
		]);

		return {
			generatedAt: new Date().toISOString(),
			note: 'Counters are approximate: they are batched per Worker instance (one write per minute) and an instance recycled before its flush loses under a minute of counts. No user ids, addresses or IPs are stored.',
			storage,
			gauges: {
				scheduledMail: scheduled,
				failedForwardDeliveries: forwardingFailed,
				aiToday,
			},
			metrics,
		};
	},
};

export default opsService;
