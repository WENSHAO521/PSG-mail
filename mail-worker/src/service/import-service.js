import PostalMime from 'postal-mime';
import BizError from '../error/biz-error';
import { t } from '../i18n/i18n';
import emailService from './email-service';
import accountService from './account-service';
import attService from './att-service';
import settingService from './setting-service';
import emailUtils from '../utils/email-utils';
import fileUtils from '../utils/file-utils';
import constant from '../const/constant';
import { emailConst, isDel } from '../const/entity-const';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';

dayjs.extend(utc);

// Largest single .eml accepted (decoded bytes).
const MAX_EML_BYTES = 20 * 1024 * 1024;

function base64ToBytes(b64) {
	const bin = atob(String(b64 || ''));
	const bytes = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
	return bytes;
}

// Imports .eml files (from another mail service) into one of the user's
// mailboxes. A message sent from that mailbox's own address lands in Sent,
// everything else in the inbox, keeping its original date. Imported mail is
// stored as read and does not trigger rules, notifications or forwarding.
const importService = {

	async importEml(c, userId, { accountId, content }) {
		const accountRow = await accountService.selectById(c, Number(accountId));
		if (!accountRow || accountRow.userId !== userId || accountRow.isDel !== isDel.NORMAL) {
			throw new BizError(t('noUserAccount'), 403);
		}

		let bytes;
		try {
			bytes = base64ToBytes(content);
		} catch {
			throw new BizError(t('importEmlInvalid'), 400);
		}
		if (!bytes.length) throw new BizError(t('importEmlInvalid'), 400);
		if (bytes.length > MAX_EML_BYTES) throw new BizError(t('importEmlTooLarge'), 400);

		let mail;
		try {
			mail = await PostalMime.parse(bytes);
		} catch {
			throw new BizError(t('importEmlInvalid'), 400);
		}
		if (!mail.from?.address && !mail.subject && !mail.text && !mail.html) {
			throw new BizError(t('importEmlInvalid'), 400);
		}

		const own = String(accountRow.email).toLowerCase();
		const fromAddress = mail.from?.address || '';
		const isSent = fromAddress.toLowerCase() === own;
		const to = Array.isArray(mail.to) && mail.to.length ? mail.to : [{ address: accountRow.email, name: '' }];

		const sentAt = mail.date ? dayjs(mail.date) : null;
		const createTime = sentAt?.isValid() ? sentAt.utc().format('YYYY-MM-DD HH:mm:ss') : null;

		const params = {
			toEmail: isSent ? (to[0]?.address || '') : accountRow.email,
			toName: isSent ? (to[0]?.name || '') : (to.find(r => r.address?.toLowerCase() === own)?.name || ''),
			sendEmail: fromAddress,
			name: mail.from?.name || (fromAddress ? emailUtils.getName(fromAddress) : ''),
			subject: mail.subject || '',
			content: mail.html || '',
			text: mail.text || '',
			cc: mail.cc ? JSON.stringify(mail.cc) : '[]',
			// Keep Bcc only on mail this mailbox sent itself.
			bcc: isSent && mail.bcc ? JSON.stringify(mail.bcc) : '[]',
			recipient: JSON.stringify(to),
			inReplyTo: mail.inReplyTo || '',
			relation: mail.references || '',
			messageId: mail.messageId || '',
			userId,
			accountId: accountRow.accountId,
			type: isSent ? emailConst.type.SEND : emailConst.type.RECEIVE,
			unread: emailConst.unread.READ,
			isDel: isDel.DELETE,
			status: emailConst.status.SAVING,
		};

		const attachments = [];
		const cidAttachments = [];
		for (const item of mail.attachments || []) {
			const attachment = { ...item };
			attachment.key = constant.ATTACHMENT_PREFIX + await fileUtils.getBuffHash(attachment.content) + fileUtils.getExtFileName(item.filename);
			attachment.size = item.content.length ?? item.content.byteLength;
			attachments.push(attachment);
			if (attachment.contentId) cidAttachments.push(attachment);
		}

		const { r2Domain } = await settingService.query(c);
		let emailRow = await emailService.receive(c, params, cidAttachments, r2Domain);

		if (attachments.length) {
			attachments.forEach(a => {
				a.emailId = emailRow.emailId;
				a.userId = userId;
				a.accountId = accountRow.accountId;
			});
			try {
				await attService.addAtt(c, attachments);
			} catch (e) {
				console.error('import eml: attachments failed', e);
			}
		}

		emailRow = await emailService.completeReceive(c,
			isSent ? emailConst.status.SENT : emailConst.status.RECEIVE, emailRow.emailId);

		if (createTime) {
			await c.env.db.prepare('UPDATE email SET create_time = ? WHERE email_id = ?')
				.bind(createTime, emailRow.emailId).run();
		}

		return { emailId: emailRow.emailId, subject: emailRow.subject, sent: isSent };
	},
};

export default importService;
