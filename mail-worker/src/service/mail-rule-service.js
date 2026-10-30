import BizError from '../error/biz-error';
import { t } from '../i18n/i18n';
import { emailConst } from '../const/entity-const';

// Per-user incoming-mail rules (the "Subject keywords" page). They run in the
// worker's email() handler right after a message is stored, so they apply
// whether or not any client is open and follow the user across devices.
// Table: psg_mail_rule (migrations/0021_mail_rule.sql).

export const CONDITION_TYPES = ['subject', 'sender', 'all'];
export const ACTIONS = ['star', 'archive', 'markRead', 'label', 'spam', 'trash'];
const MAX_RULES = 100;
const MAX_TEXT = 200;

function toRule(row) {
	return {
		id: row.rule_id,
		name: row.name,
		conditionType: row.condition_type,
		conditionValue: row.condition_value,
		action: row.action,
		actionValue: row.action_value || '',
		enabled: !!row.enabled,
	};
}

function normalize(params) {
	const name = String(params.name ?? '').trim().slice(0, MAX_TEXT);
	const conditionType = CONDITION_TYPES.includes(params.conditionType) ? params.conditionType : 'subject';
	const conditionValue = String(params.conditionValue ?? '').trim().slice(0, MAX_TEXT);
	const action = ACTIONS.includes(params.action) ? params.action : null;
	if (!action) throw new BizError(t('ruleInvalid') || 'Invalid rule', 400);
	if (conditionType !== 'all' && !conditionValue) throw new BizError(t('ruleInvalid') || 'Invalid rule', 400);
	const actionValue = action === 'label' ? String(Number(params.actionValue) || '') : '';
	if (action === 'label' && !actionValue) throw new BizError(t('ruleInvalid') || 'Invalid rule', 400);
	return { name, conditionType, conditionValue, action, actionValue, enabled: params.enabled === false ? 0 : 1 };
}

// A label rule may only point at one of the user's own labels.
async function checkLabel(c, userId, rule) {
	if (rule.action !== 'label') return;
	const own = await c.env.db.prepare('SELECT 1 AS ok FROM mail_label WHERE label_id = ? AND user_id = ?')
		.bind(Number(rule.actionValue), userId).first();
	if (!own) throw new BizError(t('ruleInvalid') || 'Invalid rule', 400);
}

// Same matching the browser used: case-insensitive "contains".
export function ruleMatches(rule, mail) {
	if (rule.conditionType === 'all') return true;
	const value = String(rule.conditionValue || '').toLowerCase();
	if (!value) return false;
	if (rule.conditionType === 'subject') return String(mail.subject || '').toLowerCase().includes(value);
	if (rule.conditionType === 'sender') {
		return String(mail.sendEmail || '').toLowerCase().includes(value)
			|| String(mail.name || '').toLowerCase().includes(value);
	}
	return false;
}

const mailRuleService = {

	async list(c, userId) {
		try {
			const { results } = await c.env.db
				.prepare('SELECT * FROM psg_mail_rule WHERE user_id = ? ORDER BY rule_id')
				.bind(userId).all();
			return results.map(toRule);
		} catch {
			// Table not migrated yet: behave as "no rules".
			return [];
		}
	},

	async create(c, userId, params) {
		const rule = normalize(params);
		await checkLabel(c, userId, rule);
		const { count } = await c.env.db
			.prepare('SELECT COUNT(*) AS count FROM psg_mail_rule WHERE user_id = ?')
			.bind(userId).first();
		if (count >= MAX_RULES) throw new BizError(t('ruleLimit') || 'Too many rules', 400);
		const row = await c.env.db
			.prepare(`INSERT INTO psg_mail_rule (user_id, name, condition_type, condition_value, action, enabled)
				VALUES (?, ?, ?, ?, ?, ?) RETURNING *`)
			.bind(userId, rule.name, rule.conditionType, rule.conditionValue, rule.action, rule.enabled)
			.first();
		return toRule(await saveActionValue(c, row, rule));
	},

	async update(c, userId, params) {
		const id = Number(params.id);
		const rule = normalize(params);
		await checkLabel(c, userId, rule);
		const row = await c.env.db
			.prepare(`UPDATE psg_mail_rule SET name = ?, condition_type = ?, condition_value = ?, action = ?, enabled = ?
				WHERE rule_id = ? AND user_id = ? RETURNING *`)
			.bind(rule.name, rule.conditionType, rule.conditionValue, rule.action, rule.enabled, id, userId)
			.first();
		if (!row) throw new BizError(t('ruleNotExist') || 'Rule does not exist', 404);
		return toRule(await saveActionValue(c, row, rule));
	},

	async remove(c, userId, id) {
		await c.env.db
			.prepare('DELETE FROM psg_mail_rule WHERE rule_id = ? AND user_id = ?')
			.bind(Number(id), userId).run();
	},

	// One-time move of rules a browser still holds in localStorage. Only runs
	// while the user has no server rules, so a second device can't duplicate them.
	async importLocal(c, userId, rules) {
		if (!Array.isArray(rules) || !rules.length) return this.list(c, userId);
		const existing = await this.list(c, userId);
		if (existing.length) return existing;
		for (const item of rules.slice(0, MAX_RULES)) {
			try { await this.create(c, userId, item); } catch { /* skip invalid entries */ }
		}
		return this.list(c, userId);
	},

	// Called from the email() handler for a freshly stored message.
	// Never throws: a broken rule must not fail mail delivery. Returns
	// { silent: true } when a rule moved the mail to spam or trash, so the
	// caller skips notifications and forwarding for it.
	async applyIncoming(c, userId, emailRow) {
		try {
			if (!userId || !emailRow?.emailId) return {};
			const rules = (await this.list(c, userId)).filter(r => r.enabled && ruleMatches(r, emailRow));
			if (!rules.length) return {};
			const actions = new Set(rules.map(r => r.action));
			const db = c.env.db;
			for (const r of rules.filter(r => r.action === 'label' && r.actionValue)) {
				await db.prepare(`INSERT OR IGNORE INTO mail_label_email (label_id, email_id)
					SELECT label_id, ? FROM mail_label WHERE label_id = ? AND user_id = ?`)
					.bind(emailRow.emailId, Number(r.actionValue), userId).run();
			}
			if (actions.has('trash')) {
				try {
					await db.prepare('UPDATE email SET is_del = 1, delete_time = CURRENT_TIMESTAMP WHERE email_id = ?')
						.bind(emailRow.emailId).run();
				} catch {
					// delete_time is added lazily by emailService.delete.
					await db.prepare('UPDATE email SET is_del = 1 WHERE email_id = ?').bind(emailRow.emailId).run();
				}
				emailRow.isDel = 1;
			} else if (actions.has('spam')) {
				await db.prepare('UPDATE email SET is_spam = 1 WHERE email_id = ?').bind(emailRow.emailId).run();
				emailRow.isSpam = 1;
			}
			if (actions.has('star')) {
				const exists = await db.prepare('SELECT 1 FROM star WHERE user_id = ? AND email_id = ?')
					.bind(userId, emailRow.emailId).first();
				if (!exists) {
					await db.prepare('INSERT INTO star (user_id, email_id) VALUES (?, ?)').bind(userId, emailRow.emailId).run();
				}
			}
			if (actions.has('archive')) {
				await db.prepare('UPDATE email SET is_archive = 1 WHERE email_id = ?').bind(emailRow.emailId).run();
				emailRow.isArchive = 1;
			}
			if (actions.has('markRead')) {
				await db.prepare('UPDATE email SET unread = ? WHERE email_id = ?')
					.bind(emailConst.unread.READ, emailRow.emailId).run();
				emailRow.unread = emailConst.unread.READ;
			}
			return { silent: actions.has('trash') || actions.has('spam') };
		} catch (e) {
			console.error('mail rules failed', e);
			return {};
		}
	},
};

// action_value comes from migrations/0027; written separately so a database
// without the column still saves star / archive / mark-read rules.
async function saveActionValue(c, row, rule) {
	if ((row.action_value || '') === rule.actionValue) return row;
	try {
		await c.env.db.prepare('UPDATE psg_mail_rule SET action_value = ? WHERE rule_id = ?')
			.bind(rule.actionValue, row.rule_id).run();
		row.action_value = rule.actionValue;
	} catch (e) {
		if (rule.actionValue) throw e;
	}
	return row;
}

export default mailRuleService;
