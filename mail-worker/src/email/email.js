import PostalMime from 'postal-mime';
import emailService from '../service/email-service';
import accountService from '../service/account-service';
import settingService from '../service/setting-service';
import attService from '../service/att-service';
import constant from '../const/constant';
import fileUtils from '../utils/file-utils';
import { emailConst, isDel, settingConst } from '../const/entity-const';
import emailUtils from '../utils/email-utils';
import roleService from '../service/role-service';
import userService from '../service/user-service';
import telegramService from '../service/telegram-service';
import aiService from '../service/ai-service';
import spamService from '../service/spam-service';
import trackerService from '../service/tracker-service';
import notificationService from '../service/notification-service';
import forwardingService from '../service/forwarding-service';
import notificationEventService from '../service/notification-event-service';
import webhookService from '../service/webhook-service';
import { readRaw, splitAddressList, shouldAutoReply, escapeHtml } from '../utils/inbound-mail';

// One auto-reply per sender per day, the RFC 3834 recommendation.
const AUTO_REPLY_WINDOW = 60 * 60 * 24;

export async function email(message, env, ctx) {

	try {

		const {
			receive,
			tgChatId,
			tgBotStatus,
			forwardStatus,
			forwardEmail,
			webhookStatus,
			webhookUrl,
			webhookRetry,
			webhookSecret,
			ruleEmail,
			ruleType,
			r2Domain,
			noRecipient,
			blackSubject,
			blackContent,
			blackFrom,
			aiCode,
			aiCodeFilter,
			aiSpam,
			aiTrackerBlock
		} = await settingService.query({ env });

		if (receive === settingConst.receive.CLOSE) {
			message.setReject('Service suspended');
			return;
		}

		const email = await PostalMime.parse(await readRaw(message.raw));

		// A message without a parsable From header still has an envelope sender.
		if (!email.from?.address) {
			email.from = { address: message.from || '', name: email.from?.name || '' };
		}

		const blockFlag = checkBlock(blackSubject, blackContent, blackFrom, email);

		if (blockFlag) {
			message.setReject('Message rejected');
			return;
		}

		let account = await accountService.selectByEmailIncludeDel({ env: env }, message.to);

		// Plus-addressing fallback: no exact sub-address account (user+tag@domain.com)
		// was ever registered, so deliver to the base mailbox instead.
		if (!account) {
			const baseEmail = emailUtils.getBaseEmail(message.to);
			if (baseEmail && baseEmail !== message.to) {
				account = await accountService.selectByEmailIncludeDel({ env: env }, baseEmail);
			}
		}

		if (!account && noRecipient === settingConst.noRecipient.CLOSE) {
			message.setReject('Recipient not found');
			return;
		}

		let userRow = {}

		if (account) {
			 userRow = await userService.selectByIdIncludeDel({ env: env }, account.userId);
		}

		if (account && userRow.email !== env.admin) {

			let { banEmail, availDomain } = await roleService.selectByUserId({ env: env }, account.userId);

			if (!roleService.hasAvailDomainPerm(availDomain, message.to)) {
				message.setReject('The recipient is not authorized to use this domain.');
				return;
			}

			if(roleService.isBanEmail(banEmail, email.from.address)) {
				message.setReject('The recipient is disabled from receiving emails.');
				return;
			}

		}


		if (!email.to) {
			email.to = [{ address: message.to, name: emailUtils.getName(message.to)}]
		}

		const toName = email.to.find(item => item.address?.toLowerCase() === message.to.toLowerCase())?.name || '';

		const params = {
			toEmail: message.to,
			toName: toName,
			sendEmail: email.from.address,
			name: email.from.name || emailUtils.getName(email.from.address),
			subject: email.subject,
			content: email.html,
			text: email.text,
			cc: email.cc ? JSON.stringify(email.cc) : '[]',
			bcc: email.bcc ? JSON.stringify(email.bcc) : '[]',
			recipient: JSON.stringify(email.to),
			inReplyTo: email.inReplyTo,
			relation: email.references,
			messageId: email.messageId,
			userId: account ? account.userId : 0,
			accountId: account ? account.accountId : 0,
			isDel: isDel.DELETE,
			status: emailConst.status.SAVING
		};

		// Neutralize open-tracking pixels before the mail is stored, so no
		// client (web, desktop, phone, forwarding) ever fetches them. Rules
		// decide; images they can't settle may go to Workers AI. scrub()
		// never rejects and returns the html unchanged on failure.
		if (trackerService.enabled({ aiTrackerBlock }) && params.content
			&& !(await trackerService.isAllowed({ env }, params.userId, email.from?.address))) {
			const scrubbed = await trackerService.scrub({ env }, params.content, {
				userId: params.userId,
				recipient: message.to,
				sender: email.from?.address,
				headers: email.headers,
			});
			params.content = scrubbed.html;
		}

		const attachments = [];
		const cidAttachments = [];

		for (let item of email.attachments) {
			let attachment = { ...item };
			attachment.key = constant.ATTACHMENT_PREFIX + await fileUtils.getBuffHash(attachment.content) + fileUtils.getExtFileName(item.filename);
			attachment.size = item.content.length ?? item.content.byteLength;
			attachments.push(attachment);
			if (attachment.contentId) {
				cidAttachments.push(attachment);
			}
		}

		let emailRow = await emailService.receive({ env }, params, cidAttachments, r2Domain);

		attachments.forEach(attachment => {
			attachment.emailId = emailRow.emailId;
			attachment.userId = emailRow.userId;
			attachment.accountId = emailRow.accountId;
		});

		try {
			if (attachments.length > 0) {
				await attService.addAtt({ env }, attachments);
			}
		} catch (e) {
			console.error(e);
		}

		emailRow = await emailService.completeReceive({ env }, account ? emailConst.status.RECEIVE : emailConst.status.NOONE, emailRow.emailId);

		// With AI spam screening on, the verdict comes first (capped at a
		// few seconds) so spam neither pings the user nor reaches any
		// downstream action: notifications, forwarding, Telegram, webhooks
		// and auto-replies. The mail itself is already stored either way.
		// screen() never rejects; it resolves false on any failure.
		const spamCheck = account && spamService.enabled({ aiSpam })
			? spamService.screen({ env }, { email, emailRow, setting: { aiSpam } })
			: Promise.resolve(false);

		if (account) {
			const notifyAndForward = () => Promise.all([
				notificationEventService.createNewMail({
					env,
					userId: account.userId,
					accountId: account.accountId,
					email: emailRow
				}),
				notificationService.dispatchNewMail({
					env,
					userId: account.userId,
					accountId: account.accountId,
					email: emailRow
				}),
				forwardingService.dispatchIncoming({ env }, account, emailRow),
			]);
			ctx.waitUntil(spamCheck.then(isSpam => isSpam ? null : notifyAndForward()));
		}

		// AI code extraction is a Workers AI inference call — can take
		// seconds, occasionally longer on a cold model. Running it before the
		// DB write (as this used to) delayed completeReceive() and therefore
		// the push + every client's view of "the email exists" by that same
		// amount. It now runs after the email is already visible, and only
		// patches the code column in afterward — the mail body is never
		// gated on it.
		ctx.waitUntil((async () => {
			try {
				const code = await aiService.extractCode({ env }, email, { aiCode, aiCodeFilter });
				if (code) {
					await emailService.updateCode({ env }, emailRow.emailId, code);
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
			await autoReply(env, account, message.to, email);
		}

		// The rule only scopes the global forwarding targets: Telegram, email and webhook.
		if (ruleType === settingConst.ruleType.RULE
			&& !splitAddressList(ruleEmail).includes(message.to.toLowerCase())) {
			return;
		}

		//转发到TG
		if (tgBotStatus === settingConst.tgBotStatus.OPEN && tgChatId) {
			await telegramService.sendEmailToBot({ env }, emailRow)
		}

		//转发到其他邮箱
		if (forwardStatus === settingConst.forwardStatus.OPEN && forwardEmail) {

			const emails = splitAddressList(forwardEmail);

			await Promise.all(emails.map(async email => {

				try {
					await message.forward(email);
				} catch (e) {
					console.error(`转发邮箱 ${email} 失败：`, e);
				}

			}));

		}

		//转发到 Webhook
		if (webhookStatus === settingConst.webhookStatus.OPEN && webhookUrl) {
			await webhookService.sendEmail({ env }, emailRow, webhookUrl, webhookRetry, webhookSecret);
		}

	} catch (e) {
		console.error('邮件接收异常: ', e);
		throw e
	}
}

async function autoReply(env, account, recipient, email) {
	try {
		if (!shouldAutoReply(email, recipient)) return;
		const arRow = await env.db.prepare(
			'SELECT enabled, message FROM auto_reply WHERE user_id = ?'
		).bind(account.userId).first();
		if (!arRow?.enabled || !arRow.message) return;

		const sender = email.from.address.toLowerCase();
		const onceKey = `auto-reply:${account.accountId}:${sender}`;
		if (await env.kv.get(onceKey)) return;
		await env.kv.put(onceKey, '1', { expirationTtl: AUTO_REPLY_WINDOW });

		await emailService.send({ env }, {
			sendEmail: recipient,
			receiveEmail: [email.from.address],
			subject: 'Re: ' + (email.subject || ''),
			content: `<p>${escapeHtml(arRow.message).replace(/\n/g, '<br>')}</p>`,
			text: arRow.message,
			accountId: account.accountId,
		}, account.userId).catch(() => {});
	} catch (e) {
		console.error('auto reply failed', e);
	}
}

export function checkBlock(blackSubjectStr, blackContentStr, blackFromStr, email) {

	// Drop empty entries: a trailing comma would otherwise add '' and ''.includes() matches every mail.
	const toList = str => str ? str.split(',').map(item => item.trim()).filter(Boolean) : []
	const blackFromList = toList(blackFromStr)
	const blackContentList = toList(blackContentStr)
	const blackSubjectList = toList(blackSubjectStr)

	for (const blackSubject of blackSubjectList) {
		if (email.subject?.includes(blackSubject)) {
			return true
		}
	}

	for (const blackContent of blackContentList) {
		if (email.html?.includes(blackContent) || email.text?.includes(blackContent)) {
			return true
		}
	}

	const from = String(email.from?.address || '').toLowerCase();
	for (const blackFrom of blackFromList) {
		const entry = blackFrom.toLowerCase();
		if (from === entry || emailUtils.getDomain(from) === entry) {
			return true
		}
	}

	return false

}
