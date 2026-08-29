import app from '../hono/hono';
import result from '../model/result';
import settingService from '../service/setting-service';
import emailService from '../service/email-service';
import userContext from "../security/user-context";
import alibabaDirectmailService from '../service/alibaba-directmail-service';
import forwardingService from '../service/forwarding-service';
import verifyUtils from '../utils/verify-utils';
import BizError from '../error/biz-error';

app.put('/setting/set', async (c) => {
	await settingService.set(c, await c.req.json());
	return c.json(result.ok());
});

app.get('/setting/query', async (c) => {
	const setting = await settingService.get(c);
	return c.json(result.ok(setting));
});

app.get('/setting/websiteConfig', async (c) => {
	const setting = await settingService.websiteConfig(c);
	return c.json(result.ok(setting));
})

app.put('/setting/setBackground', async (c) => {
	const key = await settingService.setBackground(c, await c.req.json());
	return c.json(result.ok(key));
});

app.delete('/setting/deleteBackground', async (c) => {
	await settingService.deleteBackground(c);
	return c.json(result.ok());
});

app.put('/setting/setBlacklist', async (c) => {
	const setting = await settingService.setBlacklist(c, await c.req.json());
	return c.json(result.ok(setting));
})

app.get('/setting/providerUsage', async (c) => {
	const usage = await emailService.getProviderUsage(c);
	return c.json(result.ok(usage));
});

// SMTP handshake + AUTH only, no message sent — lets an admin verify the
// 发信地址/SMTP密码 pair without spending a real send.
app.post('/setting/alibaba/testConnection', async (c) => {
	const setting = await settingService.query(c);
	if (!setting.alibabaSmtpUser || !setting.alibabaSmtpPassword) {
		throw new BizError('阿里云邮件推送 SMTP 未配置', 400);
	}
	await alibabaDirectmailService.testConnection({
		username: setting.alibabaSmtpUser,
		password: setting.alibabaSmtpPassword,
	});
	return c.json(result.ok());
});

// Always exercises the real Alibaba path (never falls back to
// Cloudflare/Resend/Mailjet like sendNotificationExternal does for real
// traffic) so a 400/502 here reliably means the Alibaba config itself is
// broken, not that some other provider silently covered for it.
app.post('/setting/alibaba/testNotification', async (c) => {
	const { targetEmail } = await c.req.json();
	if (!verifyUtils.isEmail(targetEmail)) throw new BizError('请输入有效的测试接收邮箱', 400);
	const setting = await settingService.query(c);
	if (!setting.alibabaSmtpUser || !setting.alibabaSmtpPassword) {
		throw new BizError('阿里云邮件推送 SMTP 未配置', 400);
	}
	const subject = 'PSG Mail Notifications 测试通知';
	const text = '这是一封来自阿里云邮件推送的测试通知邮件。\n\n如果你收到这封邮件，说明 PSG Mail 的阿里云邮件推送通道配置正确。';
	const html = '<div style="font-family:Arial,sans-serif;line-height:1.7;color:#202622"><p>这是一封来自阿里云邮件推送的测试通知邮件。</p><p>如果你收到这封邮件，说明 PSG Mail 的阿里云邮件推送通道配置正确。</p></div>';
	try {
		const sendResult = await alibabaDirectmailService.sendMail({
			username: setting.alibabaSmtpUser,
			password: setting.alibabaSmtpPassword,
			fromName: setting.alibabaSenderName || 'PSG Mail Notifications',
			fromEmail: setting.alibabaSmtpUser,
		}, { to: targetEmail, subject, text, html });
		await forwardingService.logNotificationSend(c, {
			provider: 'alibaba', sendType: 'test', recipient: targetEmail, status: 'accepted', providerMessageId: sendResult?.messageId || null,
		});
	} catch (error) {
		await forwardingService.logNotificationSend(c, {
			provider: 'alibaba', sendType: 'test', recipient: targetEmail, status: 'failed',
			errorMessage: String(error?.message || 'test notification failed').slice(0, 500),
		});
		throw new BizError('测试通知发送失败，请检查 SMTP 配置。', 502);
	}
	return c.json(result.ok());
});

