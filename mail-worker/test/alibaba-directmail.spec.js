import { describe, expect, it } from 'vitest';
import alibabaDirectmailService, {
	ALIBABA_DIRECTMAIL,
	PASSWORD_MASK,
	buildMimeMessage,
	getConfig,
	isConfigured,
} from '../src/service/alibaba-directmail-service';

describe('Alibaba Cloud DirectMail notification service', () => {
	it('keeps the requested Hangzhou SMTP endpoint fixed', () => {
		expect(ALIBABA_DIRECTMAIL).toMatchObject({
			provider: 'alibaba_directmail',
			region: 'cn-hangzhou',
			host: 'smtpdm.aliyun.com',
			port: 465,
			encryption: 'SSL/TLS',
			defaultDailyQuota: 2000,
			defaultMonthlyQuota: 60000,
		});
		expect(Object.isFrozen(ALIBABA_DIRECTMAIL)).toBe(true);
	});

	it('normalizes the sender and clamps observation quotas', () => {
		const config = getConfig({
			alibabaDirectmailSenderEmail: '  Sender@Example.COM ',
			alibabaDirectmailSmtpPassword: 'smtp-secret',
			alibabaDirectmailSenderName: '  PSG Mail  ',
			alibabaDirectmailDailyQuota: -4,
			alibabaDirectmailMonthlyQuota: 100000001,
		});

		expect(config.senderEmail).toBe('sender@example.com');
		expect(config.smtpPassword).toBe('smtp-secret');
		expect(config.senderName).toBe('PSG Mail');
		expect(config.dailyQuota).toBe(0);
		expect(config.monthlyQuota).toBe(100000000);
		expect(isConfigured(config)).toBe(true);
		expect(isConfigured({ ...config, smtpPassword: PASSWORD_MASK })).toBe(false);
		expect(isConfigured({ ...config, senderEmail: 'not-an-email' })).toBe(false);
	});

	it('builds a body-only UTF-8 MIME notification without leaking SMTP credentials', () => {
		const message = buildMimeMessage({
			fromEmail: 'sender@example.com',
			fromName: 'PSG Mail Notifications',
			recipient: 'recipient@example.net',
			subject: '您收到一封新邮件',
			text: '原邮件发件人：alice@example.com\n主题：测试',
			html: '<p>原邮件发件人：alice@example.com</p><p>主题：测试</p>',
		});

		expect(message).toContain('From: PSG Mail Notifications <sender@example.com>');
		expect(message).toContain('To: recipient@example.net');
		expect(message).toContain('Content-Type: multipart/alternative');
		expect(message).toContain('Content-Type: text/plain; charset=UTF-8');
		expect(message).toContain('Content-Type: text/html; charset=UTF-8');
		expect(message).not.toContain('smtp-secret');
		expect(message).not.toContain('Content-Disposition: attachment');
	});

	it('does not expose an SMTP password in the service surface', () => {
		expect(alibabaDirectmailService).not.toHaveProperty('password');
		expect(PASSWORD_MASK).toBe('••••••••••••••••');
	});
});
