import { describe, expect, it } from 'vitest';
import alibabaDirectmailService, { buildMimeMessage } from '../src/service/alibaba-directmail-service';

describe('Alibaba Cloud DirectMail notification channel', () => {
	it('is fixed to the Hangzhou endpoint requested by the operator', () => {
		expect(alibabaDirectmailService.ALIBABA_SMTP_HOST).toBe('smtpdm.aliyun.com');
		expect(alibabaDirectmailService.ALIBABA_SMTP_PORT).toBe(465);
		expect(alibabaDirectmailService.ALIBABA_REGION_ID).toBe('cn-hangzhou');
	});

	it('builds a two-part UTF-8 MIME message and never leaks the SMTP password', () => {
		const message = buildMimeMessage({
			fromName: 'PSG Mail Notifications',
			fromEmail: 'notification@notify.example.com',
			to: 'user@example.net',
			subject: '您收到一封新邮件',
			text: '原邮件发件人：alice@example.com',
			html: '<p>原邮件发件人：alice@example.com</p>',
		});

		expect(message).toContain('From: PSG Mail Notifications <notification@notify.example.com>');
		expect(message).toContain('To: <user@example.net>');
		expect(message).toContain('Content-Type: multipart/alternative');
		expect(message).toContain('Content-Type: text/plain; charset=UTF-8');
		expect(message).toContain('Content-Type: text/html; charset=UTF-8');
		expect(message).toContain('Content-Transfer-Encoding: base64');
		// Subject has non-ASCII characters, so it must be MIME encoded-word, not raw UTF-8 bytes.
		expect(message).toMatch(/Subject: =\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=/);
		expect(message).not.toContain('smtp-secret');
		expect(message).not.toContain('AUTH LOGIN');
	});

	it('leaves a pure-ASCII subject unencoded', () => {
		const message = buildMimeMessage({
			fromName: 'PSG Mail Notifications',
			fromEmail: 'notification@notify.example.com',
			to: 'user@example.net',
			subject: 'New mail notification',
			text: 'hello',
			html: '<p>hello</p>',
		});
		expect(message).toContain('Subject: New mail notification');
	});

	it('rejects a CRLF-embedded sender/recipient before ever opening a socket', async () => {
		// These calls must reject synchronously-ish, before openConnection()'s
		// `cloudflare:sockets` connect() runs — otherwise this test would need
		// a real/mocked TCP connection to exercise.
		await expect(alibabaDirectmailService.sendMail(
			{ username: 'notification@notify.example.com', password: 'secret', fromEmail: 'evil@example.com\r\nRCPT TO:<attacker@evil.example>' },
			{ to: 'user@example.net', subject: 'x', text: 'x', html: 'x' }
		)).rejects.toThrow(/非法字符/);

		await expect(alibabaDirectmailService.sendMail(
			{ username: 'notification@notify.example.com', password: 'secret' },
			{ to: 'user@example.net\r\nDATA', subject: 'x', text: 'x', html: 'x' }
		)).rejects.toThrow(/非法字符/);
	});
});
