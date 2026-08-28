import { connect } from 'cloudflare:sockets';
import dayjs from 'dayjs';
import BizError from '../error/biz-error';
import settingService from './setting-service';
import verifyUtils from '../utils/verify-utils';

export const ALIBABA_DIRECTMAIL = Object.freeze({
	provider: 'alibaba_directmail',
	defaultRegion: 'cn-hangzhou',
	defaultRegionName: '华东1（杭州）',
	defaultHost: 'smtpdm.aliyun.com',
	defaultPort: 465,
	defaultEncryption: 'SSL/TLS',
	defaultSenderName: 'PSG Mail Notifications',
	defaultDailyQuota: 2000,
	defaultMonthlyQuota: 60000,
});

const PASSWORD_MASK = '••••••••••••••••';
const SMTP_TIMEOUT_MS = 15_000;
const DELIVERY_LOG_ENSURE = `CREATE TABLE IF NOT EXISTS notification_delivery_log (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	user_id INTEGER NOT NULL DEFAULT 0,
	provider TEXT NOT NULL DEFAULT 'alibaba_directmail',
	event_type TEXT NOT NULL DEFAULT 'external_email',
	recipient TEXT NOT NULL DEFAULT '',
	status TEXT NOT NULL DEFAULT 'attempted',
	provider_message_id TEXT,
	smtp_result TEXT,
	created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`;

class SmtpError extends Error {
	constructor(message, smtpCode = null, smtpResponse = '') {
		super(message);
		this.name = 'SmtpError';
		this.smtpCode = smtpCode == null ? null : Number(smtpCode);
		this.smtpResponse = sanitizeSmtpText(smtpResponse);
		this.retryable = this.smtpCode == null || (this.smtpCode >= 400 && this.smtpCode < 500);
	}
}

function contextOf(c) {
	return c?.env ? c : { env: c };
}

function sanitizeSmtpText(value) {
	return String(value ?? '')
		.replace(/[\r\n]+/g, ' ')
		.replace(/\s+/g, ' ')
		.slice(0, 500);
}

function sanitizeHeader(value) {
	return String(value ?? '').replace(/[\r\n]+/g, ' ').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ');
}

function escapeHtml(value) {
	return String(value ?? '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function utf8Base64(value) {
	const bytes = new TextEncoder().encode(String(value ?? ''));
	let binary = '';
	for (let i = 0; i < bytes.length; i += 0x8000) {
		binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	}
	return btoa(binary);
}

function wrappedBase64(value) {
	return utf8Base64(value).replace(/(.{76})/g, '$1\r\n');
}

function encodeMimeHeader(value) {
	const clean = sanitizeHeader(value);
	return /^[\x00-\x7F]*$/.test(clean) ? clean : `=?UTF-8?B?${utf8Base64(clean)}?=`;
}

function normalizeBody(value) {
	return String(value ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n/g, '\r\n');
}

function quotedAddress(email, name = '') {
	const safeEmail = sanitizeHeader(email);
	const safeName = sanitizeHeader(name);
	return safeName ? `${encodeMimeHeader(safeName)} <${safeEmail}>` : `<${safeEmail}>`;
}

function randomBoundary() {
	const webCrypto = globalThis.crypto;
	const suffix = typeof webCrypto?.randomUUID === 'function'
		? webCrypto.randomUUID().replace(/-/g, '')
		: `${Date.now()}${Math.random().toString(16).slice(2)}`;
	return `=_PSG_MAIL_${suffix}`;
}

export function buildMimeMessage({ fromEmail, fromName, recipient, subject, text, html }) {
	const boundary = randomBoundary();
	const plainText = normalizeBody(text);
	const htmlBody = normalizeBody(html || `<pre>${escapeHtml(text)}</pre>`);
	const lines = [
		`Date: ${new Date().toUTCString()}`,
		`From: ${quotedAddress(fromEmail, fromName)}`,
		`To: ${sanitizeHeader(recipient)}`,
		`Subject: ${encodeMimeHeader(subject)}`,
		'MIME-Version: 1.0',
		`Content-Type: multipart/alternative; boundary="${boundary}"`,
		'',
		`--${boundary}`,
		'Content-Type: text/plain; charset=UTF-8',
		'Content-Transfer-Encoding: base64',
		'',
		wrappedBase64(plainText),
		`--${boundary}`,
		'Content-Type: text/html; charset=UTF-8',
		'Content-Transfer-Encoding: base64',
		'',
		wrappedBase64(htmlBody),
		`--${boundary}--`,
		'',
	];
	return lines.join('\r\n');
}

function normalizeQuota(value, fallback) {
	const number = Number(value);
	return Number.isFinite(number) ? Math.min(100_000_000, Math.max(0, Math.round(number))) : fallback;
}

function normalizePort(value, fallback) {
	const number = Number(value);
	return Number.isInteger(number) && number >= 1 && number <= 65535 ? number : fallback;
}

function configuredValue(setting, key, fallback) {
	return setting[key] === undefined || setting[key] === null ? fallback : setting[key];
}

export function getConfig(setting = {}) {
	return {
		...ALIBABA_DIRECTMAIL,
		region: String(configuredValue(setting, 'alibabaDirectmailRegionId', ALIBABA_DIRECTMAIL.defaultRegion)).trim(),
		regionName: String(configuredValue(setting, 'alibabaDirectmailRegionName', ALIBABA_DIRECTMAIL.defaultRegionName)).trim(),
		host: String(configuredValue(setting, 'alibabaDirectmailSmtpHost', ALIBABA_DIRECTMAIL.defaultHost)).trim(),
		port: normalizePort(configuredValue(setting, 'alibabaDirectmailSmtpPort', ALIBABA_DIRECTMAIL.defaultPort), ALIBABA_DIRECTMAIL.defaultPort),
		encryption: String(configuredValue(setting, 'alibabaDirectmailEncryption', ALIBABA_DIRECTMAIL.defaultEncryption)).trim(),
		senderEmail: String(setting.alibabaDirectmailSenderEmail || '').trim().toLowerCase(),
		smtpPassword: String(setting.alibabaDirectmailSmtpPassword || ''),
		senderName: String(setting.alibabaDirectmailSenderName || ALIBABA_DIRECTMAIL.defaultSenderName).trim() || ALIBABA_DIRECTMAIL.defaultSenderName,
		dailyQuota: normalizeQuota(setting.alibabaDirectmailDailyQuota, ALIBABA_DIRECTMAIL.defaultDailyQuota),
		monthlyQuota: normalizeQuota(setting.alibabaDirectmailMonthlyQuota, ALIBABA_DIRECTMAIL.defaultMonthlyQuota),
	};
}

export function isConfigured(config) {
	return !!(
		config &&
		verifyUtils.isEmail(config.senderEmail) &&
		config.smtpPassword &&
		config.smtpPassword !== PASSWORD_MASK &&
		config.region &&
		config.regionName &&
		config.host &&
		Number.isInteger(config.port) &&
		config.port >= 1 &&
		config.port <= 65535 &&
		config.encryption === 'SSL/TLS'
	);
}

function requireConfigured(config) {
	if (!isConfigured(config)) {
		const error = new BizError('阿里云邮件推送尚未配置发信地址和 SMTP 密码', 503);
		error.retryable = false;
		throw error;
	}
}

function validateRecipient(recipient) {
	const value = String(recipient || '').trim().toLowerCase();
	if (!verifyUtils.isEmail(value)) {
		const error = new BizError('请输入有效的测试接收邮箱', 400);
		error.retryable = false;
		throw error;
	}
	return value;
}

async function withTimeout(promise, action) {
	let timer;
	try {
		return await Promise.race([
			promise,
			new Promise((_, reject) => {
				timer = setTimeout(() => reject(new SmtpError(`SMTP ${action} timeout`)), SMTP_TIMEOUT_MS);
			}),
		]);
	} finally {
		if (timer) clearTimeout(timer);
	}
}

function responseReader(reader) {
	let buffer = '';
	const decoder = new TextDecoder();

	return async function readResponse() {
		const lines = [];
		while (true) {
			const end = buffer.indexOf('\r\n');
			if (end >= 0) {
				const line = buffer.slice(0, end);
				buffer = buffer.slice(end + 2);
				lines.push(line);
				const match = /^(\d{3})([ -])/.exec(line);
				if (match && match[2] === ' ') {
					return { code: Number(match[1]), text: lines.join(' ') };
				}
				continue;
			}

			const { value, done } = await withTimeout(reader.read(), 'read');
			if (done) throw new SmtpError('SMTP connection closed unexpectedly');
			buffer += decoder.decode(value, { stream: true });
		}
	};
}

async function writeLine(writer, value) {
	await withTimeout(writer.write(new TextEncoder().encode(`${value}\r\n`)), 'write');
}

async function writeData(writer, value) {
	await withTimeout(writer.write(new TextEncoder().encode(value)), 'write message');
}

async function expectResponse(readResponse, expected, action) {
	const response = await readResponse();
	if (!expected.includes(response.code)) {
		throw new SmtpError(`SMTP ${action} failed (${response.code})`, response.code, response.text);
	}
	return response;
}

function dotStuff(value) {
	return value.replace(/(^|\r\n)\./g, '$1..');
}

function providerMessageId(response) {
	const text = String(response || '');
	const queued = text.match(/queued as\s+([^\s]+)/i);
	return queued?.[1] || null;
}

async function smtpSession(config, message = null) {
	let socket;
	let writer;
	let reader;
	try {
		socket = connect({ hostname: config.host, port: config.port }, { secureTransport: 'on' });
		await withTimeout(socket.opened, 'connection');
		writer = socket.writable.getWriter();
		reader = socket.readable.getReader();
		const readResponse = responseReader(reader);

		await expectResponse(readResponse, [220], 'greeting');
		await writeLine(writer, 'EHLO psg-mail.local');
		await expectResponse(readResponse, [250], 'EHLO');
		await writeLine(writer, 'AUTH LOGIN');
		await expectResponse(readResponse, [334], 'AUTH LOGIN');
		await writeLine(writer, utf8Base64(config.senderEmail));
		await expectResponse(readResponse, [334], 'SMTP username');
		await writeLine(writer, utf8Base64(config.smtpPassword));
		await expectResponse(readResponse, [235], 'SMTP authentication');

		if (!message) return { response: 'authenticated', messageId: null };

		await writeLine(writer, `MAIL FROM:<${config.senderEmail}>`);
		await expectResponse(readResponse, [250], 'MAIL FROM');
		await writeLine(writer, `RCPT TO:<${message.recipient}>`);
		await expectResponse(readResponse, [250], 'RCPT TO');
		await writeLine(writer, 'DATA');
		await expectResponse(readResponse, [354], 'DATA');
		await writeData(writer, `${dotStuff(message.mime)}\r\n.\r\n`);
		const accepted = await expectResponse(readResponse, [250], 'message submission');
		return { response: accepted.text, messageId: providerMessageId(accepted.text) };
	} catch (error) {
		if (error instanceof SmtpError) throw error;
		throw new SmtpError('SMTP connection failed');
	} finally {
		try { writer?.releaseLock(); } catch {}
		try { reader?.releaseLock(); } catch {}
		try { await socket?.close?.(); } catch {}
	}
}

async function ensureDeliveryLog(c) {
	try {
		await c.env.db.prepare(DELIVERY_LOG_ENSURE).run();
		await c.env.db.prepare(
			'CREATE INDEX IF NOT EXISTS idx_notification_delivery_provider_time ON notification_delivery_log(provider, created_at)'
		).run();
	} catch {}
}

async function startAttempt(c, { userId, eventType, recipient }) {
	await ensureDeliveryLog(c);
	try {
		const result = await c.env.db.prepare(
			`INSERT INTO notification_delivery_log (user_id, provider, event_type, recipient, status)
			 VALUES (?, ?, ?, ?, 'attempted')`
		).bind(Number(userId) || 0, ALIBABA_DIRECTMAIL.provider, eventType || 'external_email', recipient).run();
		return result?.meta?.last_row_id ?? result?.last_row_id ?? null;
	} catch {
		return null;
	}
}

async function finishAttempt(c, id, status, providerMessageIdValue, smtpResult) {
	if (!id) return;
	try {
		await c.env.db.prepare(
			`UPDATE notification_delivery_log
			 SET status = ?, provider_message_id = ?, smtp_result = ?, updated_at = CURRENT_TIMESTAMP
			 WHERE id = ?`
		).bind(status, providerMessageIdValue || null, sanitizeSmtpText(smtpResult), id).run();
	} catch {}
}

function errorForCaller(error) {
	const code = Number(error?.smtpCode);
	const message = Number.isInteger(code) ? `阿里云 DirectMail SMTP 错误（${code}）` : '阿里云 DirectMail 连接失败';
	const result = new BizError(message, 502);
	result.retryable = error?.retryable !== false;
	result.smtpCode = Number.isInteger(code) ? code : null;
	return result;
}

const alibabaDirectmailService = {
	async send(c, { userId = 0, targetEmail, subject, text, html, eventType = 'external_email' } = {}) {
		const ctx = contextOf(c);
		const setting = await settingService.query(ctx);
		const config = getConfig(setting);
		requireConfigured(config);
		const recipient = validateRecipient(targetEmail);
		const attemptId = await startAttempt(ctx, { userId, eventType, recipient });
		const mime = buildMimeMessage({
			fromEmail: config.senderEmail,
			fromName: config.senderName,
			recipient,
			subject: subject || '[PSG Mail] 通知',
			text: text || '',
			html: html || '',
		});

		try {
			const result = await smtpSession(config, { recipient, mime });
			await finishAttempt(ctx, attemptId, 'accepted', result.messageId, result.response);
			return { id: result.messageId || result.response };
		} catch (error) {
			await finishAttempt(ctx, attemptId, 'failed', null, error?.smtpResponse || error?.message);
			throw errorForCaller(error);
		}
	},

	async testConnection(c, overrides = {}) {
		const ctx = contextOf(c);
		const setting = await settingService.query(ctx);
		const safeOverrides = overrides && typeof overrides === 'object' ? overrides : {};
		const testSetting = { ...setting };
		if (Object.prototype.hasOwnProperty.call(safeOverrides, 'senderEmail')) {
			testSetting.alibabaDirectmailSenderEmail = safeOverrides.senderEmail;
		}
		if (Object.prototype.hasOwnProperty.call(safeOverrides, 'regionName')) {
			testSetting.alibabaDirectmailRegionName = safeOverrides.regionName;
		}
		if (Object.prototype.hasOwnProperty.call(safeOverrides, 'regionId')) {
			testSetting.alibabaDirectmailRegionId = safeOverrides.regionId;
		}
		if (Object.prototype.hasOwnProperty.call(safeOverrides, 'smtpHost')) {
			testSetting.alibabaDirectmailSmtpHost = safeOverrides.smtpHost;
		}
		if (Object.prototype.hasOwnProperty.call(safeOverrides, 'smtpPort')) {
			testSetting.alibabaDirectmailSmtpPort = safeOverrides.smtpPort;
		}
		if (Object.prototype.hasOwnProperty.call(safeOverrides, 'encryption')) {
			testSetting.alibabaDirectmailEncryption = safeOverrides.encryption;
		}
		if (safeOverrides.smtpPassword && safeOverrides.smtpPassword !== PASSWORD_MASK) {
			testSetting.alibabaDirectmailSmtpPassword = safeOverrides.smtpPassword;
		}
		const config = getConfig(testSetting);
		requireConfigured(config);
		try {
			await smtpSession(config);
			return {
				provider: ALIBABA_DIRECTMAIL.provider,
				region: config.region,
				regionName: config.regionName,
				host: config.host,
				port: config.port,
				encryption: config.encryption,
				authenticated: true,
			};
		} catch (error) {
			throw errorForCaller(error);
		}
	},

	async sendTestNotification(c, userId, targetEmail) {
		const recipient = validateRecipient(targetEmail);
		return this.send(c, {
			userId,
			targetEmail: recipient,
			eventType: 'test_notification',
			subject: '[PSG Mail] 阿里云邮件推送测试通知',
			text: '这是一封阿里云邮件推送测试通知。\n\nPSG Mail Notifications',
			html: '<p>这是一封阿里云邮件推送测试通知。</p><p>PSG Mail Notifications</p>',
		});
	},

	async getUsage(c) {
		const ctx = contextOf(c);
		await ensureDeliveryLog(ctx);
		const usageFor = async since => {
			try {
				const row = await ctx.env.db.prepare(
					`SELECT
						COUNT(*) AS attempted,
						SUM(CASE WHEN status = 'accepted' THEN 1 ELSE 0 END) AS accepted,
						SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed
					 FROM notification_delivery_log
					 WHERE provider = ? AND created_at >= ?`
				).bind(ALIBABA_DIRECTMAIL.provider, since).first();
				return {
					attempted: Number(row?.attempted || 0),
					accepted: Number(row?.accepted || 0),
					failed: Number(row?.failed || 0),
				};
			} catch {
				return { attempted: 0, accepted: 0, failed: 0 };
			}
		};

		const [today, month] = await Promise.all([
			usageFor(dayjs().startOf('day').format('YYYY-MM-DD HH:mm:ss')),
			usageFor(dayjs().startOf('month').format('YYYY-MM-DD HH:mm:ss')),
		]);
		return {
			todaySent: today.accepted,
			monthSent: month.accepted,
			todayAttempted: today.attempted,
			todayAccepted: today.accepted,
			todayFailed: today.failed,
			monthAttempted: month.attempted,
			monthAccepted: month.accepted,
			monthFailed: month.failed,
		};
	},

	assertAdmin(c) {
		const user = c.get?.('user');
		if (!user || String(user.email).toLowerCase() !== String(c.env.admin || '').toLowerCase()) {
			throw new BizError('权限不足', 403);
		}
	},
};

export { PASSWORD_MASK };
export default alibabaDirectmailService;
