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
import spamService from '../service/spam-service';
import trackerService from '../service/tracker-service';
import { readRaw } from '../utils/inbound-mail';
import { afterReceive } from './after-receive';

export async function email(message, env, ctx) {

	try {

		const setting = await settingService.query({ env });
		const {
			receive,
			r2Domain,
			noRecipient,
			blackSubject,
			blackContent,
			blackFrom,
			aiSpam,
			aiTrackerBlock
		} = setting;

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

		try {
			await emailService.saveReplyTo({ env }, emailRow.emailId, email.replyTo, email.from?.address);
		} catch (e) {
			console.error('save reply-to failed', e);
		}

		try {
			await emailService.saveSenderEmail({ env }, emailRow.emailId, {
				sender: email.sender,
				envelopeFrom: message.from,
				fromAddress: email.from?.address,
			});
		} catch (e) {
			console.error('save sender failed', e);
		}

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

		await afterReceive({ env }, {
			account,
			emailRow,
			mail: email,
			recipient: message.to,
			setting,
			waitUntil: p => ctx.waitUntil(p),
			// screen() never rejects; it resolves false on any failure.
			screenSpam: spamService.enabled({ aiSpam })
				? () => spamService.screen({ env }, { email, emailRow, setting: { aiSpam } })
				: null,
			forwardTo: address => message.forward(address),
		});

	} catch (e) {
		console.error('邮件接收异常: ', e);
		throw e
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
