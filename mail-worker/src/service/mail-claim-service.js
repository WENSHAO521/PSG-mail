// Assign an unclaimed message ("无人收件": no mailbox existed when it arrived)
// to a mailbox whose address matches the envelope recipient. Ported from
// upstream maillab/cloud-mail PR #634, adapted to PSG's plus-addressing
// fallback: user+tag@domain may also go to the base mailbox user@domain,
// the same mailbox inbound delivery would pick today.
import BizError from '../error/biz-error';
import { t } from '../i18n/i18n';
import { emailConst, isDel, userConst } from '../const/entity-const';
import emailUtils from '../utils/email-utils';

function requireAdmin(c) {
	// Viewing all mail can be granted to a role; moving mail into someone's
	// mailbox is reserved for the super administrator.
	const email = c.get('user')?.email;
	if (!email || email !== c.env.admin) {
		throw new BizError(t('claimAdminOnly'), 403);
	}
}

function positiveId(value) {
	if (!['string', 'number'].includes(typeof value)
		|| !/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value))) {
		throw new BizError(t('claimInvalidId'), 400);
	}
	return Number(value);
}

// Addresses a claim may target: the exact envelope recipient, then its base
// address when it was plus-addressed.
export function claimAddresses(toEmail) {
	const exact = String(toEmail || '').trim().toLowerCase();
	if (!exact) return [];
	const base = emailUtils.getBaseEmail(exact);
	return base && base !== exact ? [exact, base] : [exact];
}

async function unclaimedMessage(c, emailId) {
	const message = await c.env.db.prepare(`
		SELECT email_id AS emailId, to_email AS toEmail
		FROM email
		WHERE email_id = ? AND user_id = 0 AND account_id = 0
		  AND status = ? AND type = ? AND is_del = ?
	`).bind(emailId, emailConst.status.NOONE, emailConst.type.RECEIVE, isDel.NORMAL).first();
	if (!message) throw new BizError(t('claimNotUnclaimed'), 409);
	return message;
}

async function matchingAccounts(c, toEmail) {
	const addresses = claimAddresses(toEmail);
	if (!addresses.length) return [];
	const marks = addresses.map(() => '?').join(', ');
	// Match on the SMTP envelope recipient (to_email), never the forgeable To header.
	const { results } = await c.env.db.prepare(`
		SELECT a.account_id AS accountId, a.email, a.name, u.user_id AS userId, u.email AS userEmail
		FROM account a JOIN user u ON u.user_id = a.user_id
		WHERE lower(a.email) IN (${marks}) AND a.is_del = ?
		  AND u.is_del = ? AND u.status = ?
	`).bind(...addresses, isDel.NORMAL, isDel.NORMAL, userConst.status.NORMAL).all();
	// Exact address first, base address second.
	return results.sort((x, y) => addresses.indexOf(x.email.toLowerCase()) - addresses.indexOf(y.email.toLowerCase()));
}

const mailClaimService = {

	async targets(c, params) {
		requireAdmin(c);
		const message = await unclaimedMessage(c, positiveId(params?.emailId));
		return { toEmail: message.toEmail, accounts: await matchingAccounts(c, message.toEmail) };
	},

	async claim(c, params) {
		requireAdmin(c);
		const emailId = positiveId(params?.emailId);
		const accountId = positiveId(params?.accountId);
		const message = await unclaimedMessage(c, emailId);
		const target = (await matchingAccounts(c, message.toEmail)).find(row => row.accountId === accountId);
		if (!target) throw new BizError(t('claimTargetUnavailable'), 409);

		// One D1 batch is one transaction: the attachments move with the message
		// or not at all. The WHERE clauses re-check the state so a concurrent
		// claim or delete between the read and the write is a no-op.
		const [updated] = await c.env.db.batch([
			c.env.db.prepare(`
				UPDATE email SET user_id = ?, account_id = ?, status = ?
				WHERE email_id = ? AND user_id = 0 AND account_id = 0
				  AND status = ? AND type = ? AND is_del = ?
				  AND EXISTS (
					SELECT 1 FROM account a JOIN user u ON u.user_id = a.user_id
					WHERE a.account_id = ? AND a.user_id = ? AND a.is_del = ?
					  AND u.is_del = ? AND u.status = ?
				  )
				RETURNING email_id AS emailId, user_id AS userId, account_id AS accountId, status
			`).bind(target.userId, accountId, emailConst.status.RECEIVE,
				emailId, emailConst.status.NOONE, emailConst.type.RECEIVE, isDel.NORMAL,
				accountId, target.userId, isDel.NORMAL, isDel.NORMAL, userConst.status.NORMAL),
			c.env.db.prepare(`
				UPDATE attachments SET user_id = ?, account_id = ?
				WHERE email_id = ?
				  AND EXISTS (
					SELECT 1 FROM email WHERE email_id = ? AND user_id = ? AND account_id = ?
					  AND status = ? AND is_del = ?
				  )
			`).bind(target.userId, accountId, emailId,
				emailId, target.userId, accountId, emailConst.status.RECEIVE, isDel.NORMAL)
		]);
		if (!updated.results?.length) throw new BizError(t('claimNotUnclaimed'), 409);
		return { ...updated.results[0], email: target.email };
	}
};

export default mailClaimService;
