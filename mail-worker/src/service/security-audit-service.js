import reqUtils from '../utils/req-utils';

// Append-only security event log (table from migrations/0013). Never throws:
// a missing table (migration not applied yet) or a D1 hiccup must not turn a
// successful login/logout into a failed one. Never log secrets — `detail` is
// for ids, counts and reasons only.
export const SecurityEvent = {
	LOGIN_SUCCESS: 'login.success',
	LOGIN_FAIL: 'login.fail',
	LOGIN_RATE_LIMITED: 'login.rate_limited',
	PASSWORD_REHASH: 'password.rehash',
	PASSWORD_CHANGE: 'password.change',
	PASSWORD_ADMIN_SET: 'password.admin_set',
	LOGOUT: 'session.logout',
	SESSION_REVOKE: 'session.revoke',
	SESSION_REVOKE_OTHERS: 'session.revoke_others',
	SESSION_ADMIN_REVOKE: 'session.admin_revoke',
	ATTACHMENT_DENIED: 'attachment.denied',
	WEBHOOK_REJECTED: 'webhook.rejected',
	OAUTH_BIND: 'oauth.bind',
	MAILBOX_BIND_FAIL: 'mailbox.bind_fail',
	PUBLIC_TOKEN: 'public.gen_token',
};

const securityAuditService = {

	async log(c, event, { userId = 0, detail = null } = {}) {
		try {
			let ip = '';
			let ua = '';
			try {
				ip = reqUtils.getIp(c);
				ua = (c.req?.header('user-agent') || '').slice(0, 256);
			} catch { /* non-request context (cron/email) */ }
			await c.env.db.prepare(
				`INSERT INTO security_audit_log (user_id, event, ip, user_agent, detail) VALUES (?, ?, ?, ?, ?)`
			).bind(Number(userId) || 0, event, ip, ua, detail ? JSON.stringify(detail).slice(0, 2000) : null).run();
		} catch (e) {
			console.warn('security audit log write skipped:', e?.message);
		}
	},

	// Daily cron. SECURITY_LOG_RETENTION_DAYS (default 180, min 30).
	async prune(c) {
		const days = Math.max(30, Number(c.env.SECURITY_LOG_RETENTION_DAYS) || 180);
		try {
			await c.env.db.prepare(`DELETE FROM security_audit_log WHERE create_time < datetime('now', ?)`)
				.bind(`-${days} days`).run();
		} catch (e) {
			console.warn('security audit prune skipped:', e?.message);
		}
	},

	async listByUser(c, userId, limit = 50) {
		try {
			const { results } = await c.env.db.prepare(
				`SELECT id, event, ip, user_agent AS userAgent, detail, create_time AS createTime
				 FROM security_audit_log WHERE user_id = ? ORDER BY id DESC LIMIT ?`
			).bind(userId, Math.min(Number(limit) || 50, 200)).all();
			return results;
		} catch {
			return [];
		}
	}
};

export default securityAuditService;
