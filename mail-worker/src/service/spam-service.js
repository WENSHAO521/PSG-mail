import schemaGuard from '../init/schema-guard';
import emailUtils from '../utils/email-utils';
import { settingConst } from '../const/entity-const';
import aiProviderService from './ai-provider-service';

// AI spam screening for incoming mail (admin switch: setting.aiSpam).
//
// Only confident verdicts move mail to Spam — a false positive hides a real
// message, which is worse than letting one spam through. Mail is never
// screened when the sender is on one of this deployment's own domains, when
// the user has vouched for the sender ("not spam"), or when the user has
// written to that address before.

const SPAM_THRESHOLD = 0.85;
const AI_TIMEOUT_MS = 10000;
const MAX_BODY_CHARS = 4000;
// Per-recipient daily ceiling on screening calls when the admin has not set
// an AI daily quota, so a mail flood cannot run up unlimited inference.
const DEFAULT_DAILY_SCREENS = 300;

const SYSTEM_PROMPT = [
	'You are an email spam filter for an academic publishing organisation.',
	'Classify the email as spam only if it is clearly unsolicited bulk marketing, phishing, a scam, malware bait, or fraudulent.',
	'Newsletters the recipient likely subscribed to, receipts, notifications from known services, editorial or peer-review correspondence, and personal or business mail are NOT spam.',
	'When unsure, answer not spam.',
	'Reply with JSON only: {"spam": true|false, "confidence": 0.0-1.0, "reason": "one short sentence in Chinese"}.',
].join(' ');

function normalizeAddress(address) {
	return String(address || '').trim().toLowerCase();
}

function withTimeout(promise, ms) {
	return Promise.race([
		promise,
		new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
	]);
}

function parseVerdict(result) {
	const content = aiProviderService.text(result) || (typeof result === 'object' ? result : '');
	let json = content;
	if (typeof content === 'string') {
		const match = content.match(/\{[\s\S]*\}/);
		if (!match) return null;
		json = JSON.parse(match[0]);
	}
	if (typeof json?.spam !== 'boolean') return null;
	const confidence = Math.min(1, Math.max(0, Number(json.confidence) || 0));
	const reason = String(json.reason || '').slice(0, 200);
	return { spam: json.spam, confidence, reason };
}

function escapeLike(value) {
	return value.replace(/[\\%_]/g, ch => '\\' + ch);
}

function recipientAddresses(recipient) {
	try {
		const list = JSON.parse(recipient || '[]');
		return (Array.isArray(list) ? list : []).map(r => normalizeAddress(r?.address));
	} catch {
		return [];
	}
}

function ownDomains(env) {
	const raw = env.domain;
	const list = Array.isArray(raw) ? raw : String(raw || '').replace(/[\[\]"']/g, '').split(',');
	return list.map(d => d.trim().toLowerCase()).filter(Boolean);
}

const spamService = {

	SPAM_THRESHOLD,

	enabled(setting) {
		return Number(setting?.aiSpam) === settingConst.aiSpam.OPEN;
	},

	// True when this sender should bypass AI screening for this user.
	async isTrusted(c, userId, sender) {
		const address = normalizeAddress(sender);
		if (!address) return false;
		if (ownDomains(c.env).includes(emailUtils.getDomain(address).toLowerCase())) return true;
		try {
			const allowed = await c.env.db.prepare(
				'SELECT 1 FROM psg_spam_allow WHERE user_id = ? AND sender = ?'
			).bind(userId, address).first();
			if (allowed) return true;
		} catch {}
		try {
			// Someone this user has written to before. The LIKE matches the
			// address as a whole JSON string value ("addr") and only narrows
			// the rows; the parsed recipient list decides.
			const { results } = await c.env.db.prepare(
				`SELECT recipient FROM email WHERE user_id = ? AND type = 1 AND LOWER(recipient) LIKE ? ESCAPE '\\' LIMIT 20`
			).bind(userId, `%"${escapeLike(address)}"%`).all();
			for (const row of results || []) {
				if (recipientAddresses(row.recipient).includes(address)) return true;
			}
		} catch {}
		return false;
	},

	async classify(c, email, userId) {
		const subject = email.subject || '';
		const text = emailUtils.formatText(email.text || '');
		const htmlText = emailUtils.htmlToText(email.html || '');
		const body = (htmlText || text).slice(0, MAX_BODY_CHARS);
		const from = email.from?.address || '';
		const fromName = email.from?.name || '';
		const auth = email.headers?.find?.(h => h.key === 'authentication-results')?.value || '';

		const result = await withTimeout(aiProviderService.run(c, userId, 'spam_detection', {
			messages: [
				{ role: 'system', content: SYSTEM_PROMPT },
				{
					role: 'user',
					content: `From: ${fromName} <${from}>\nAuthentication-Results: ${auth.slice(0, 300)}\nSubject: ${subject}\n\n${body}`,
				},
			],
			temperature: 0,
			max_tokens: 120,
		}, { perTask: true, defaultQuota: DEFAULT_DAILY_SCREENS }), AI_TIMEOUT_MS);
		return parseVerdict(result);
	},

	// Screens one received message. Returns true when it was moved to Spam.
	// Never throws: any AI or DB failure leaves the mail in the inbox.
	async screen(c, { email, emailRow, setting }) {
		try {
			if (!this.enabled(setting) || !emailRow?.emailId || !emailRow.userId) return false;
			if (await this.isTrusted(c, emailRow.userId, email.from?.address)) return false;
			const verdict = await this.classify(c, email, emailRow.userId);
			if (!verdict?.spam || verdict.confidence < SPAM_THRESHOLD) return false;
			await this.markBySystem(c, emailRow.emailId, verdict);
			return true;
		} catch (e) {
			console.error('AI spam screening failed', e?.message || e);
			return false;
		}
	},

	async markBySystem(c, emailId, verdict) {
		await schemaGuard.ensure(c);
		// One batch (a D1 transaction): never Spam without its verdict, so a
		// failed write leaves the mail in the inbox and screen() reports false.
		await c.env.db.batch([
			c.env.db.prepare('UPDATE email SET is_spam = 1 WHERE email_id = ?').bind(emailId),
			c.env.db.prepare(
				`INSERT INTO psg_spam_verdict (email_id, source, confidence, reason) VALUES (?, 'ai', ?, ?)
				 ON CONFLICT(email_id) DO UPDATE SET confidence = excluded.confidence, reason = excluded.reason`
			).bind(emailId, verdict.confidence, verdict.reason),
		]);
	},

	async verdict(c, emailId) {
		try {
			return await c.env.db.prepare(
				'SELECT source, confidence, reason, created_at AS createTime FROM psg_spam_verdict WHERE email_id = ?'
			).bind(emailId).first() || null;
		} catch {
			return null;
		}
	},

	// "Not spam": forget the verdicts and trust the senders for each mail's
	// owner — the user its future deliveries are screened as.
	async trustSenders(c, emailIds) {
		if (!emailIds.length) return;
		const placeholders = emailIds.map(() => '?').join(',');
		try {
			await c.env.db.prepare(`DELETE FROM psg_spam_verdict WHERE email_id IN (${placeholders})`).bind(...emailIds).run();
		} catch {}
		let rows = [];
		try {
			({ results: rows } = await c.env.db.prepare(
				`SELECT DISTINCT user_id, send_email FROM email WHERE email_id IN (${placeholders}) AND type = 0`
			).bind(...emailIds).all());
		} catch {}
		for (const row of rows || []) {
			const sender = normalizeAddress(row.send_email);
			if (!sender) continue;
			try {
				await c.env.db.prepare('INSERT OR IGNORE INTO psg_spam_allow (user_id, sender) VALUES (?, ?)')
					.bind(row.user_id, sender).run();
			} catch {}
		}
	},
};

export default spamService;
