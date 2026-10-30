import emailService from '../service/email-service';
import { isDel, settingConst } from '../const/entity-const';
import telegramService from '../service/telegram-service';
import aiService from '../service/ai-service';
import notificationService from '../service/notification-service';
import forwardingService from '../service/forwarding-service';
import notificationEventService from '../service/notification-event-service';
import webhookService from '../service/webhook-service';
import mailRuleService from '../service/mail-rule-service';
import { splitAddressList, shouldAutoReply, escapeHtml } from '../utils/inbound-mail';

// One auto-reply per sender per day, the RFC 3834 recommendation.
const AUTO_REPLY_WINDOW = 60 * 60 * 24;

// Everything that happens to a mail once it is stored in a mailbox: the
// owner's rules, push notifications, personal forwarding, AI code
// extraction, auto-reply and the admin's global Telegram / email / webhook
// forwarding. Shared by mail arriving from outside (email.js) and mail sent
// between two mailboxes on this site (emailService.HandleOnSiteEmail), which
// is written straight to the database and never reaches email.js.
//
// mail is the parsed message (postal-mime shape: from, subject, html, text,
// headers). screenSpam, when given, returns a promise resolving true for
// spam; spam is stored but triggers nothing else. forwardTo(address) sends
// the copy for the global "forward to other mailboxes" setting.
export async function afterReceive(c, { account, emailRow, mail, recipient, setting, waitUntil, screenSpam, forwardTo }) {

	const {
		tgChatId, tgBotStatus, forwardStatus, forwardEmail, webhookStatus, webhookUrl,
		webhookRetry, webhookSecret, ruleEmail, ruleType, aiCode, aiCodeFilter,
	} = setting;

	// The user's Subject keywords rules (star / archive / mark read), applied
	// before any push so every client sees the mail in its final state.
	const ruleResult = account ? await mailRuleService.applyIncoming(c, account.userId, emailRow) : {};

	// With AI spam screening on, the verdict comes first (capped at a
	// few seconds) so spam neither pings the user nor reaches any
	// downstream action: notifications, forwarding, Telegram, webhooks
	// and auto-replies. The mail itself is already stored either way.
	// A rule that sent the mail to spam or trash counts the same way.
	const spamCheck = ruleResult?.silent ? Promise.resolve(true)
		: account && screenSpam ? screenSpam() : Promise.resolve(false);

	if (account) {
		const notifyAndForward = () => Promise.all([
			notificationEventService.createNewMail({
				env: c.env,
				userId: account.userId,
				accountId: account.accountId,
				email: emailRow
			}),
			notificationService.dispatchNewMail({
				env: c.env,
				userId: account.userId,
				accountId: account.accountId,
				email: emailRow
			}),
			forwardingService.dispatchIncoming(c, account, emailRow),
		]);
		waitUntil(spamCheck.then(isSpam => isSpam ? null : notifyAndForward()));
	}

	// AI code extraction is a Workers AI inference call — can take
	// seconds, occasionally longer on a cold model. It runs after the email
	// is already visible, and only patches the code column in afterward.
	waitUntil((async () => {
		try {
			const code = await aiService.extractCode(c, mail, { aiCode, aiCodeFilter });
			if (code) {
				await emailService.updateCode(c, emailRow.emailId, code);
			}
		} catch (e) {
			console.error('async code extraction failed', e);
		}
	})());

	if (await spamCheck) {
		return;
	}

	// 自动回复 (per user, so it is not limited by the global forwarding rule below)
	if (account && account.isDel !== isDel.DELETE) {
		await autoReply(c, account, recipient, mail);
	}

	// The rule only scopes the global forwarding targets: Telegram, email and webhook.
	if (ruleType === settingConst.ruleType.RULE
		&& !splitAddressList(ruleEmail).includes(String(recipient).toLowerCase())) {
		return;
	}

	//转发到TG
	if (tgBotStatus === settingConst.tgBotStatus.OPEN && tgChatId) {
		await telegramService.sendEmailToBot(c, emailRow)
	}

	//转发到其他邮箱
	if (forwardStatus === settingConst.forwardStatus.OPEN && forwardEmail && forwardTo) {
		await Promise.all(splitAddressList(forwardEmail).map(async address => {
			try {
				await forwardTo(address);
			} catch (e) {
				console.error(`转发邮箱 ${address} 失败：`, e);
			}
		}));
	}

	//转发到 Webhook
	if (webhookStatus === settingConst.webhookStatus.OPEN && webhookUrl) {
		await webhookService.sendEmail(c, emailRow, webhookUrl, webhookRetry, webhookSecret);
	}
}

async function autoReply(c, account, recipient, mail) {
	try {
		if (!shouldAutoReply(mail, recipient)) return;
		const arRow = await c.env.db.prepare(
			'SELECT enabled, message FROM auto_reply WHERE user_id = ?'
		).bind(account.userId).first();
		if (!arRow?.enabled || !arRow.message) return;

		const sender = mail.from.address.toLowerCase();
		const onceKey = `auto-reply:${account.accountId}:${sender}`;
		if (await c.env.kv.get(onceKey)) return;
		await c.env.kv.put(onceKey, '1', { expirationTtl: AUTO_REPLY_WINDOW });

		// autoSubmitted marks the reply (Auto-Submitted header outside, the
		// same flag on site) so the other side never auto-replies back.
		await emailService.send({ env: c.env }, {
			sendEmail: recipient,
			receiveEmail: [mail.from.address],
			subject: 'Re: ' + (mail.subject || ''),
			content: `<p>${escapeHtml(arRow.message).replace(/\n/g, '<br>')}</p>`,
			text: arRow.message,
			accountId: account.accountId,
			autoSubmitted: true,
		}, account.userId).catch(() => {});
	} catch (e) {
		console.error('auto reply failed', e);
	}
}
