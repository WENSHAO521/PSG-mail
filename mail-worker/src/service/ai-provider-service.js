import dayjs from 'dayjs';
import BizError from '../error/biz-error';
import settingService from './setting-service';

const DEFAULT_CHAT_MODEL = '@cf/meta/llama-3.1-8b-instruct-fast';

function responseText(result) {
	if (typeof result === 'string') return result;
	return result?.response || result?.result?.response || result?.translated_text || '';
}

function estimateUnits(input) {
	try { return Math.max(1, Math.ceil(JSON.stringify(input || '').length / 1000)); }
	catch { return 1; }
}

const SYSTEM_TASKS = ['spam_detection', 'tracker_detection', 'auto_draft'];

const aiProviderService = {
	async models(c, task = 'chat') {
		const setting = await settingService.query(c);
		// Every task (including translation, which now sends chat-style
		// { messages: [...] } like the rest) uses the same chat-completion model.
		const model = setting.aiDefaultModel || c.env.ai_model || DEFAULT_CHAT_MODEL;
		const fallbackModel = setting.aiFallbackModel || c.env.ai_fallback_model || c.env.ai_assistant_model || '';
		return { model, fallbackModel, quota: Math.max(0, Number(setting.aiDailyQuota) || 0) };
	},

	// System tasks (spam screening, tracker detection) run on mail the user did not ask for, so
	// they are counted against their own per-task ceiling and never eat into
	// the user's interactive budget.
	async reserveQuota(c, userId, task, input, quota, perTask = false) {
		if (!userId || !quota) return;
		const date = dayjs().format('YYYY-MM-DD');
		const existing = perTask
			? await c.env.db.prepare(
				`SELECT COALESCE(SUM(request_count), 0) AS total FROM ai_usage WHERE user_id = ? AND usage_date = ? AND task = ?`
			).bind(userId, date, task).first()
			: await c.env.db.prepare(
				`SELECT COALESCE(SUM(request_count), 0) AS total FROM ai_usage WHERE user_id = ? AND usage_date = ? AND task NOT IN (${SYSTEM_TASKS.map(() => '?').join(',')})`
			).bind(userId, date, ...SYSTEM_TASKS).first();
		if (Number(existing?.total || 0) >= quota) {
			throw new BizError('AI 每日额度已用尽，请明天再试', 429);
		}
		const units = estimateUnits(input);
		await c.env.db.prepare(
			`INSERT INTO ai_usage (user_id, usage_date, task, input_units, request_count)
			 VALUES (?, ?, ?, ?, 1)
			 ON CONFLICT(user_id, usage_date, task) DO UPDATE SET
			 input_units = input_units + excluded.input_units,
			 request_count = request_count + 1,
			 updated_at = CURRENT_TIMESTAMP`
		).bind(userId, date, task, units).run();
	},

	async run(c, userId, task, input, options = {}) {
		if (!c.env.ai) throw new BizError('AI binding not configured', 503);
		const { model, fallbackModel, quota } = await this.models(c, task);
		// options.perTask counts only this task's usage against the quota;
		// options.defaultQuota applies when the admin set none.
		await this.reserveQuota(c, userId, task, input, quota || options.defaultQuota || 0, options.perTask);
		const primary = options.model || model;
		// options.meta (optional) receives which model answered and whether
		// the fallback model had to be used — for task logs / the UI.
		const meta = options.meta || {};
		meta.model = primary;
		meta.fallbackUsed = false;
		try {
			return await c.env.ai.run(primary, input);
		} catch (firstError) {
			if (!fallbackModel || fallbackModel === primary) {
				console.error('AI provider request failed', task, firstError?.message || firstError);
				throw new BizError('AI 服务暂时不可用', 503);
			}
			try {
				const out = await c.env.ai.run(fallbackModel, input);
				meta.model = fallbackModel;
				meta.fallbackUsed = true;
				return out;
			} catch (fallbackError) {
				console.error('AI provider fallback failed', task, fallbackError?.message || fallbackError);
				throw new BizError('AI 服务暂时不可用', 503);
			}
		}
	},

	text(result) {
		return responseText(result).trim();
	},
};

export { DEFAULT_CHAT_MODEL };
export default aiProviderService;
