import dayjs from 'dayjs';
import BizError from '../error/biz-error';
import settingService from './setting-service';

const DEFAULT_CHAT_MODEL = '@cf/meta/llama-3.1-8b-instruct-fast';
const DEFAULT_TRANSLATION_MODEL = '@cf/meta/m2m100-1.2b';

function responseText(result) {
	if (typeof result === 'string') return result;
	return result?.response || result?.result?.response || result?.translated_text || '';
}

function estimateUnits(input) {
	try { return Math.max(1, Math.ceil(JSON.stringify(input || '').length / 1000)); }
	catch { return 1; }
}

const aiProviderService = {
	async models(c, task = 'chat') {
		const setting = await settingService.query(c);
		const isTranslation = task === 'translation';
		const model = setting.aiDefaultModel
			|| (isTranslation ? c.env.ai_translation_model : '')
			|| c.env.ai_model
			|| (isTranslation ? DEFAULT_TRANSLATION_MODEL : DEFAULT_CHAT_MODEL);
		const fallbackModel = setting.aiFallbackModel || c.env.ai_fallback_model || c.env.ai_assistant_model || '';
		return { model, fallbackModel, quota: Math.max(0, Number(setting.aiDailyQuota) || 0) };
	},

	async reserveQuota(c, userId, task, input, quota) {
		if (!userId || !quota) return;
		const date = dayjs().format('YYYY-MM-DD');
		const existing = await c.env.db.prepare(
			`SELECT COALESCE(SUM(request_count), 0) AS total FROM ai_usage WHERE user_id = ? AND usage_date = ?`
		).bind(userId, date).first();
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
		await this.reserveQuota(c, userId, task, input, quota);
		const primary = options.model || model;
		try {
			return await c.env.ai.run(primary, input);
		} catch (firstError) {
			if (!fallbackModel || fallbackModel === primary) {
				console.error('AI provider request failed', task, firstError?.message || firstError);
				throw new BizError('AI 服务暂时不可用', 503);
			}
			try {
				return await c.env.ai.run(fallbackModel, input);
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

export { DEFAULT_CHAT_MODEL, DEFAULT_TRANSLATION_MODEL };
export default aiProviderService;
