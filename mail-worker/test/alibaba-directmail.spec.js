import { describe, expect, it } from 'vitest';
import alibabaDirectmailService, {
	ALIBABA_DIRECTMAIL,
	PASSWORD_MASK,
	buildMimeMessage,
	getConfig,
	isConfigured,
} from '../src/service/alibaba-directmail-service';

describe('Alibaba Cloud DirectMail notification service', () => {
	it('provides the requested Hangzhou SMTP endpoint as the initial default', () => {
		expect(ALIBABA_DIRECTMAIL).toMatchObject({
			provider: 'alibaba_directmail',
			defaultRegion: 'cn-hangzhou',
			defaultRegionName: '华东1（杭州）',
			defaultHost: 'smtpdm.aliyun.com',
			defaultPort: 465,
			defaultEncryption: 'SSL/TLS',
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
			alibabaDirectmailRegionName: '华东1（杭州）',
			alibabaDirectmailRegionId: 'cn-hangzhou',
			alibabaDirectmailSmtpHost: 'smtpdm.aliyun.com',
			alibabaDirectmailSmtpPort: 465,
			alibabaDirectmailEncryption: 'SSL/TLS',
			alibabaDirectmailDailyQuota: -4,
			alibabaDirectmailMonthlyQuota: 100000001,
		});

		expect(config.senderEmail).toBe('sender@example.com');
		expect(config.smtpPassword).toBe('smtp-secret');
		expect(config.senderName).toBe('PSG Mail');
		expect(config.regionName).toBe('华东1（杭州）');
		expect(config.region).toBe('cn-hangzhou');
		expect(config.host).toBe('smtpdm.aliyun.com');
		expect(config.port).toBe(465);
		expect(config.encryption).toBe('SSL/TLS');
		expect(config.dailyQuota).toBe(0);
		expect(config.monthlyQuota).toBe(100000000);
		expect(isConfigured(config)).toBe(true);
		expect(isConfigured({ ...config, smtpPassword: PASSWORD_MASK })).toBe(false);
		expect(isConfigured({ ...config, senderEmail: 'not-an-email' })).toBe(false);
	});

	it('uses saved transport settings instead of a fixed endpoint', () => {
		const config = getConfig({
			alibabaDirectmailSenderEmail: 'sender@example.com',
			alibabaDirectmailSmtpPassword: 'smtp-secret',
			alibabaDirectmailRegionName: '华北2（北京）',
			alibabaDirectmailRegionId: 'cn-beijing',
			alibabaDirectmailSmtpHost: 'custom.smtp.example.com',
			alibabaDirectmailSmtpPort: 2525,
			alibabaDirectmailEncryption: 'SSL/TLS',
		});

		expect(config.regionName).toBe('华北2（北京）');
		expect(config.region).toBe('cn-beijing');
		expect(config.host).toBe('custom.smtp.example.com');
		expect(config.port).toBe(2525);
		expect(config.encryption).toBe('SSL/TLS');
		expect(isConfigured(config)).toBe(true);
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
