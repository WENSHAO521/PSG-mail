import BizError from '../error/biz-error';
import { SUPPORTED_LANGUAGES } from './ai-safety';

// Server-side AI conversation history + per-user / per-mailbox agent
// preferences. Every query is scoped by the authenticated user_id; a
// conversation id on its own never grants access.

const MAX_HISTORY_FOR_MODEL = 20;
const DEFAULT_RETENTION_DAYS = 30;

const DEFAULTS = {
	instructions: '', signature: '', language: 'auto', historyEnabled: true,
	retentionDays: DEFAULT_RETENTION_DAYS, autoDraftEnabled: false, autoDraftDomains: [],
};

function fromRow(r) {
	return {
		instructions: r.instructions, signature: r.signature, language: r.language,
		historyEnabled: !!r.history_enabled, retentionDays: r.retention_days,
		autoDraftEnabled: !!r.auto_draft_enabled, autoDraftDomains: JSON.parse(r.auto_draft_domains || '[]'),
	};
}

const aiConversationService = {

	// ── settings ──────────────────────────────────────────────────────────
	// Effective settings for (user, mailbox): mailbox row overrides the
	// user-level row field by field (non-empty text, explicit flags).
	async getSettings(c, userId, accountId = 0) {
		const { results } = await c.env.db.prepare(
			`SELECT * FROM ai_agent_setting WHERE user_id = ? AND account_id IN (0, ?)`
		).bind(userId, Number(accountId) || 0).all();
		const user = results.find(r => r.account_id === 0);
		const box = Number(accountId) ? results.find(r => r.account_id === Number(accountId)) : null;
		const base = user ? fromRow(user) : { ...DEFAULTS };
		if (!box) return base;
		const b = fromRow(box);
		return {
			...base,
			instructions: [base.instructions, b.instructions].filter(Boolean).join('\n'),
			signature: b.signature || base.signature,
			language: b.language !== 'auto' ? b.language : base.language,
			autoDraftEnabled: b.autoDraftEnabled || base.autoDraftEnabled,
			autoDraftDomains: b.autoDraftDomains.length ? b.autoDraftDomains : base.autoDraftDomains,
			// privacy settings are always the user's, not a mailbox's
		};
	},

	// Raw row for the settings screen (no merging).
	async getRaw(c, userId, accountId = 0) {
		const r = await c.env.db.prepare('SELECT * FROM ai_agent_setting WHERE user_id = ? AND account_id = ?').bind(userId, Number(accountId) || 0).first();
		return r ? fromRow(r) : { ...DEFAULTS };
	},

	async putSettings(c, userId, accountId, input) {
		accountId = Number(accountId) || 0;
		if (accountId) {
			const ok = await c.env.db.prepare(
				`SELECT 1 AS ok FROM account WHERE account_id = ? AND is_del = 0 AND (user_id = ? OR account_id IN (SELECT account_id FROM account_share WHERE user_id = ?))`
			).bind(accountId, userId, userId).first();
			if (!ok) throw new BizError('Mailbox not found', 404);
		}
		const cur = await this.getRaw(c, userId, accountId);
		const s = { ...cur };
		if (input.instructions !== undefined) s.instructions = String(input.instructions).slice(0, 2000);
		if (input.signature !== undefined) s.signature = String(input.signature).slice(0, 1000);
		if (input.language !== undefined) {
			if (!SUPPORTED_LANGUAGES.includes(input.language)) throw new BizError('Unsupported language', 400);
			s.language = input.language;
		}
		if (accountId === 0) {
			if (input.historyEnabled !== undefined) s.historyEnabled = !!input.historyEnabled;
			if (input.retentionDays !== undefined) {
				const n = Number(input.retentionDays);
				if (!Number.isInteger(n) || n < 1 || n > 365) throw new BizError('retentionDays must be 1..365', 400);
				s.retentionDays = n;
			}
		}
		if (input.autoDraftEnabled !== undefined) s.autoDraftEnabled = !!input.autoDraftEnabled;
		if (input.autoDraftDomains !== undefined) {
			if (!Array.isArray(input.autoDraftDomains) || input.autoDraftDomains.length > 50
				|| input.autoDraftDomains.some(d => !/^[a-z0-9.-]{1,100}$/i.test(String(d)))) {
				throw new BizError('autoDraftDomains must be a list of domains', 400);
			}
			s.autoDraftDomains = input.autoDraftDomains.map(d => String(d).toLowerCase());
		}
		await c.env.db.prepare(
			`INSERT INTO ai_agent_setting (user_id, account_id, instructions, signature, language, history_enabled, retention_days, auto_draft_enabled, auto_draft_domains)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
			 ON CONFLICT(user_id, account_id) DO UPDATE SET instructions = excluded.instructions, signature = excluded.signature,
			   language = excluded.language, history_enabled = excluded.history_enabled, retention_days = excluded.retention_days,
			   auto_draft_enabled = excluded.auto_draft_enabled, auto_draft_domains = excluded.auto_draft_domains, update_time = CURRENT_TIMESTAMP`
		).bind(userId, accountId, s.instructions, s.signature, s.language, s.historyEnabled ? 1 : 0, s.retentionDays, s.autoDraftEnabled ? 1 : 0, JSON.stringify(s.autoDraftDomains)).run();
		return s;
	},

	// ── conversations ─────────────────────────────────────────────────────
	async create(c, userId, { accountId = 0, title = '' } = {}) {
		const id = crypto.randomUUID();
		await c.env.db.prepare('INSERT INTO ai_conversation (id, user_id, account_id, title) VALUES (?, ?, ?, ?)')
			.bind(id, userId, Number(accountId) || 0, String(title).slice(0, 80)).run();
		return id;
	},

	async getOwned(c, userId, id) {
		const row = await c.env.db.prepare('SELECT * FROM ai_conversation WHERE id = ? AND user_id = ?').bind(String(id), userId).first();
		if (!row) throw new BizError('Conversation not found', 404);
		return row;
	},

	async list(c, userId, limit = 30) {
		const { results } = await c.env.db.prepare(
			`SELECT id, account_id, title, create_time, update_time FROM ai_conversation WHERE user_id = ? ORDER BY update_time DESC LIMIT ?`
		).bind(userId, Math.min(Number(limit) || 30, 100)).all();
		return results.map(r => ({ id: r.id, accountId: r.account_id, title: r.title, createTime: r.create_time, updateTime: r.update_time }));
	},

	async messages(c, userId, id) {
		await this.getOwned(c, userId, id);
		const { results } = await c.env.db.prepare(
			`SELECT id, role, content, tool_name, create_time FROM ai_message WHERE conversation_id = ? AND user_id = ? ORDER BY id`
		).bind(String(id), userId).all();
		return results.map(r => ({ id: r.id, role: r.role, content: r.content, toolName: r.tool_name || undefined, createTime: r.create_time }));
	},

	// Only user/assistant turns are replayed to the model. Tool outputs
	// (which contain third-party mail text) are NOT replayed from storage, so
	// a malicious email cannot persist instructions into later turns.
	async historyForModel(c, userId, id) {
		const { results } = await c.env.db.prepare(
			`SELECT role, content FROM ai_message WHERE conversation_id = ? AND user_id = ? AND role IN ('user','assistant')
			 ORDER BY id DESC LIMIT ?`
		).bind(String(id), userId, MAX_HISTORY_FOR_MODEL).all();
		return results.reverse().map(r => ({ role: r.role, content: r.content }));
	},

	async append(c, userId, conversationId, role, content, { toolName = null, toolCallId = null } = {}) {
		await c.env.db.prepare(
			`INSERT INTO ai_message (conversation_id, user_id, role, content, tool_name, tool_call_id) VALUES (?, ?, ?, ?, ?, ?)`
		).bind(String(conversationId), userId, role, String(content).slice(0, 20000), toolName, toolCallId).run();
		await c.env.db.prepare('UPDATE ai_conversation SET update_time = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?').bind(String(conversationId), userId).run();
	},

	async setTitleIfEmpty(c, userId, id, title) {
		await c.env.db.prepare(`UPDATE ai_conversation SET title = ? WHERE id = ? AND user_id = ? AND title = ''`).bind(String(title).slice(0, 80), String(id), userId).run();
	},

	async remove(c, userId, id) {
		await this.getOwned(c, userId, id);
		await c.env.db.batch([
			c.env.db.prepare('DELETE FROM ai_message WHERE conversation_id = ? AND user_id = ?').bind(String(id), userId),
			c.env.db.prepare('DELETE FROM ai_conversation WHERE id = ? AND user_id = ?').bind(String(id), userId),
		]);
	},

	async removeAll(c, userId) {
		await c.env.db.batch([
			c.env.db.prepare('DELETE FROM ai_message WHERE user_id = ?').bind(userId),
			c.env.db.prepare('DELETE FROM ai_conversation WHERE user_id = ?').bind(userId),
		]);
	},

	// Daily cron: per-user retention (default 30 days), plus task-log trimming.
	async prune(c) {
		try {
			await c.env.db.batch([
				c.env.db.prepare(
					`DELETE FROM ai_message WHERE create_time < datetime('now', '-' || COALESCE(
						(SELECT retention_days FROM ai_agent_setting s WHERE s.user_id = ai_message.user_id AND s.account_id = 0), ${DEFAULT_RETENTION_DAYS}) || ' days')`
				),
				c.env.db.prepare(`DELETE FROM ai_conversation WHERE update_time < datetime('now', '-1 day') AND id NOT IN (SELECT DISTINCT conversation_id FROM ai_message)`),
				c.env.db.prepare(`DELETE FROM ai_task_log WHERE create_time < datetime('now', '-90 days')`),
			]);
		} catch (e) { console.warn('ai history prune skipped:', e?.message); }
	}
};

export default aiConversationService;
