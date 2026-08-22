import dayjs from 'dayjs';
import BizError from '../error/biz-error';
import accountService from './account-service';
import emailService from './email-service';
import settingService from './setting-service';
import userService from './user-service';
import emailUtils from '../utils/email-utils';
import verifyUtils from '../utils/verify-utils';

const VERIFICATION_TTL_SECONDS = 15 * 60;
const RESEND_COOLDOWN_SECONDS = 60;
const MAX_VERIFICATION_ATTEMPTS = 5;
const MAX_DELIVERY_ATTEMPTS = 5;
const DEFAULT_BACKOFF_SECONDS = [60, 5 * 60, 30 * 60, 2 * 60 * 60, 6 * 60 * 60];

const STATUS = {
	PENDING: 'pending',
	VERIFIED: 'verified',
	ENABLED: 'enabled',
	DISABLED: 'disabled',
	BLOCKED: 'blocked',
};

function contextOf(c) {
	return c?.env ? c : { env: c };
}

function normalizeEmail(value) {
	return String(value || '').trim().toLowerCase();
}

function maskEmail(email) {
	const [local, domain] = email.split('@');
	if (!local || !domain) return email;
	const visible = local.length <= 2 ? local.slice(0, 1) : local.slice(0, 2);
	return `${visible}${'*'.repeat(Math.max(2, local.length - visible.length))}@${domain}`;
}

function nowSql() {
	return dayjs().format('YYYY-MM-DD HH:mm:ss');
}

function parseDomains(value) {
	return String(value || '')
		.split(/[\s,，]+/)
		.map(item => item.trim().toLowerCase().replace(/^@/, ''))
		.filter(Boolean);
}

function domainOf(email) {
	return normalizeEmail(email).split('@')[1] || '';
}

function randomCode() {
	const bytes = new Uint32Array(1);
	crypto.getRandomValues(bytes);
	return String(100000 + (bytes[0] % 900000));
}

function isPublicAppUrl(value) {
	try {
		const url = new URL(String(value || '').trim());
		return url.protocol === 'https:' || url.protocol === 'http:';
	} catch {
		return false;
	}
}

async function sha256(value) {
	const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
	return Array.from(new Uint8Array(buffer)).map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function secretFor(c) {
	return c.env.jwt_secret || c.env.forwarding_secret || 'psg-mail-forwarding-development-secret';
}

async function hashCode(c, userId, targetEmail, code) {
	return sha256(`${secretFor(c)}:${userId}:${targetEmail}:${code}`);
}

function escapeHtml(value) {
	return String(value ?? '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function encodeBase64(value) {
	const bytes = new TextEncoder().encode(value);
	let binary = '';
	for (let i = 0; i < bytes.length; i += 0x8000) {
		binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	}
	return btoa(binary);
}

function mapForwarding(row) {
	if (!row) return null;
	return {
		id: row.id,
		targetEmail: row.target_email,
		maskedEmail: maskEmail(row.target_email),
		status: row.status,
		mode: row.mode,
		includeAttachments: !!row.include_attachments,
		verifiedAt: row.verified_at || null,
		createdAt: row.created_at || null,
		updatedAt: row.updated_at || null,
		lastError: row.last_error || '',
	};
}

const forwardingService = {
	async policy(c) {
		const setting = await settingService.query(contextOf(c));
		const allowedDomains = parseDomains(setting.forwardAllowedDomains);
		const internalDomains = (setting.domainList || []).map(item => String(item).replace(/^@/, '').toLowerCase());
		return {
			allowPersonalForward: Number(setting.allowPersonalForward) === 1,
			allowForwardNotification: Number(setting.allowForwardNotification) === 1,
			allowForwardFullCopy: Number(setting.allowForwardFullCopy) === 1,
			allowForwardAttachments: Number(setting.allowForwardAttachments) === 1,
			forwardMaxAddresses: Math.min(20, Math.max(1, Number(setting.forwardMaxAddresses) || 3)),
			forwardAllowedDomains: allowedDomains,
			publicAppUrl: String(setting.publicAppUrl || '').trim(),
			internalDomains,
		};
	},

	validateTarget(c, targetEmail, policy) {
		const target = normalizeEmail(targetEmail);
		if (!verifyUtils.isEmail(target)) throw new BizError('请输入有效的外部邮箱地址', 400);
		if (policy.internalDomains.includes(domainOf(target))) {
			throw new BizError('个人转发目标必须是外部邮箱', 400);
		}
		if (policy.forwardAllowedDomains.length && !policy.forwardAllowedDomains.includes(domainOf(target))) {
			throw new BizError('该邮箱域名不在管理员允许范围内', 403);
		}
		return target;
	},

	async query(c, userId) {
		const policy = await this.policy(c);
		const { results } = await c.env.db.prepare(
			`SELECT id, target_email, status, mode, include_attachments,
				verified_at, created_at, updated_at, last_error
			 FROM personal_forwarding WHERE user_id = ? ORDER BY created_at DESC, id DESC`
		).bind(userId).all();
		return {
			policy: {
				allowPersonalForward: policy.allowPersonalForward,
				allowForwardNotification: policy.allowForwardNotification,
				allowForwardFullCopy: policy.allowForwardFullCopy,
				allowForwardAttachments: policy.allowForwardAttachments,
				forwardMaxAddresses: policy.forwardMaxAddresses,
				publicAppUrlConfigured: isPublicAppUrl(policy.publicAppUrl),
			},
			items: results.map(mapForwarding),
		};
	},

	async getOwned(c, userId, id) {
		return c.env.db.prepare(
			`SELECT * FROM personal_forwarding WHERE id = ? AND user_id = ? LIMIT 1`
		).bind(Number(id), userId).first();
	},

	async sendExternal(c, { userId, targetEmail, subject, text, html, attachments = [] }) {
		const ctx = contextOf(c);
		const setting = await settingService.query(ctx);
		const user = await userService.selectById(ctx, userId);
		const sender = user && await accountService.selectByEmailIncludeDel(ctx, user.email);
		if (!sender) throw new BizError('当前用户没有可用的 PSG Mail 发件地址', 503);

		const domain = emailUtils.getDomain(sender.email);
		const token = setting.resendTokens?.[domain];
		const useCloudflareEmail = !!ctx.env.email;
		if (!useCloudflareEmail && !token) throw new BizError('发信服务未配置，暂时无法发送转发验证或通知', 503);

		const params = {
			name: sender.name || emailUtils.getName(sender.email),
			accountEmail: sender.email,
			receiveEmail: [targetEmail],
			subject,
			text,
			html,
			attachments,
		};
		const response = useCloudflareEmail
			? await emailService.sendByCloudflareEmail(ctx, params)
			: await emailService.sendByResend(token, params);
		if (response?.error) throw new BizError(response.error.message || '转发邮件发送失败', 502);
		return response?.data || {};
	},

	async issueVerification(c, row, userId) {
		const code = randomCode();
		const target = row.target_email;
		const verificationHash = await hashCode(c, userId, target, code);
		const expiresAt = dayjs().add(VERIFICATION_TTL_SECONDS, 'second').format('YYYY-MM-DD HH:mm:ss');
		const sentAt = nowSql();
		await c.env.db.prepare(
			`UPDATE personal_forwarding
			 SET status = 'pending', verification_hash = ?, verification_expires_at = ?,
			 verification_sent_at = ?, verification_attempts = 0, verified_at = NULL,
			 last_error = '', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?`
		).bind(verificationHash, expiresAt, sentAt, row.id, userId).run();

		try {
			const subject = 'PSG Mail 转发邮箱验证';
			const text = `你正在为 PSG Mail 设置个人转发地址：${target}\n\n验证码：${code}\n\n验证码 15 分钟内有效。如果不是你本人操作，请忽略此邮件。`;
			const html = `<div style="font-family:Arial,sans-serif;line-height:1.7;color:#202622"><p>你正在为 PSG Mail 设置个人转发地址：</p><p><strong>${escapeHtml(target)}</strong></p><p style="font-size:28px;letter-spacing:.25em;font-weight:700">${code}</p><p>验证码 15 分钟内有效。如果不是你本人操作，请忽略此邮件。</p></div>`;
			await this.sendExternal(c, { userId, targetEmail: target, subject, text, html });
		} catch (error) {
			await c.env.db.prepare(
				`UPDATE personal_forwarding SET last_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?`
			).bind(String(error?.message || 'verification delivery failed').slice(0, 500), row.id, userId).run();
			throw error;
		}
	},

	async add(c, userId, targetEmail) {
		const policy = await this.policy(c);
		if (!policy.allowPersonalForward) throw new BizError('管理员暂未开放个人转发', 403);
		const target = this.validateTarget(c, targetEmail, policy);
		const countRow = await c.env.db.prepare(
			`SELECT COUNT(*) AS total FROM personal_forwarding WHERE user_id = ? AND status != 'blocked'`
		).bind(userId).first();
		const existing = await c.env.db.prepare(
			`SELECT * FROM personal_forwarding WHERE user_id = ? AND target_email = ? LIMIT 1`
		).bind(userId, target).first();
		if (!existing && Number(countRow?.total || 0) >= policy.forwardMaxAddresses) {
			throw new BizError(`最多只能设置 ${policy.forwardMaxAddresses} 个个人转发地址`, 400);
		}
		if (existing?.status === STATUS.ENABLED) throw new BizError('该转发地址已经启用', 400);
		if (existing?.verification_sent_at) {
			const seconds = dayjs().diff(dayjs(existing.verification_sent_at), 'second');
			if (seconds < RESEND_COOLDOWN_SECONDS) {
				throw new BizError(`请等待 ${RESEND_COOLDOWN_SECONDS - seconds} 秒后再发送验证码`, 429);
			}
		}

		if (existing) {
			await c.env.db.prepare(
				`UPDATE personal_forwarding SET mode = 'notification', include_attachments = 0,
				status = 'pending', last_error = '', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?`
			).bind(existing.id, userId).run();
		} else {
			await c.env.db.prepare(
				`INSERT INTO personal_forwarding (user_id, target_email, status, mode, include_attachments)
				 VALUES (?, ?, 'pending', 'notification', 0)`
			).bind(userId, target).run();
		}
		const row = await c.env.db.prepare(
			`SELECT * FROM personal_forwarding WHERE user_id = ? AND target_email = ? LIMIT 1`
		).bind(userId, target).first();
		await this.issueVerification(c, row, userId);
		return mapForwarding({ ...row, status: STATUS.PENDING, mode: 'notification', include_attachments: 0 });
	},

	async resend(c, userId, id) {
		const row = await this.getOwned(c, userId, id);
		if (!row) throw new BizError('转发地址不存在', 404);
		const policy = await this.policy(c);
		if (!policy.allowPersonalForward) throw new BizError('管理员暂未开放个人转发', 403);
		if (row.status === STATUS.ENABLED) throw new BizError('已启用的转发地址无需重复验证', 400);
		if (row.verification_sent_at) {
			const seconds = dayjs().diff(dayjs(row.verification_sent_at), 'second');
			if (seconds < RESEND_COOLDOWN_SECONDS) throw new BizError(`请等待 ${RESEND_COOLDOWN_SECONDS - seconds} 秒后再发送验证码`, 429);
		}
		await this.issueVerification(c, row, userId);
		return mapForwarding({ ...row, status: STATUS.PENDING });
	},

	async verify(c, userId, id, code) {
		const row = await this.getOwned(c, userId, id);
		if (!row) throw new BizError('转发地址不存在', 404);
		if (row.status !== STATUS.PENDING) throw new BizError('当前转发地址不需要验证', 400);
		if (Number(row.verification_attempts) >= MAX_VERIFICATION_ATTEMPTS) throw new BizError('验证码尝试次数过多，请重新发送验证码', 429);
		if (!row.verification_expires_at || dayjs().isAfter(dayjs(row.verification_expires_at))) throw new BizError('验证码已过期，请重新发送', 400);
		const normalizedCode = String(code || '').trim();
		const expected = await hashCode(c, userId, row.target_email, normalizedCode);
		if (!/^\d{6}$/.test(normalizedCode) || expected !== row.verification_hash) {
			await c.env.db.prepare(
				`UPDATE personal_forwarding SET verification_attempts = verification_attempts + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?`
			).bind(row.id, userId).run();
			throw new BizError('验证码不正确', 400);
		}
		await c.env.db.prepare(
			`UPDATE personal_forwarding SET status = 'verified', verification_hash = '',
			 verification_expires_at = NULL, verification_attempts = 0, verified_at = CURRENT_TIMESTAMP,
			 last_error = '', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?`
		).bind(row.id, userId).run();
		return mapForwarding({ ...row, status: STATUS.VERIFIED, verified_at: nowSql(), last_error: '' });
	},

	async update(c, userId, id, body = {}) {
		const row = await this.getOwned(c, userId, id);
		if (!row) throw new BizError('转发地址不存在', 404);
		const policy = await this.policy(c);
		const mode = body.mode === 'full_copy' ? 'full_copy' : (body.mode === 'notification' ? 'notification' : row.mode);
		const includeAttachments = body.includeAttachments === undefined ? !!row.include_attachments : !!body.includeAttachments;
		const wantsEnabled = body.enabled === true;
		const isDisabling = body.enabled === false;
		// Configuration changes are policy-checked too. Otherwise an enabled
		// notification rule could be changed to an unapproved full-copy rule by
		// omitting `enabled`, and an attachment flag could be stored for later.
		if (!isDisabling && mode === 'full_copy' && !policy.allowForwardFullCopy) {
			throw new BizError('管理员未开放完整副本转发', 403);
		}
		if (!isDisabling && includeAttachments && (!policy.allowForwardAttachments || mode !== 'full_copy')) {
			throw new BizError('附件转发未被管理员允许', 403);
		}
		if (wantsEnabled) {
			if (row.status !== STATUS.VERIFIED && row.status !== STATUS.ENABLED) throw new BizError('请先完成邮箱验证', 400);
			if (!policy.allowPersonalForward) throw new BizError('管理员暂未开放个人转发', 403);
			if (mode === 'notification' && (!policy.allowForwardNotification || !isPublicAppUrl(policy.publicAppUrl))) {
				throw new BizError(!isPublicAppUrl(policy.publicAppUrl) ? '管理员尚未配置有效的 PSG Mail 公共访问地址' : '管理员已关闭通知转发', 403);
			}
			if (mode === 'full_copy' && !policy.allowForwardFullCopy) throw new BizError('管理员未开放完整副本转发', 403);
			if (includeAttachments && (!policy.allowForwardAttachments || mode !== 'full_copy')) throw new BizError('附件转发未被管理员允许', 403);
		}
		const status = wantsEnabled ? STATUS.ENABLED : (isDisabling ? STATUS.DISABLED : row.status);
		await c.env.db.prepare(
			`UPDATE personal_forwarding SET status = ?, mode = ?, include_attachments = ?, last_error = '', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?`
		).bind(status, mode, includeAttachments ? 1 : 0, row.id, userId).run();
		const updated = await this.getOwned(c, userId, id);
		return mapForwarding(updated);
	},

	async remove(c, userId, id) {
		const row = await this.getOwned(c, userId, id);
		if (!row) return;
		await c.env.db.batch([
			c.env.db.prepare('DELETE FROM forward_delivery_log WHERE forwarding_id = ?').bind(row.id),
			c.env.db.prepare('DELETE FROM personal_forwarding WHERE id = ? AND user_id = ?').bind(row.id, userId),
		]);
	},

	assertAdmin(c) {
		const user = c.get?.('user');
		if (!user || String(user.email).toLowerCase() !== String(c.env.admin || '').toLowerCase()) {
			throw new BizError('权限不足', 403);
		}
	},

	async adminQuery(c) {
		this.assertAdmin(c);
		const { results } = await c.env.db.prepare(
			`SELECT f.id, f.user_id, u.email AS user_email, f.target_email, f.status, f.mode,
				f.include_attachments, f.verified_at, f.created_at, f.updated_at, f.last_error,
				(SELECT a.email FROM account a WHERE a.user_id = f.user_id AND a.is_del = 0 ORDER BY a.sort DESC, a.account_id ASC LIMIT 1) AS account_email
			 FROM personal_forwarding f
			 LEFT JOIN user u ON u.user_id = f.user_id
			 ORDER BY f.updated_at DESC, f.id DESC LIMIT 500`
		).all();
		return results.map(row => ({
			id: row.id,
			userId: row.user_id,
			userEmail: row.user_email || '',
			accountEmail: row.account_email || '',
			targetEmail: row.target_email,
			maskedEmail: maskEmail(row.target_email),
			status: row.status,
			mode: row.mode,
			includeAttachments: !!row.include_attachments,
			verifiedAt: row.verified_at,
			createdAt: row.created_at,
			updatedAt: row.updated_at,
			lastError: row.last_error || '',
		}));
	},

	async adminSetStatus(c, id, enabled) {
		this.assertAdmin(c);
		if (enabled) throw new BizError('管理员只能停用个人转发，重新启用需用户完成验证', 400);
		await c.env.db.prepare(
			`UPDATE personal_forwarding SET status = 'blocked', last_error = '管理员已停用', updated_at = CURRENT_TIMESTAMP WHERE id = ?`
		).bind(Number(id)).run();
		return { id: Number(id), status: STATUS.BLOCKED };
	},

	async createDeliveryLog(c, forwardingId, emailRow) {
		const result = await c.env.db.prepare(
			`INSERT OR IGNORE INTO forward_delivery_log
			 (forwarding_id, source_email_id, source_message_id, status)
			 VALUES (?, ?, ?, 'pending')`
		).bind(forwardingId, emailRow.emailId, emailRow.messageId || '').run();
		return c.env.db.prepare(
			`SELECT * FROM forward_delivery_log WHERE forwarding_id = ? AND source_email_id = ? LIMIT 1`
		).bind(forwardingId, emailRow.emailId).first();
	},

	async deliver(c, rule, emailRow, userId) {
		const policy = await this.policy(c);
		if (rule.mode === 'notification') {
			if (!policy.allowPersonalForward || !policy.allowForwardNotification) throw new BizError('管理员已关闭通知转发', 503);
			if (!isPublicAppUrl(policy.publicAppUrl)) throw new BizError('管理员尚未配置有效的 PSG Mail 公共访问地址', 503);
			const base = policy.publicAppUrl.replace(/\/$/, '');
			const link = `${base}/inbox?openEmail=${encodeURIComponent(emailRow.emailId)}`;
			const subject = `新邮件：${emailRow.subject || '无主题'}`;
			const text = [
				'你有一封新的 PSG Mail 邮件。',
				`发件人：${emailRow.name || emailRow.sendEmail || ''} <${emailRow.sendEmail || ''}>`,
				`主题：${emailRow.subject || '无主题'}`,
				`时间：${emailRow.createTime || emailRow.create_time || nowSql()}`,
				`打开 PSG Mail：${link}`,
			].join('\n');
			const html = `<div style="font-family:Arial,sans-serif;line-height:1.7;color:#202622"><p>你有一封新的 PSG Mail 邮件。</p><p><strong>发件人：</strong>${escapeHtml(emailRow.name || '')} &lt;${escapeHtml(emailRow.sendEmail || '')}&gt;</p><p><strong>主题：</strong>${escapeHtml(emailRow.subject || '无主题')}</p><p><strong>时间：</strong>${escapeHtml(emailRow.createTime || emailRow.create_time || nowSql())}</p><p><a href="${escapeHtml(link)}">打开 PSG Mail</a></p></div>`;
			return this.sendExternal(c, { userId, targetEmail: rule.target_email, subject, text, html });
		}

		if (!policy.allowPersonalForward || !policy.allowForwardFullCopy) throw new BizError('管理员已关闭完整副本转发', 503);
		if (rule.include_attachments && !policy.allowForwardAttachments) throw new BizError('附件转发未被管理员允许', 503);
		const subject = `转发：${emailRow.subject || '无主题'}`;
		if (!rule.include_attachments) {
			return this.sendExternal(c, {
				userId,
				targetEmail: rule.target_email,
				subject,
				text: emailRow.text || '',
				html: emailRow.content || `<pre>${escapeHtml(emailRow.text || '')}</pre>`,
			});
		}
		const { filename, content } = await emailService.buildEml(contextOf(c), emailRow.emailId, userId);
		return this.sendExternal(c, {
			userId,
			targetEmail: rule.target_email,
			subject,
			text: 'PSG Mail 完整邮件副本请见附件。原邮件仍保留在 PSG Mail。',
			html: '<p>PSG Mail 完整邮件副本请见附件。原邮件仍保留在 PSG Mail。</p>',
			attachments: [{
				filename: filename || `psg-mail-${emailRow.emailId}.eml`,
				mimeType: 'message/rfc822',
				content: encodeBase64(content),
			}],
		});
	},

	async deliverLog(c, log, rule, emailRow, userId) {
		if (!log || log.status === 'sent' || log.status === 'skipped') return;
		if (Number(log.attempt_count) >= MAX_DELIVERY_ATTEMPTS) return;
		const nextAttempt = Number(log.attempt_count) + 1;
		const claim = await c.env.db.prepare(
			`UPDATE forward_delivery_log SET status = 'sending', attempt_count = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status IN ('pending','failed')`
		).bind(nextAttempt, log.id).run();
		const changes = claim?.meta?.changes ?? claim?.changes;
		if (changes !== undefined && Number(changes) === 0) return;
		try {
			const result = await this.deliver(c, rule, emailRow, userId);
			await c.env.db.prepare(
				`UPDATE forward_delivery_log SET status = 'sent', provider_message_id = ?, last_error = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
			).bind(result?.id || null, log.id).run();
		} catch (error) {
			const delay = DEFAULT_BACKOFF_SECONDS[Math.min(nextAttempt - 1, DEFAULT_BACKOFF_SECONDS.length - 1)];
			const nextAt = dayjs().add(delay, 'second').format('YYYY-MM-DD HH:mm:ss');
			await c.env.db.prepare(
				`UPDATE forward_delivery_log SET status = 'failed', next_attempt_at = ?, last_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
			).bind(nextAt, String(error?.message || 'forwarding delivery failed').slice(0, 500), log.id).run();
			console.error('personal forwarding delivery failed', rule.id, emailRow.emailId, error?.message || error);
		}
	},

	async dispatchIncoming(c, accountRow, emailRow) {
		if (!accountRow?.userId || !emailRow?.emailId) return;
		const rows = await c.env.db.prepare(
			`SELECT * FROM personal_forwarding WHERE user_id = ? AND status = 'enabled' ORDER BY id ASC`
		).bind(accountRow.userId).all();
		for (const rule of rows.results || []) {
			if (policyTargetIsInternal(await this.policy(c), rule.target_email)) continue;
			const log = await this.createDeliveryLog(c, rule.id, emailRow);
			await this.deliverLog(c, log, rule, accountRow.userId);
		}
	},

	async processDue(c) {
		const { results } = await c.env.db.prepare(
			`SELECT l.*, f.user_id, f.target_email, f.status AS forwarding_status, f.mode, f.include_attachments,
				e.message_id, e.email_id, e.user_id AS email_user_id, e.account_id, e.send_email,
				e.name, e.subject, e.create_time, e.text, e.content
			 FROM forward_delivery_log l
			 JOIN personal_forwarding f ON f.id = l.forwarding_id
			 JOIN email e ON e.email_id = l.source_email_id
			 WHERE l.status = 'failed' AND f.status = 'enabled'
			   AND l.attempt_count < ? AND (l.next_attempt_at IS NULL OR l.next_attempt_at <= CURRENT_TIMESTAMP)
			 ORDER BY l.next_attempt_at ASC, l.id ASC LIMIT 50`
		).bind(MAX_DELIVERY_ATTEMPTS).all();
		for (const row of results || []) {
			const emailRow = {
				emailId: row.email_id,
				messageId: row.message_id,
				accountId: row.account_id,
				userId: row.email_user_id,
				sendEmail: row.send_email,
				name: row.name,
				subject: row.subject,
				createTime: row.create_time,
				text: row.text,
				content: row.content,
			};
			await this.deliverLog(c, row, row, emailRow, row.user_id);
		}
	},
};

function policyTargetIsInternal(policy, targetEmail) {
	return policy.internalDomains.includes(domainOf(targetEmail));
}

export { STATUS as forwardingStatus, mapForwarding };
export default forwardingService;
