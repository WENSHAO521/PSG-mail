import spamService from './spam-service';
import orm from '../entity/orm';
import email from '../entity/email';
import { attConst, emailConst, isDel, settingConst } from '../const/entity-const';
import { and, desc, eq, gt, inArray, notInArray, lt, count, asc, sql, ne, or, like, lte, gte } from 'drizzle-orm';
import { star } from '../entity/star';
import settingService from './setting-service';
import accountService from './account-service';
import BizError from '../error/biz-error';
import emailUtils from '../utils/email-utils';
import fileUtils from '../utils/file-utils';
import { Resend } from 'resend';
import attService from './att-service';
import { parseHTML } from 'linkedom';
import userService from './user-service';
import roleService from './role-service';
import user from '../entity/user';
import starService from './star-service';
import dayjs from 'dayjs';
import kvConst from '../const/kv-const';
import { t } from '../i18n/i18n'
import domainUtils from '../utils/domain-uitls';
import account from "../entity/account";
import { att } from '../entity/att';
import telegramService from './telegram-service';
import kvCache from '../cache/kv-cache';
import r2Service from './r2-service';
import labelService from './label-service';
import { draftAttPrefix } from './draft-service';
import { ensureDeleteTime, ensureIsArchive, ensureIsSpam, ensureReplyTo, ensureSenderEmail } from '../utils/schema-guard';
import { afterReceive } from '../email/after-receive';

// References header for a reply: the original's own References chain plus
// its Message-ID, so every client threads the whole conversation (it used to
// carry only the parent's id). Long chains keep the first and the latest ids.
// Compares the last two labels of each address's domain (three under a
// two-part suffix like co.uk / com.cn), which is close enough to tell
// bounce.example.com from example.com apart from a third party.
const SEPARATE_SEND_LIMIT = 50;

const SECOND_LEVEL = new Set(['co', 'com', 'net', 'org', 'gov', 'edu', 'ac', 'or', 'ne', 'go']);
export function sameOrgDomain(a, b) {
	const org = addr => {
		const labels = String(addr || '').toLowerCase().split('@').pop().split('.').filter(Boolean);
		const n = labels.length >= 3 && SECOND_LEVEL.has(labels[labels.length - 2]) ? 3 : 2;
		return labels.slice(-n).join('.');
	};
	return org(a) !== '' && org(a) === org(b);
}

function referencesFor(row) {
	const ids = String(row?.relation || '').match(/<[^<>\s]+>/g) || [];
	if (row?.messageId) ids.push(row.messageId.startsWith('<') ? row.messageId : `<${row.messageId}>`);
	const unique = [...new Set(ids)];
	const kept = unique.length > 20 ? [unique[0], ...unique.slice(-19)] : unique;
	return kept.join(' ');
}

// Message-IDs in a References / In-Reply-To value.
function messageIdsIn(value) {
	return String(value || '').match(/<[^<>\s]+>/g) || [];
}

// Mail count for an Archive/Spam/Trash folder; `where` is over `email e`.
async function folderCount(c, where, binds) {
	const row = await c.env.db.prepare(`SELECT COUNT(*) AS total FROM email e WHERE ${where}`).bind(...binds).first();
	return row ? row.total : 0;
}

// ── Per-request helpers ────────────────────────────────────────────────────

// Cache shared account IDs on Hono context — avoids the same DB query being
// executed 9+ times per request in email list/delete/spam/latest operations.
async function getSharedAccountIds(c, userId) {
	const ctxKey = '__shared_' + userId
	const cached = c.get(ctxKey)
	if (cached !== undefined) return cached
	let ids = []
	try {
		const { results } = await c.env.db
			.prepare('SELECT account_id FROM account_share WHERE user_id = ?')
			.bind(userId).all()
		ids = results.map(r => r.account_id)
	} catch {}
	c.set(ctxKey, ids)
	return ids
}

// Access scope for a single-account read. The query already pins account_id = ?, so the
// "own mail OR shared account" test collapses to ONE indexable predicate: a shared account
// grants the whole account (no user filter), otherwise only the caller's own rows. Same result
// set as the OR form, but it lets the planner use an (account_id, ...) or (user_id, account_id, ...)
// index instead of walking idx_email_type and filtering every row.
function accountAccessCond(userId, accountId, sharedIds) {
	return sharedIds.includes(Number(accountId)) ? undefined : eq(email.userId, userId);
}

// Module-level schema detection cache — probing a column on every list request
// adds 2 extra D1 queries. Cache the result for the Worker's lifetime.
const SCHEMA_TTL = 3600
async function columnExists(c, table, col) {
	const key = 'schema:' + table + ':' + col
	const hit = kvCache.get(key)
	if (hit !== null) return hit
	let exists = false
	try { await c.env.db.prepare(`SELECT ${col} FROM ${table} LIMIT 0`).run(); exists = true } catch {}
	kvCache.set(key, exists, SCHEMA_TTL)
	return exists
}

// ── .eml export helpers ─────────────────────────────────────────────────
function arrayBufferToBase64(buf) {
	const bytes = new Uint8Array(buf)
	let binary = ''
	const chunkSize = 0x8000
	for (let i = 0; i < bytes.length; i += chunkSize) {
		binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
	}
	return btoa(binary)
}

function utf8ToBase64(str) {
	return arrayBufferToBase64(new TextEncoder().encode(str).buffer)
}

function wrapBase64(b64) {
	return b64.replace(/(.{76})/g, '$1\r\n')
}

function encodeMimeWord(str) {
	if (/^[\x00-\x7F]*$/.test(str)) return str
	return `=?UTF-8?B?${utf8ToBase64(str)}?=`
}

// Strips CR/LF so untrusted values (subject, attachment filenames, sender
// name…) can't inject extra header/MIME lines into the exported .eml.
function sanitizeHeaderValue(str) {
	return String(str ?? '').replace(/[\r\n]+/g, ' ')
}

function emlSafeFilename(row, emailId) {
	const date = row.create_time ? String(row.create_time).slice(0, 10) : 'unknown'
	const subject = (row.subject || 'no-subject').replace(/[\\/:*?"<>|]/g, '_').slice(0, 60)
	return `${date}_${subject}_${emailId}.eml`
}

// archiveList()/spamList()/trashList() query via raw c.env.db.prepare()
// instead of drizzle (they need dynamic WHERE clauses drizzle's typed query
// builder doesn't fit well here), which means the returned rows carry the
// literal snake_case SQL column names (email_id, account_id, ...) — NOT the
// camelCase drizzle normally maps to. Every consumer of these lists
// (emailAddAtt, labelService.attachLabels, and the entire frontend
// email-scroll component) keys off `.emailId`, so without this mapping
// every row in Archive/Spam/Trash had emailId === undefined: attachments
// never resolved, and the frontend couldn't select/star/delete/key rows in
// those three folders at all.
function mapRawEmailRow(row) {
	return {
		emailId: row.email_id,
		sendEmail: row.send_email,
		name: row.name,
		accountId: row.account_id,
		userId: row.user_id,
		subject: row.subject,
		code: row.code,
		text: row.text,
		content: row.content,
		cc: row.cc,
		bcc: row.bcc,
		recipient: row.recipient,
		toEmail: row.to_email,
		toName: row.to_name,
		replyTo: row.reply_to,
		inReplyTo: row.in_reply_to,
		relation: row.relation,
		messageId: row.message_id,
		type: row.type,
		status: row.status,
		resendEmailId: row.resend_email_id,
		message: row.message,
		unread: row.unread,
		createTime: row.create_time,
		isDel: row.is_del,
		isArchive: row.is_archive,
		isSpam: row.is_spam,
		deleteTime: row.delete_time,
		isStar: row.star_id != null ? 1 : 0,
	};
}

const emailService = {

	async list(c, params, userId) {

		let { emailId, type, accountId, size, timeSort, allReceive, unread } = params;

		size = Number(size);
		// "Unread" filter: only mail not yet read, counted the same way.
		const unreadFilter = Number(unread) === 1 ? eq(email.unread, emailConst.unread.UNREAD) : sql`1=1`;
		emailId = Number(emailId);
		// Follow-up pages (cursor given) skip the COUNT: it reads one index row per mail in the
		// mailbox (measured: 2316 rows read for a 2316-mail inbox vs 21 for the page itself) and
		// the client already has the total from page one.
		const isFirstPage = !emailId;
		timeSort = Number(timeSort);
		accountId = Number(accountId);
		allReceive = Number(allReceive);

		if (size > 50) {
			size = 50;
		}

		if (!emailId) {

			if (timeSort) {
				emailId = 0;
			} else {
				emailId = 9999999999;
			}

		}

		if (isNaN(allReceive)) {
			let accountRow = await accountService.selectById(c, accountId);
			allReceive = accountRow.allReceive;
		}

		const sharedEmailAccountIds = await getSharedAccountIds(c, userId)
		const accessCond = allReceive
			? (sharedEmailAccountIds.length > 0
				? or(eq(email.userId, userId), inArray(email.accountId, sharedEmailAccountIds))
				: eq(email.userId, userId))
			: accountAccessCond(userId, accountId, sharedEmailAccountIds);

		const spamFilter   = await columnExists(c, 'email', 'is_spam')    ? sql`COALESCE(email.is_spam, 0) = 0`    : null
		const archiveFilter = await columnExists(c, 'email', 'is_archive') ? sql`COALESCE(email.is_archive, 0) = 0` : null

		const query = orm(c)
			.select({
				...email,
				starId: star.starId
			})
			.from(email)
			.leftJoin(
				star,
				and(
					eq(star.emailId, email.emailId),
					eq(star.userId, userId)
				)
			).leftJoin(
				account,
				eq(account.accountId, email.accountId)
			)
			.where(
				and(
					allReceive ? eq(1,1) : eq(email.accountId, accountId),
					accessCond,
					timeSort ? gt(email.emailId, emailId) : lt(email.emailId, emailId),
					eq(email.type, type),
					eq(email.isDel, isDel.NORMAL),
					eq(account.isDel, isDel.NORMAL),
					spamFilter ?? sql`1=1`,
					archiveFilter ?? sql`1=1`,
					unreadFilter
				)
			);

		if (timeSort) {
			query.orderBy(asc(email.emailId));
		} else {
			query.orderBy(desc(email.emailId));
		}

		const listQuery = query.limit(size).all();

		// reuse the same sharedEmailAccountIds computed above

		const totalQuery = isFirstPage ? orm(c).select({ total: count() }).from(email)
			.leftJoin(
				account,
				eq(account.accountId, email.accountId)
			)
			.where(
				and(
					allReceive ? eq(1,1) : eq(email.accountId, accountId),
					accessCond,
					eq(email.type, type),
					eq(email.isDel, isDel.NORMAL),
					eq(account.isDel, isDel.NORMAL),
					spamFilter ?? sql`1=1`,
					archiveFilter ?? sql`1=1`,
					unreadFilter
				)
		).get() : Promise.resolve(null);

		const latestEmailQuery = orm(c).select().from(email).where(
			and(
				allReceive ? eq(1,1) : eq(email.accountId, accountId),
				accessCond,
				eq(email.type, type),
				eq(email.isDel, isDel.NORMAL)
			))
			.orderBy(desc(email.emailId)).limit(1).get();

		let [list, totalRow, latestEmail] = await Promise.all([listQuery, totalQuery, latestEmailQuery]);

		list = list.map(item => ({
			...item,
			isStar: item.starId != null ? 1 : 0
		}));


		await this.emailAddAtt(c, list);
		await labelService.attachLabels(c, list);

		if (!latestEmail) {
			latestEmail = {
				emailId: 0,
				accountId: accountId,
				userId: userId,
			}
		}

		return { list, total: totalRow ? totalRow.total : null, latestEmail };
	},

	async archiveEmail(c, params, userId) {
		const emailIdList = String(params.emailIds).split(',').map(Number).filter(Boolean);
		if (!emailIdList.length) return;
		await ensureIsArchive(c);
		const sharedIds = await getSharedAccountIds(c, userId)
		const placeholders = emailIdList.map(() => '?').join(',');
		const cond = sharedIds.length > 0 ? `(user_id = ? OR account_id IN (${sharedIds.map(() => '?').join(',')}))` : 'user_id = ?';
		await c.env.db.prepare(`UPDATE email SET is_archive = 1 WHERE email_id IN (${placeholders}) AND ${cond}`).bind(...emailIdList, userId, ...sharedIds).run();
	},

	async unarchiveEmail(c, params, userId) {
		const emailIdList = String(params.emailIds).split(',').map(Number).filter(Boolean);
		if (!emailIdList.length) return;
		const sharedIds = await getSharedAccountIds(c, userId)
		const placeholders = emailIdList.map(() => '?').join(',');
		const cond = sharedIds.length > 0 ? `(user_id = ? OR account_id IN (${sharedIds.map(() => '?').join(',')}))` : 'user_id = ?';
		try { await c.env.db.prepare(`UPDATE email SET is_archive = 0 WHERE email_id IN (${placeholders}) AND ${cond}`).bind(...emailIdList, userId, ...sharedIds).run(); } catch {}
		// Moving a snoozed mail back by hand ends the snooze.
		try { await c.env.db.prepare(`DELETE FROM psg_snooze WHERE email_id IN (${placeholders}) AND user_id = ?`).bind(...emailIdList, userId).run(); } catch {}
	},

	async archiveList(c, params, userId) {
		let { emailId, accountId, size, allReceive } = params;
		const isFirstPage = !Number(emailId);
		emailId   = Number(emailId) || 9999999999;
		accountId = Number(accountId);
		size      = Math.min(Number(size) || 20, 50);
		allReceive= Number(allReceive);
		const sharedIds = await getSharedAccountIds(c, userId)
		const accountCond = allReceive ? '' : 'AND e.account_id = ?';
		const accessBinds = sharedIds.length > 0 ? [userId, ...sharedIds] : [userId];
		const accessCond  = sharedIds.length > 0 ? `(e.user_id = ? OR e.account_id IN (${sharedIds.map(() => '?').join(',')}))` : 'e.user_id = ?';
		try {
			const { results } = await c.env.db.prepare(`
				SELECT e.*, s.star_id FROM email e
				LEFT JOIN star s ON s.email_id = e.email_id AND s.user_id = ?
				WHERE ${accessCond} AND e.is_del = 0 AND COALESCE(e.is_archive,0) = 1
				${accountCond} AND e.email_id < ?
				ORDER BY e.email_id DESC LIMIT ?
			`).bind(userId, ...accessBinds, ...(allReceive ? [] : [accountId]), emailId, size).all();
			const list = results.map(mapRawEmailRow);
			await this.emailAddAtt(c, list);
			await labelService.attachLabels(c, list);
			// Whole-folder count on the first page only; later pages keep it.
			const total = isFirstPage ? await folderCount(c,
				`${accessCond} AND e.is_del = 0 AND COALESCE(e.is_archive,0) = 1 ${accountCond}`,
				[...accessBinds, ...(allReceive ? [] : [accountId])]) : null;
			return { list, total, latestEmail: list[0] || { emailId: 0, accountId, userId } };
		} catch { return { list: [], total: 0, latestEmail: { emailId: 0, accountId, userId } }; }
	},

	// Snooze: archive now, back to the inbox (unread) at `until` (epoch ms).
	// Table psg_snooze, migrations/0028_snooze.sql.
	async snooze(c, params, userId) {
		const emailIdList = String(params.emailIds).split(',').map(Number).filter(Boolean);
		const until = Number(params.until);
		if (!emailIdList.length) return;
		if (!Number.isFinite(until) || until <= Date.now()) throw new BizError(t('snoozeTimeInvalid'), 400);
		const sharedIds = await getSharedAccountIds(c, userId);
		const placeholders = emailIdList.map(() => '?').join(',');
		const cond = sharedIds.length > 0 ? `(user_id = ? OR account_id IN (${sharedIds.map(() => '?').join(',')}))` : 'user_id = ?';
		const { results } = await c.env.db.prepare(
			`SELECT email_id FROM email WHERE email_id IN (${placeholders}) AND is_del = 0 AND ${cond}`
		).bind(...emailIdList, userId, ...sharedIds).all();
		const ids = results.map(r => r.email_id);
		if (!ids.length) return;
		await ensureIsArchive(c);
		await c.env.db.batch([
			...ids.map(id => c.env.db.prepare('INSERT OR REPLACE INTO psg_snooze (email_id, user_id, until) VALUES (?, ?, ?)').bind(id, userId, until)),
			c.env.db.prepare(`UPDATE email SET is_archive = 1 WHERE email_id IN (${ids.map(() => '?').join(',')})`).bind(...ids),
		]);
	},

	async unsnooze(c, params, userId) {
		const emailIdList = String(params.emailIds).split(',').map(Number).filter(Boolean);
		if (!emailIdList.length) return;
		const placeholders = emailIdList.map(() => '?').join(',');
		const { results } = await c.env.db.prepare(
			`SELECT email_id FROM psg_snooze WHERE email_id IN (${placeholders}) AND user_id = ?`
		).bind(...emailIdList, userId).all();
		const ids = results.map(r => r.email_id);
		if (!ids.length) return;
		const idList = ids.map(() => '?').join(',');
		await c.env.db.batch([
			c.env.db.prepare(`DELETE FROM psg_snooze WHERE email_id IN (${idList})`).bind(...ids),
			c.env.db.prepare(`UPDATE email SET is_archive = 0 WHERE email_id IN (${idList})`).bind(...ids),
		]);
	},

	async snoozeList(c, params, userId) {
		let { emailId, size } = params;
		emailId = Number(emailId) || 9999999999;
		size = Math.min(Number(size) || 20, 50);
		const isFirstPage = emailId === 9999999999;
		try {
			const { results } = await c.env.db.prepare(`
				SELECT e.*, s.star_id, z.until AS snooze_until FROM psg_snooze z
				JOIN email e ON e.email_id = z.email_id
				LEFT JOIN star s ON s.email_id = e.email_id AND s.user_id = ?
				WHERE z.user_id = ? AND e.is_del = 0 AND e.email_id < ?
				ORDER BY e.email_id DESC LIMIT ?
			`).bind(userId, userId, emailId, size).all();
			const list = results.map(row => ({ ...mapRawEmailRow(row), snoozeUntil: row.snooze_until }));
			await this.emailAddAtt(c, list);
			await labelService.attachLabels(c, list);
			const total = isFirstPage
				? (await c.env.db.prepare('SELECT COUNT(*) AS n FROM psg_snooze z JOIN email e ON e.email_id = z.email_id WHERE z.user_id = ? AND e.is_del = 0').bind(userId).first())?.n || 0
				: null;
			return { list, total, latestEmail: list[0] || { emailId: 0, userId } };
		} catch {
			return { list: [], total: 0, latestEmail: { emailId: 0, userId } };
		}
	},

	// Per-minute cron: snoozes that are due go back to the inbox as unread.
	async processDueSnoozes(c) {
		let due;
		try {
			({ results: due } = await c.env.db.prepare('SELECT email_id FROM psg_snooze WHERE until <= ? LIMIT 200').bind(Date.now()).all());
		} catch {
			return 0; // table not migrated yet
		}
		if (!due.length) return 0;
		const ids = due.map(r => r.email_id);
		const idList = ids.map(() => '?').join(',');
		await c.env.db.batch([
			c.env.db.prepare(`UPDATE email SET is_archive = 0, unread = ? WHERE email_id IN (${idList})`).bind(emailConst.unread.UNREAD, ...ids),
			c.env.db.prepare(`DELETE FROM psg_snooze WHERE email_id IN (${idList})`).bind(...ids),
		]);
		return ids.length;
	},

	async markSpam(c, params, userId) {
		const emailIdList = String(params.emailIds).split(',').map(Number).filter(Boolean);
		if (!emailIdList.length) return;
		// auto-add column if missing
		await ensureIsSpam(c);
		const spamShared = await getSharedAccountIds(c, userId)
		const placeholders = emailIdList.map(() => '?').join(',');
		const spamCond = spamShared.length > 0
			? `(user_id = ? OR account_id IN (${spamShared.map(() => '?').join(',')}))`
			: `user_id = ?`;
		await c.env.db.prepare(
			`UPDATE email SET is_spam = 1 WHERE email_id IN (${placeholders}) AND ${spamCond}`
		).bind(...emailIdList, userId, ...spamShared).run();
	},

	async unmarkSpam(c, params, userId) {
		const emailIdList = String(params.emailIds).split(',').map(Number).filter(Boolean);
		if (!emailIdList.length) return;
		const unspamShared = await getSharedAccountIds(c, userId)
		const placeholders = emailIdList.map(() => '?').join(',');
		const unspamCond = unspamShared.length > 0
			? `(user_id = ? OR account_id IN (${unspamShared.map(() => '?').join(',')}))`
			: `user_id = ?`;
		try {
			await c.env.db.prepare(
				`UPDATE email SET is_spam = 0 WHERE email_id IN (${placeholders}) AND ${unspamCond}`
			).bind(...emailIdList, userId, ...unspamShared).run();
		} catch {}
		// "Not spam" also clears any AI verdict and trusts the senders for the
		// mailbox owner (screening runs as the owner, also for shared
		// mailboxes) — limited to mail this user can actually access.
		try {
			const { results } = await c.env.db.prepare(
				`SELECT email_id FROM email WHERE email_id IN (${placeholders}) AND ${unspamCond}`
			).bind(...emailIdList, userId, ...unspamShared).all();
			await spamService.trustSenders(c, (results || []).map(r => r.email_id));
		} catch {}
	},

	async spamVerdict(c, params, userId) {
		const emailId = Number(params.emailId);
		if (!emailId) return null;
		const shared = await getSharedAccountIds(c, userId)
		const cond = shared.length > 0
			? `(user_id = ? OR account_id IN (${shared.map(() => '?').join(',')}))`
			: `user_id = ?`;
		const row = await c.env.db.prepare(`SELECT 1 FROM email WHERE email_id = ? AND ${cond}`)
			.bind(emailId, userId, ...shared).first();
		return row ? spamService.verdict(c, emailId) : null;
	},

	async spamList(c, params, userId) {
		let { emailId, accountId, size, allReceive } = params;
		const isFirstPage = !Number(emailId);
		emailId   = Number(emailId) || 9999999999;
		accountId = Number(accountId);
		size      = Math.min(Number(size) || 20, 50);
		allReceive= Number(allReceive);

		try {
			const accountCond = allReceive ? '' : 'AND e.account_id = ?';

			const spamSharedIds = await getSharedAccountIds(c, userId)

			const spamAccountCond = spamSharedIds.length > 0
				? `(e.user_id = ? OR e.account_id IN (${spamSharedIds.map(() => '?').join(',')}))`
				: 'e.user_id = ?';
			const spamAccessBinds = spamSharedIds.length > 0
				? [userId, ...spamSharedIds]
				: [userId];

			const { results } = await c.env.db.prepare(`
				SELECT e.*, s.star_id
				FROM email e
				LEFT JOIN star s ON s.email_id = e.email_id AND s.user_id = ?
				WHERE ${spamAccountCond}
				  AND e.is_del = 0
				  AND COALESCE(e.is_spam, 0) = 1
				  ${accountCond}
				  AND e.email_id < ?
				ORDER BY e.email_id DESC
				LIMIT ?
			`).bind(userId, ...spamAccessBinds, ...(allReceive ? [] : [accountId]), emailId, size).all();

			const list = results.map(mapRawEmailRow);
			await this.emailAddAtt(c, list);
			await labelService.attachLabels(c, list);

			const latestEmail = list[0] || { emailId: 0, accountId, userId };
			const total = isFirstPage ? await folderCount(c,
				`${spamAccountCond} AND e.is_del = 0 AND COALESCE(e.is_spam, 0) = 1 ${accountCond}`,
				[...spamAccessBinds, ...(allReceive ? [] : [accountId])]) : null;
			return { list, total, latestEmail };
		} catch {
			return { list: [], total: 0, latestEmail: { emailId: 0, accountId, userId } };
		}
	},

	async delete(c, params, userId) {
		const { emailIds } = params;
		const emailIdList = emailIds.split(',').map(Number);
		const sharedIds = await getSharedAccountIds(c, userId)
		const ownerCond = eq(email.userId, userId);
		const accessCond = sharedIds.length > 0
			? or(ownerCond, inArray(email.accountId, sharedIds))
			: ownerCond;

		const { syncDelete } = await settingService.query(c);
		if (syncDelete === settingConst.syncDelete.OPEN) {
			const owned = await orm(c).select({ emailId: email.emailId }).from(email)
				.where(and(accessCond, inArray(email.emailId, emailIdList))).all();
			const ownedIds = owned.map(row => row.emailId);
			if (ownedIds.length > 0) {
				await this.physicsDelete(c, { emailIds: ownedIds.join(',') });
			}
			return;
		}

		await ensureDeleteTime(c);
		// One scoped UPDATE: the trash timestamp is written only on rows the caller may access
		// (it used to be a second, unscoped UPDATE by email_id alone).
		const delIds = emailIdList.filter(Number.isInteger);
		if (delIds.length === 0) return;
		const delShared = sharedIds;
		const delCond = delShared.length > 0
			? `(user_id = ? OR account_id IN (${delShared.map(() => '?').join(',')}))`
			: 'user_id = ?';
		await c.env.db.prepare(
			`UPDATE email SET is_del = ?, delete_time = CASE WHEN is_del = ? THEN delete_time ELSE CURRENT_TIMESTAMP END
			 WHERE email_id IN (${delIds.map(() => '?').join(',')}) AND ${delCond}`
		).bind(isDel.DELETE, isDel.DELETE, ...delIds, userId, ...delShared).run();
	},

	async restore(c, params, userId) {
		const emailIdList = String(params.emailIds).split(',').map(Number).filter(Boolean);
		if (!emailIdList.length) return;
		const sharedIds = await getSharedAccountIds(c, userId)
		const placeholders = emailIdList.map(() => '?').join(',');
		const cond = sharedIds.length > 0 ? `(user_id = ? OR account_id IN (${sharedIds.map(() => '?').join(',')}))` : 'user_id = ?';
		await c.env.db.prepare(
			`UPDATE email SET is_del = 0, delete_time = NULL WHERE email_id IN (${placeholders}) AND is_del = 1 AND ${cond}`
		).bind(...emailIdList, userId, ...sharedIds).run();
	},

	async trashList(c, params, userId) {
		let { emailId, accountId, size, allReceive } = params;
		const isFirstPage = !Number(emailId);
		emailId   = Number(emailId) || 9999999999;
		accountId = Number(accountId);
		size      = Math.min(Number(size) || 20, 50);
		allReceive= Number(allReceive);
		try {
			const accountCond = allReceive ? '' : 'AND e.account_id = ?';
			const sharedIds = await getSharedAccountIds(c, userId)
			const accessCond  = sharedIds.length > 0 ? `(e.user_id = ? OR e.account_id IN (${sharedIds.map(() => '?').join(',')}))` : 'e.user_id = ?';
			const accessBinds = sharedIds.length > 0 ? [userId, ...sharedIds] : [userId];
			const { results } = await c.env.db.prepare(`
				SELECT e.*, s.star_id FROM email e
				LEFT JOIN star s ON s.email_id = e.email_id AND s.user_id = ?
				WHERE ${accessCond} AND e.is_del = 1
				${accountCond} AND e.email_id < ?
				ORDER BY e.email_id DESC LIMIT ?
			`).bind(userId, ...accessBinds, ...(allReceive ? [] : [accountId]), emailId, size).all();
			const list = results.map(mapRawEmailRow);
			await this.emailAddAtt(c, list);
			await labelService.attachLabels(c, list);
			const total = isFirstPage ? await folderCount(c,
				`${accessCond} AND e.is_del = 1 ${accountCond}`,
				[...accessBinds, ...(allReceive ? [] : [accountId])]) : null;
			return { list, total, latestEmail: list[0] || { emailId: 0, accountId, userId } };
		} catch { return { list: [], total: 0, latestEmail: { emailId: 0, accountId, userId } }; }
	},

	async permanentDelete(c, params, userId) {
		const emailIdList = String(params.emailIds).split(',').map(Number).filter(Boolean);
		if (!emailIdList.length) return;
		const sharedIds = await getSharedAccountIds(c, userId)
		const placeholders = emailIdList.map(() => '?').join(',');
		const cond = sharedIds.length > 0 ? `(user_id = ? OR account_id IN (${sharedIds.map(() => '?').join(',')}))` : 'user_id = ?';
		const { results } = await c.env.db.prepare(
			`SELECT email_id FROM email WHERE email_id IN (${placeholders}) AND is_del = 1 AND ${cond}`
		).bind(...emailIdList, userId, ...sharedIds).all();
		const idsToDelete = results.map(r => r.email_id);
		if (!idsToDelete.length) return;
		// physicsDelete also drops the mail's stars and label links.
		await this.physicsDelete(c, { emailIds: idsToDelete.join(',') });
	},

	// "Empty Deleted" / "Empty Spam": erases every mail in the folder (all the
	// caller's addresses, or one). Works in batches so one request stays within
	// the Worker's limits; `more` tells the client to call again.
	async emptyFolder(c, params, userId) {
		const folder = params.folder;
		if (folder !== 'trash' && folder !== 'spam') throw new BizError(t('unknownFolder'), 400);
		const accountId = Number(params.accountId);
		const allReceive = Number(params.allReceive);
		const BATCH = 500;
		const sharedIds = await getSharedAccountIds(c, userId);
		const accessCond = sharedIds.length > 0
			? `(user_id = ? OR account_id IN (${sharedIds.map(() => '?').join(',')}))`
			: 'user_id = ?';
		const folderCond = folder === 'trash' ? 'is_del = 1' : 'is_del = 0 AND COALESCE(is_spam, 0) = 1';
		const accountCond = allReceive ? '' : 'AND account_id = ?';
		const { results } = await c.env.db.prepare(
			`SELECT email_id FROM email WHERE ${accessCond} AND ${folderCond} ${accountCond} LIMIT ?`
		).bind(userId, ...sharedIds, ...(allReceive ? [] : [accountId]), BATCH + 1).all();
		const ids = results.slice(0, BATCH).map(r => r.email_id);
		if (ids.length) await this.physicsDelete(c, { emailIds: ids.join(',') });
		return { deleted: ids.length, more: results.length > BATCH };
	},

	// D1 allows 100 bound parameters per statement, so ids are handled in chunks of 90. Each run
	// is capped (MAX_PURGE_PER_RUN) to stay inside the cron's time budget; whatever is left is
	// picked up by the next daily run. Uses physicsDelete so stars/attachments/labels go with the mail.
	async purgeExpiredTrash(c) {
		const setting = await settingService.query(c);
		const days = Number(setting.autoDeleteDays) || 30;
		const cutoff = dayjs().subtract(days, 'day').format('YYYY-MM-DD HH:mm:ss');
		const CHUNK = 90;
		const MAX_PURGE_PER_RUN = 5000;
		let purged = 0;
		try {
			await ensureDeleteTime(c);
			while (purged < MAX_PURGE_PER_RUN) {
				const { results } = await c.env.db.prepare(
					`SELECT email_id FROM email WHERE is_del = 1 AND delete_time IS NOT NULL AND delete_time < ? ORDER BY email_id LIMIT ${CHUNK}`
				).bind(cutoff).all();
				if (!results.length) break;
				await this.physicsDelete(c, { emailIds: results.map(r => r.email_id).join(',') });
				purged += results.length;
				if (results.length < CHUNK) break;
			}
		} catch (e) {
			console.error('purgeExpiredTrash failed after', purged, 'mails:', e.message);
		}
		return { purged };
	},

	// Ownership-scoped single-row fetch (includes trashed rows) — shared by the
	// External API and the AI assistant tools, neither of which should see
	// other users' mail regardless of soft-delete state.
	async getOwned(c, emailId, userId) {
		emailId = Number(emailId);
		const sharedIds = await getSharedAccountIds(c, userId);
		const accessCond = sharedIds.length > 0
			? `(user_id = ? OR account_id IN (${sharedIds.map(() => '?').join(',')}))`
			: 'user_id = ?';
		const { results } = await c.env.db.prepare(
			`SELECT * FROM email WHERE email_id = ? AND ${accessCond}`
		).bind(emailId, userId, ...sharedIds).all();
		return results[0] || null;
	},

	// Single-email fetch for the client's new-mail sync path (Firebase push
	// carries only { emailId, accountId } — the client calls this to get the
	// full row for Inbox display). Access-scoped like list() (owner or shared
	// account), same camelCase + isStar + attList shape list() returns, and
	// excludes trashed/staging rows since a push only ever names a
	// just-received, currently-visible email.
	async detail(c, emailId, userId) {
		emailId = Number(emailId);
		const sharedIds = await getSharedAccountIds(c, userId);
		const accessCond = sharedIds.length > 0
			? or(eq(email.userId, userId), inArray(email.accountId, sharedIds))
			: eq(email.userId, userId);

		const row = await orm(c).select({ ...email, starId: star.starId })
			.from(email)
			.leftJoin(star, and(eq(star.emailId, email.emailId), eq(star.userId, userId)))
			.where(and(eq(email.emailId, emailId), accessCond, eq(email.isDel, isDel.NORMAL)))
			.get();

		if (!row) return null;
		row.isStar = row.starId != null ? 1 : 0;
		// is_archive isn't in the drizzle entity (older databases lack it); the
		// client uses it to keep rule-archived mail out of the Inbox.
		try {
			const flags = await c.env.db.prepare('SELECT is_archive FROM email WHERE email_id = ?').bind(emailId).first();
			row.isArchive = flags?.is_archive || 0;
		} catch { row.isArchive = 0; }
		try {
			const r = await c.env.db.prepare('SELECT reply_to FROM email WHERE email_id = ?').bind(emailId).first();
			row.replyTo = r?.reply_to || '';
		} catch { row.replyTo = ''; }
		try {
			const r = await c.env.db.prepare('SELECT sender_email FROM email WHERE email_id = ?').bind(emailId).first();
			row.senderEmail = r?.sender_email || '';
		} catch { row.senderEmail = ''; }
		const list = [row];
		await this.emailAddAtt(c, list);
		await labelService.attachLabels(c, list);
		return list[0];
	},

	async updateCode(c, emailId, code) {
		await orm(c).update(email).set({ code }).where(eq(email.emailId, emailId)).run();
	},

	// Simple subject/sender search scoped to the caller's own mail — used by
	// the AI assistant's searchEmails tool.
	async searchOwned(c, userId, { query, limit }) {
		const sharedIds = await getSharedAccountIds(c, userId);
		const accessCond = sharedIds.length > 0
			? `(user_id = ? OR account_id IN (${sharedIds.map(() => '?').join(',')}))`
			: 'user_id = ?';
		const like = `%${String(query || '').slice(0, 100)}%`;
		const { results } = await c.env.db.prepare(
			`SELECT email_id, subject, send_email, name, to_email, create_time, is_del
			 FROM email
			 WHERE ${accessCond} AND (subject LIKE ? COLLATE NOCASE OR send_email LIKE ? COLLATE NOCASE)
			 ORDER BY email_id DESC LIMIT ?`
		).bind(userId, ...sharedIds, like, like, Math.min(Number(limit) || 10, 30)).all();
		return results;
	},

	// Builds a standalone RFC 5322 .eml file (multipart/mixed + multipart/alternative,
	// attachments embedded as base64 parts) for a single email, for download/export.
	async buildEml(c, emailId, userId) {
		emailId = Number(emailId);
		const row = await this.getOwned(c, emailId, userId);
		if (!row) throw new BizError(t('emailNotExist'));

		const attList = await attService.selectByEmailIds(c, [emailId]);

		const boundaryAlt = `alt_${emailId}_${Date.now().toString(36)}`;
		const boundaryMixed = `mix_${emailId}_${Date.now().toString(36)}`;

		const dateHeader = row.create_time
			? new Date(String(row.create_time).replace(' ', 'T') + 'Z').toUTCString()
			: new Date().toUTCString();

		const fromHeader = row.name
			? `"${sanitizeHeaderValue(row.name).replace(/"/g, '')}" <${sanitizeHeaderValue(row.send_email)}>`
			: sanitizeHeaderValue(row.send_email);

		let cc = [];
		try { cc = JSON.parse(row.cc || '[]'); } catch {}

		const headerLines = [
			`From: ${fromHeader}`,
			`To: ${sanitizeHeaderValue(row.to_email)}`,
			cc.length ? `Cc: ${sanitizeHeaderValue(cc.join(', '))}` : null,
			`Subject: ${encodeMimeWord(sanitizeHeaderValue(row.subject || '(no subject)'))}`,
			`Date: ${dateHeader}`,
			`Message-ID: ${sanitizeHeaderValue(row.message_id || `<${emailId}@cloudmail>`)}`,
			`MIME-Version: 1.0`,
		].filter(Boolean);

		const altLines = [
			`Content-Type: multipart/alternative; boundary="${boundaryAlt}"`,
			``,
			`--${boundaryAlt}`,
			`Content-Type: text/plain; charset=UTF-8`,
			`Content-Transfer-Encoding: base64`,
			``,
			wrapBase64(utf8ToBase64(row.text || '')),
			`--${boundaryAlt}`,
			`Content-Type: text/html; charset=UTF-8`,
			`Content-Transfer-Encoding: base64`,
			``,
			wrapBase64(utf8ToBase64(row.content || row.text || '')),
			`--${boundaryAlt}--`,
		];

		const filename = emlSafeFilename(row, emailId);

		if (!attList.length) {
			return { filename, content: headerLines.concat(altLines).join('\r\n') };
		}

		const attParts = [];
		for (const a of attList) {
			try {
				const obj = await r2Service.getObj(c, a.key);
				if (!obj) continue;
				const buf = await obj.arrayBuffer();
				const safeMime = sanitizeHeaderValue(a.mimeType || 'application/octet-stream');
				const safeName = sanitizeHeaderValue(a.filename || 'attachment').replace(/"/g, '');
				attParts.push(
					`--${boundaryMixed}`,
					`Content-Type: ${safeMime}; name="${safeName}"`,
					`Content-Transfer-Encoding: base64`,
					`Content-Disposition: attachment; filename="${safeName}"`,
					``,
					wrapBase64(arrayBufferToBase64(buf)),
				);
			} catch (e) {
				console.error(`export eml: failed to read attachment ${a.key}`, e);
			}
		}

		const bodyLines = [
			`Content-Type: multipart/mixed; boundary="${boundaryMixed}"`,
			``,
			`--${boundaryMixed}`,
			...altLines,
			...attParts,
			`--${boundaryMixed}--`,
		];

		return { filename, content: headerLines.concat(bodyLines).join('\r\n') };
	},

	// Reply-To of a received mail; skipped when it only repeats From.
	async saveReplyTo(c, emailId, replyTo, fromAddress) {
		const list = (Array.isArray(replyTo) ? replyTo : [])
			.flatMap(r => Array.isArray(r?.group) ? r.group : [r])
			.filter(r => r?.address)
			.map(r => ({ address: String(r.address).trim(), name: r.name || '' }));
		const from = String(fromAddress || '').toLowerCase();
		if (!list.length || list.every(r => r.address.toLowerCase() === from)) return;
		await ensureReplyTo(c);
		await c.env.db.prepare('UPDATE email SET reply_to = ? WHERE email_id = ?')
			.bind(JSON.stringify(list), emailId).run();
	},

	// Who actually sent a received mail when it is not the From domain: the
	// Sender header (on behalf of), else the envelope sender. Stored only
	// when its domain differs from From's, so mailing lists and bulk mail
	// from the sender's own domain show nothing.
	async saveSenderEmail(c, emailId, { sender, envelopeFrom, fromAddress }) {
		const address = String(sender?.address || envelopeFrom || '').trim();
		if (!address || sameOrgDomain(address, fromAddress)) return;
		await ensureSenderEmail(c);
		await c.env.db.prepare('UPDATE email SET sender_email = ? WHERE email_id = ?')
			.bind(address, emailId).run();
	},

	receive(c, params, cidAttList, r2domain) {
		params.content = this.imgReplace(params.content, cidAttList, r2domain)
		return orm(c).insert(email).values({ ...params }).returning().get();
	},

	//邮件发送
	async send(c, params, userId) {

		// Send separately: one mail per To recipient, so nobody sees the
		// others. Each copy goes through the normal path (limits, providers,
		// Sent folder). A failed copy does not stop the rest; if every copy
		// fails the first error is thrown.
		if (params.separate && Array.isArray(params.receiveEmail) && params.receiveEmail.length > 1) {
			if (params.receiveEmail.length > SEPARATE_SEND_LIMIT) {
				throw new BizError(t('separateSendLimit', { count: SEPARATE_SEND_LIMIT }));
			}
			if (params.cc?.length || params.bcc?.length) {
				throw new BizError(t('separateNoCc'));
			}
			const sent = [];
			let firstError = null;
			let failed = 0;
			for (const address of [...new Set(params.receiveEmail)]) {
				try {
					sent.push(...await this.send(c, { ...params, separate: false, receiveEmail: [address] }, userId));
				} catch (e) {
					firstError = firstError || e;
					failed++;
				}
			}
			if (!sent.length) throw firstError;
			if (failed) sent[0].separateFailed = failed;
			return sent;
		}

		let {
			accountId, //发送账号id
			name, //发件人名字
			sendType, //发件类型
			emailId, //邮件id，如果是回复邮件会带
			receiveEmail, //收件人邮箱
			cc = [], //抄送
			bcc = [], //密件抄送
			text, //邮件纯文本
			content, //邮件内容
			subject, //邮件标题
			attachments = [], //附件
			autoSubmitted = false, //自动回复
			requestReceipt = false //请求已读回执
		} = params;

		// To may be empty when Cc or Bcc has someone (a Bcc-only mail), but
		// there must be at least one address somewhere.
		receiveEmail = Array.isArray(receiveEmail) ? receiveEmail : [];
		if (receiveEmail.length + cc.length + bcc.length === 0) {
			throw new BizError(t('emptyRecipient'), 400);
		}

		attachments = await this.resolveForwardedAttachments(c, attachments, userId);

		const { resendTokens, r2Domain, send, domainList, mailjetApiKey, mailjetSecretKey } = await settingService.query(c);

		let { imageDataList, html } = await attService.toImageUrlHtml(c, content);

		//判断是否关闭发件功能
		if (send === settingConst.send.CLOSE) {
			throw new BizError(t('disabledSend'), 403);
		}

		const userRow = await userService.selectById(c, userId);
		const roleRow = await roleService.selectById(c, userRow.type);

		// CC / BCC must be included — if any external recipient exists in ANY field,
		// the email must go through SMTP/Resend, not just on-site DB delivery.
		const allRecipients = [...receiveEmail, ...cc, ...bcc];
		// Quotas count every address the mail goes to, Cc and Bcc included,
		// so blind-copying a list can't get round the send limit.
		const recipientCount = new Set(allRecipients.map(e => String(e).toLowerCase())).size;
		const allInternal = allRecipients.every(email => {
			const domain = '@' + emailUtils.getDomain(email);
			return domainList.includes(domain);
		});

		if (c.env.admin !== userRow.email) {

			//发件被禁用
			if (roleRow.sendType === 'ban') {
				throw new BizError(t('bannedSend'), 403);
			}

			//发件被禁用
			if (roleRow.sendType === 'internal' && !allInternal) {
				throw new BizError(t('onlyInternalSend'), 403);
			}

		}

		//如果不是管理员，权限设置了发送次数
		if (c.env.admin !== userRow.email && roleRow.sendCount) {

			if (userRow.sendCount >= roleRow.sendCount) {
				if (roleRow.sendType === 'day') throw new BizError(t('daySendLimit'), 403);
				if (roleRow.sendType === 'count') throw new BizError(t('totalSendLimit'), 403);
			}

			if (userRow.sendCount + recipientCount > roleRow.sendCount) {
				if (roleRow.sendType === 'day') throw new BizError(t('daySendLack'), 403);
				if (roleRow.sendType === 'count') throw new BizError(t('totalSendLack'), 403);
			}

		}

		const accountRow = await accountService.selectById(c, accountId);

		if (!accountRow) {
			throw new BizError(t('senderAccountNotExist'));
		}

		if (accountRow.userId !== userId) {
			// Allow shared/bound accounts — check account_share table
			const sharedAccess = await c.env.db
				.prepare('SELECT id FROM account_share WHERE account_id = ? AND user_id = ?')
				.bind(accountId, userId).first();
			if (!sharedAccess) {
				throw new BizError(t('sendEmailNotCurUser'));
			}
		}

		if (c.env.admin !== userRow.email) {
			//用户没有这个域名的使用权限
			if(!roleService.hasAvailDomainPerm(roleRow.availDomain, accountRow.email)) {
				throw new BizError(t('noDomainPermSend'),403)
			}

		}

		const domain = emailUtils.getDomain(accountRow.email);
		const resendToken = resendTokens[domain];
		const useCloudflareEmail = !!c.env.email;
		// Static fallback order (Cloudflare > Resend > Mailjet), same shape as
		// the pre-existing Cloudflare/Resend choice below — not a dynamic
		// router: whichever of these is configured is used, in this fixed
		// order, with no quota-based or failure-based switching between them.
		const mailjetConfigured = !!(mailjetApiKey && mailjetSecretKey);

		//如果接收方存在站外邮箱，又没有发信服务
		if (!useCloudflareEmail && !resendToken && !mailjetConfigured && !allInternal) {
			throw new BizError(t('noSendProvider'));
		}

		//没有发件人名字自动截取
		if (!name) {
			name = emailUtils.getName(accountRow.email);
		}

		let emailRow = {
			messageId: null
		};

		//如果是回复邮件
		if (sendType === 'reply') {

			emailRow = await this.selectById(c, emailId);

			if (!emailRow) {
				throw new BizError(t('notExistEmailReply'));
			}

		}

		let sendResult = {};
		let provider = 'internal';

		//存在站外邮箱时，如果配置了 Cloudflare Email Service 就优先使用，否则使用 Resend，再否则使用 Mailjet
		if (!allInternal) {

			const sendParams = {
				name,
				accountEmail: accountRow.email,
				receiveEmail,
				cc,
				bcc,
				subject,
				// Providers refuse a mail with neither html nor text; an empty
				// mail (allowed, as in Gmail) goes out with a blank text part.
				text: text || (html ? text : ' '),
				html,
				attachments: [...imageDataList, ...attachments],
				sendType,
				messageId: emailRow.messageId,
				references: referencesFor(emailRow),
				autoSubmitted,
				requestReceipt: !!requestReceipt
			};

			provider = useCloudflareEmail ? 'cloudflare' : resendToken ? 'resend' : 'mailjet';
			const callProvider = params => {
				if (useCloudflareEmail) return this.sendByCloudflareEmail(c, params);
				if (resendToken) return this.sendByResend(resendToken, params);
				return this.sendByMailjet({ apiKey: mailjetApiKey, secretKey: mailjetSecretKey }, params);
			};

			// Cloudflare, Resend and Mailjet all require a To address, but a mail
			// may leave To empty (as Gmail allows). With Cc, the Cc addresses
			// take the To slot. With only Bcc, each Bcc recipient gets their own
			// copy addressed to them, so nobody sees another Bcc address and the
			// sender is never put in To or sent a copy.
			if (receiveEmail.length > 0) {
				sendResult = await callProvider(sendParams);
			} else if (cc.length > 0) {
				sendResult = await callProvider({ ...sendParams, receiveEmail: cc, cc: [] });
			} else {
				const bccList = [...new Set(bcc)];
				if (bccList.length > SEPARATE_SEND_LIMIT) {
					throw new BizError(t('bccOnlyLimit', { count: SEPARATE_SEND_LIMIT }));
				}
				let firstError = null;
				for (const address of bccList) {
					let result;
					try {
						result = await callProvider({ ...sendParams, receiveEmail: [address], bcc: [] });
					} catch (e) {
						result = { error: { message: e?.message || String(e) } };
					}
					if (result?.error) {
						console.error(`send: bcc copy to ${address} failed`, result.error.message);
						firstError = firstError || result.error;
					} else if (!sendResult.data) {
						sendResult = result;
					}
				}
				// Only a total failure fails the send; the copies already out
				// can't be recalled, so a partial one is still recorded as sent.
				if (!sendResult.data) sendResult = { error: firstError };
			}

		}

		const { data, error } = sendResult;


		if (error) {
			throw new BizError(error.message);
		}

		imageDataList = imageDataList.map(item => ({...item, contentId: `<${item.contentId}>`}))

		//把图片标签cid标签切换会通用url
		html = this.imgReplace(html, imageDataList, r2Domain);

		//封装数据保存到数据库
		const emailData = {};
		emailData.sendEmail = accountRow.email;
		emailData.name = name;
		emailData.subject = subject;
		emailData.content = html;
		emailData.text = text;
		emailData.accountId = accountId;
		emailData.status = useCloudflareEmail ? emailConst.status.DELIVERED : emailConst.status.SENT;
		emailData.type = emailConst.type.SEND;
		emailData.userId = userId;
		emailData.resendEmailId = data?.id;
		emailData.provider = provider;

		const recipient = [];
		receiveEmail.forEach(item => {
			recipient.push({ address: item, name: '' });
		});
		emailData.recipient = JSON.stringify(recipient);

		// Save CC and BCC so they appear in the reading pane
		if (cc.length > 0) {
			emailData.cc = JSON.stringify(cc.map(e => ({ address: e, name: '' })));
		}
		if (bcc.length > 0) {
			emailData.bcc = JSON.stringify(bcc.map(e => ({ address: e, name: '' })));
		}

		if (sendType === 'reply') {
			emailData.inReplyTo = emailRow.messageId;
			emailData.relation = referencesFor(emailRow);
		}

		//如果权限有发送次数增加用户发送次数
		if (roleRow.sendCount && roleRow.sendType !== 'internal') {
			await userService.incrUserSendCount(c, recipientCount, userId);
		}

		//保存到数据库并返回结果
		const emailResult = await orm(c).insert(email).values(emailData).returning().get();

		//保存内嵌附件
		if (imageDataList.length > 0) {
			if (imageDataList.length > 10) {
				throw new BizError(t('imageAttLimit'));
			}
			await attService.saveArticleAtt(c, imageDataList, userId, accountId, emailResult.emailId);
		}

		//保存普通附件
		if (attachments?.length > 0) {
			if (attachments.length > 10) {
				throw new BizError(t('attLimit'));
			}
			await attService.saveSendAtt(c, attachments, userId, accountId, emailResult.emailId);
		}

		const attList = await attService.selectByEmailIds(c, [emailResult.emailId]);
		emailResult.attList = attList;

		// Always deliver to internal recipients via DB, regardless of whether SMTP was also used.
		// This handles: allInternal (no SMTP), mixed (SMTP for external + DB for internal).
		const isInternalEmail = addr => domainList.includes('@' + emailUtils.getDomain(addr));
		const internalRecipients = [...new Set([
			...receiveEmail.filter(isInternalEmail),
			...cc.filter(isInternalEmail),
			...bcc.filter(isInternalEmail)
		])];
		if (internalRecipients.length > 0) {
			await this.HandleOnSiteEmail(c, internalRecipients, emailResult, attList, { autoSubmitted });
		}

		const dateStr = dayjs().format('YYYY-MM-DD');
		let daySendTotal = await c.env.kv.get(kvConst.SEND_DAY_COUNT + dateStr);

		//记录每天发件次数统计
		if (!daySendTotal) {
			await c.env.kv.put(kvConst.SEND_DAY_COUNT + dateStr, JSON.stringify(recipientCount), { expirationTtl: 60 * 60 * 24 });
		} else  {
			daySendTotal = Number(daySendTotal) + recipientCount
			await c.env.kv.put(kvConst.SEND_DAY_COUNT + dateStr, JSON.stringify(daySendTotal), { expirationTtl: 60 * 60 * 24 });
		}

		return [ emailResult ];
	},

	// Attachments sent by reference instead of content: { attId } is an
	// existing mail attachment being forwarded, { draftAttKey } one stored with
	// a server-side draft. Each one the caller may read is loaded from storage
	// and turned into a normal base64 attachment; the rest are dropped.
	async resolveForwardedAttachments(c, attachments, userId) {
		if (!Array.isArray(attachments) || !attachments.some(a => a && !a.content && (a.attId || a.draftAttKey))) {
			return attachments || [];
		}
		const sharedIds = await getSharedAccountIds(c, userId);
		const result = [];
		for (const item of attachments) {
			if (!item) continue;
			if (item.content || !(item.attId || item.draftAttKey)) {
				result.push(item);
				continue;
			}
			let key, filename, type;
			if (item.draftAttKey) {
				if (!String(item.draftAttKey).startsWith(draftAttPrefix(userId))) continue;
				key = item.draftAttKey;
				filename = item.filename;
				type = item.contentType;
			} else {
				const row = await c.env.db.prepare(
					`SELECT a.key, a.filename, a.mime_type FROM attachments a JOIN email e ON e.email_id = a.email_id
					 WHERE a.att_id = ? AND (e.user_id = ?${sharedIds.length ? ` OR e.account_id IN (${sharedIds.map(() => '?').join(',')})` : ''})`
				).bind(Number(item.attId), userId, ...sharedIds).first();
				if (!row) continue;
				key = row.key;
				filename = row.filename;
				type = row.mime_type;
			}
			try {
				const obj = await r2Service.getObj(c, key);
				if (!obj) continue;
				type = type || 'application/octet-stream';
				result.push({
					filename: filename || 'attachment',
					content: arrayBufferToBase64(await obj.arrayBuffer()),
					type,
					contentType: type,
				});
			} catch (e) {
				console.error(`send: failed to read attachment ${key}`, e);
			}
		}
		return result;
	},

	async sendByCloudflareEmail(c, params) {
		// Cloudflare Email API requires { email, name? } objects, not plain strings
		const toAddr = e => (typeof e === 'string' ? { email: e } : e);

		const sendForm = {
			from: { email: params.accountEmail, name: params.name },
			to: params.receiveEmail.map(toAddr),
			subject: params.subject
		};

		if (params.cc?.length > 0)  sendForm.cc  = params.cc.map(toAddr);
		if (params.bcc?.length > 0) sendForm.bcc = params.bcc.map(toAddr);

		if (params.text) {
			sendForm.text = params.text;
		}

		if (params.html) {
			sendForm.html = params.html;
		}

		const attachments = await this.toCloudflareAttachments(params.attachments);
		if (attachments.length > 0) {
			sendForm.attachments = attachments;
		}

		if (params.sendType === 'reply' && params.messageId) {
			sendForm.headers = {
				'in-reply-to': params.messageId,
				'references': params.references || params.messageId
			};
		}

		let result;
		if (params.requestReceipt) {
			sendForm.headers = { ...sendForm.headers, 'Disposition-Notification-To': params.accountEmail };
			try {
				result = await c.env.email.send(sendForm);
			} catch (e) {
				// If the service refuses the extra header, send without the receipt request.
				console.warn('cloudflare email: retry without Disposition-Notification-To', e?.message);
				delete sendForm.headers['Disposition-Notification-To'];
				result = await c.env.email.send(sendForm);
			}
		} else {
			result = await c.env.email.send(sendForm);
		}

		return {
			data: {
				id: result.messageId
			}
		};
	},

	async sendByResend(resendToken, params) {
		const resend = new Resend(resendToken);

		const sendForm = {
			from: `${params.name} <${params.accountEmail}>`,
			to: [...params.receiveEmail],
			subject: params.subject,
			text: params.text,
			html: params.html,
			attachments: await this.toResendAttachments(params.attachments)
		};

		if (params.cc?.length > 0)  sendForm.cc  = [...params.cc];
		if (params.bcc?.length > 0) sendForm.bcc = [...params.bcc];

		if (params.sendType === 'reply') {
			sendForm.headers = {
				'in-reply-to': params.messageId,
				'references': params.references || params.messageId
			};
		}

		if (params.autoSubmitted) {
			sendForm.headers = { ...sendForm.headers, 'Auto-Submitted': 'auto-replied' };
		}

		if (params.requestReceipt) {
			sendForm.headers = { ...sendForm.headers, 'Disposition-Notification-To': params.accountEmail };
		}

		return await resend.emails.send(sendForm);
	},

	// Mailjet has no Workers-compatible SDK, so this calls its v3.1 Send REST
	// API directly (Basic auth over apiKey:secretKey, same two credentials
	// the sys-setting Mailjet dialog collects). Returns the same {data,error}
	// shape sendByResend does (mirroring the Resend SDK's own return value)
	// so send()'s post-call handling above needs no provider-specific branch.
	async sendByMailjet(mailjetCreds, params) {
		const toRecipients = list => list.map(e => (typeof e === 'string' ? { Email: e } : e));

		const message = {
			From: { Email: params.accountEmail, Name: params.name },
			To: toRecipients(params.receiveEmail),
			Subject: params.subject
		};

		if (params.cc?.length > 0) message.Cc = toRecipients(params.cc);
		if (params.bcc?.length > 0) message.Bcc = toRecipients(params.bcc);
		if (params.text) message.TextPart = params.text;
		if (params.html) message.HTMLPart = params.html;

		const attachments = await this.toResendAttachments(params.attachments);
		const regular = [];
		const inline = [];
		attachments.forEach(att => {
			const entry = { ContentType: att.contentType, Filename: att.filename, Base64Content: att.content };
			if (att.contentId) {
				entry.ContentID = att.contentId.replace(/^<|>$/g, '');
				inline.push(entry);
			} else {
				regular.push(entry);
			}
		});
		if (regular.length > 0) message.Attachments = regular;
		if (inline.length > 0) message.InlinedAttachments = inline;

		if (params.sendType === 'reply' && params.messageId) {
			message.Headers = { 'In-Reply-To': params.messageId, 'References': params.references || params.messageId };
		}
		if (params.requestReceipt) {
			message.Headers = { ...message.Headers, 'Disposition-Notification-To': params.accountEmail };
		}

		const auth = btoa(`${mailjetCreds.apiKey}:${mailjetCreds.secretKey}`);
		const response = await fetch('https://api.mailjet.com/v3.1/send', {
			method: 'POST',
			headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' },
			body: JSON.stringify({ Messages: [message] })
		});

		const body = await response.json().catch(() => ({}));
		const result = body?.Messages?.[0];

		if (!response.ok || result?.Status === 'error') {
			const errorMessage = body?.ErrorMessage
				|| result?.Errors?.[0]?.ErrorMessage
				|| `Mailjet send failed (${response.status})`;
			return { data: null, error: { message: errorMessage } };
		}

		const messageId = result?.To?.[0]?.MessageID ? String(result.To[0].MessageID) : null;
		return { data: { id: messageId }, error: null };
	},

	// today/month send counts per provider, for the sys-setting "发件服务" usage
	// cards — every row here already represents an accepted/submitted send:
	// send() throws (and never inserts an `email` row) on a provider error,
	// so a failed API call never gets counted. Deliberately not filtered by
	// isDel — the provider already accepted it even if the user later
	// deletes their local copy.
	async getProviderUsage(c) {
		const dayStart = dayjs().startOf('day').format('YYYY-MM-DD HH:mm:ss');
		const monthStart = dayjs().startOf('month').format('YYYY-MM-DD HH:mm:ss');
		const usage = {};

		for (const provider of ['resend', 'mailjet']) {
			const [today, month] = await Promise.all([
				orm(c).select({ total: count() }).from(email)
					.where(and(eq(email.provider, provider), eq(email.type, emailConst.type.SEND), gte(email.createTime, dayStart))).get(),
				orm(c).select({ total: count() }).from(email)
					.where(and(eq(email.provider, provider), eq(email.type, emailConst.type.SEND), gte(email.createTime, monthStart))).get()
			]);
			usage[provider] = { todaySent: today?.total || 0, monthSent: month?.total || 0 };
		}

		// Alibaba DirectMail never writes to the `email` table (it only ever
		// sends notification/verification mail, not user mail), so its usage
		// comes from notification_send_log instead — accepted counts only,
		// matching the "Accepted" definition the quota progress bars use
		// (see forwarding-service.js's sendNotificationExternal, which is the
		// only writer of this table). A missing table (pre-migration-0008
		// deploy window) degrades to zero rather than failing the whole call.
		try {
			const [todayRow, monthRow] = await Promise.all([
				c.env.db.prepare(
					`SELECT COUNT(*) AS total FROM notification_send_log WHERE provider = 'alibaba' AND status = 'accepted' AND created_at >= ?`
				).bind(dayStart).first(),
				c.env.db.prepare(
					`SELECT COUNT(*) AS total FROM notification_send_log WHERE provider = 'alibaba' AND status = 'accepted' AND created_at >= ?`
				).bind(monthStart).first(),
			]);
			usage.alibaba = { todaySent: todayRow?.total || 0, monthSent: monthRow?.total || 0 };
		} catch {
			usage.alibaba = { todaySent: 0, monthSent: 0 };
		}

		return usage;
	},

	async toCloudflareAttachments(attachments) {
		const arrayBufferAttachments = await this.toArrayBufferAttachments(attachments);

		return arrayBufferAttachments.map(attachment => {
			const item = {
				content: attachment.content,
				filename: attachment.filename,
				type: attachment.mimeType || attachment.contentType || attachment.type || 'application/octet-stream',
				disposition: attachment.contentId ? 'inline' : 'attachment'
			};

			if (attachment.contentId) {
				item.contentId = attachment.contentId.replace(/^<|>$/g, '');
			}

			return item;
		});
	},

	async toResendAttachments(attachments = []) {
		const result = [];

		for (const attachment of attachments) {
			const content = await this.toAttachmentBase64(attachment);
			if (!content) {
				continue;
			}

			result.push({
				...attachment,
				content,
				contentType: attachment.contentType || attachment.mimeType || attachment.type || 'application/octet-stream'
			});
		}

		return result;
	},

	async toArrayBufferAttachments(attachments = []) {
		const result = [];

		for (const attachment of attachments) {
			const content = await this.toAttachmentArrayBuffer(attachment);
			if (!content) {
				continue;
			}

			result.push({ ...attachment, content });
		}

		return result;
	},

	async toAttachmentBase64(attachment) {
		let content = attachment.content;

		if (!content) {
			return null;
		}

		if (typeof content === 'string') {
			if (content.startsWith('data:')) {
				content = content.split(',')[1] || content;
			}
			return content.replace(/\s+/g, '');
		}

		const arrayBuffer = await this.toAttachmentArrayBuffer(attachment);
		if (!arrayBuffer) {
			return null;
		}

		const bytes = new Uint8Array(arrayBuffer);
		let binary = '';

		for (let i = 0; i < bytes.length; i += 0x8000) {
			binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
		}

		return btoa(binary);
	},

	async toAttachmentArrayBuffer(attachment) {
		let content = attachment.content;

		if (!content) {
			return null;
		}

		if (content instanceof ArrayBuffer) {
			return content;
		}

		if (content instanceof Uint8Array) {
			return content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength);
		}

		if (typeof content === 'string') {
			if (content.startsWith('data:')) {
				content = content.split(',')[1] || content;
			}
			return fileUtils.base64ToUint8Array(content.replace(/\s+/g, '')).buffer;
		}

		return content;
	},

	//处理站内邮件发送
	async HandleOnSiteEmail(c, receiveEmail, sendEmailData, attList, { autoSubmitted = false } = {}) {

		const setting = await settingService.query(c);
		const { noRecipient } = setting;

		//查询所有收件人账号信息
		let accountList = await orm(c).select().from(account).where(inArray(account.email, receiveEmail)).all();

		// 对于含+未精确匹配的收件人（未注册的子地址），获取基础地址账号
		const plusEmails = receiveEmail.filter(
			e => e.includes('+') && !accountList.some(a => a.email === e)
		);
		const baseAccounts = [];
		if (plusEmails.length > 0) {
			const baseEmails = [...new Set(plusEmails.map(e => emailUtils.getBaseEmail(e)).filter(Boolean))];
			const existing = new Set(accountList.map(a => a.email));
			const needed = baseEmails.filter(e => !existing.has(e));
			if (needed.length > 0) {
				const rows = await orm(c).select().from(account).where(inArray(account.email, needed)).all();
				baseAccounts.push(...rows);
			}
		}

		// 合并精确匹配和基础地址匹配的账号用于权限查询
		const allAccounts = [...accountList, ...baseAccounts];

		//查询所有收件人权限身份
		const userIds = allAccounts.map(accountRow => accountRow.userId);
		let roleList = await roleService.selectByUserIds(c, userIds);

		//封装数据库准备保存到数据库
		const emailDataList = [];

		for (const email of receiveEmail) {

			//把发件人邮件改成收件
			const emailValues = {...sendEmailData}
			emailValues.status = emailConst.status.RECEIVE;
			emailValues.type = emailConst.type.RECEIVE;
			emailValues.toEmail = email;
			emailValues.toName = emailUtils.getName(email);
			emailValues.emailId = null;
			// Bcc is for the sender's copy only: a recipient's copy never lists
			// the blind-copied addresses, or every To/Cc/Bcc recipient on this
			// site would see who else was blind-copied.
			emailValues.bcc = '[]';

			let accountRow = allAccounts.find(accountRow => accountRow.email === email);

			// 精确匹配不到时回退到主地址（去掉 +tag）
			if (!accountRow && email.includes('+')) {
				const baseEmail = emailUtils.getBaseEmail(email);
				accountRow = allAccounts.find(accountRow => accountRow.email === baseEmail);
			}

			//如果收件人存在就把邮件信息改成收件人的
			if (accountRow) {

				//设置给收件人保存
				emailValues.userId = accountRow.userId;
				emailValues.accountId = accountRow.accountId;
				emailValues.type = emailConst.type.RECEIVE;
				emailValues.status = emailConst.status.RECEIVE;

				const roleRow = roleList.find(roleRow => roleRow.userId === accountRow.userId);

				let { banEmail, availDomain } = roleRow;

				//如果收件人没有这个域名的使用权限和有邮件拦截，就把邮件改为拒收状态
				if (email !== c.env.admin) {

					if (!roleService.hasAvailDomainPerm(availDomain, email)) {
						emailValues.status = emailConst.status.BOUNCED;
						emailValues.message = `The recipient <${email}> is not authorized to use this domain.`;
					} else if(roleService.isBanEmail(banEmail, sendEmailData.sendEmail)) {
						emailValues.status = emailConst.status.BOUNCED;
						emailValues.message = `The recipient <${email}> is disabled from receiving emails.`;
					}

				}

				emailDataList.push(emailValues);

			} else {

				//设置无收件人邮件信息
				emailValues.userId = 0;
				emailValues.accountId = 0;
				emailValues.type = emailConst.type.RECEIVE;
				emailValues.status = emailConst.status.NOONE;

				//如果无人收件关闭改为拒收
				if (noRecipient === settingConst.noRecipient.CLOSE) {
					emailValues.status = emailConst.status.BOUNCED;
					emailValues.message = `Recipient not found: <${email}>`;
				}

				emailDataList.push(emailValues);

			}

		}

		//保存邮件
		const receiveEmailList = emailDataList.filter(emailRow => emailRow.status === emailConst.status.RECEIVE || emailRow.status === emailConst.status.NOONE);
		const deliveredRows = [];

		for (const emailData of receiveEmailList) {

			const emailRow = await orm(c).insert(email).values(emailData).returning().get();
			deliveredRows.push(emailRow);

			//设置附件保存
			for (const attRow of attList) {
				const attValues = {...attRow};
				attValues.emailId = emailRow.emailId;
				attValues.accountId = emailRow.accountId;
				attValues.userId = emailRow.userId;
				attValues.attId = null;
				await orm(c).insert(att).values(attValues).run();
			}

		}

		const bouncedEmail = emailDataList.find(emailRow => emailRow.status === emailConst.status.BOUNCED);


		let status = emailConst.status.DELIVERED;
		let message = ''
		//如果有拒收邮件，就把发件人的邮件改成拒收
		if (bouncedEmail) {
			const messageJson = { message: bouncedEmail.message };
			message = JSON.stringify(messageJson);
			status = emailConst.status.BOUNCED;
		}

		await orm(c).update(email).set({ status, message: message }).where(eq(email.emailId, sendEmailData.emailId)).run();

		await this.dispatchOnSite(c, deliveredRows, allAccounts, setting, { autoSubmitted });

	},

	// On-site mail is written straight into the recipient's mailbox and never
	// passes through the inbound email() handler, so run the same follow-up
	// here: rules, notifications, forwarding, auto-reply, Telegram, webhook.
	// It runs after the response when the request can wait for it, and never
	// fails the send.
	async dispatchOnSite(c, emailRows, accountList, setting, { autoSubmitted = false } = {}) {
		if (emailRows.length === 0) return;

		const pending = [];
		let executionCtx = null;
		try {
			executionCtx = c.executionCtx;
		} catch {
			// Hono throws when there is no ExecutionContext (cron, auto-reply).
		}
		const waitUntil = executionCtx?.waitUntil
			? p => executionCtx.waitUntil(p.catch(e => console.error('on-site dispatch failed', e)))
			: p => pending.push(p);

		const ctx = { env: c.env };
		for (const emailRow of emailRows) {
			const accountRow = accountList.find(row => row.accountId === emailRow.accountId) || null;
			const mail = {
				from: { address: emailRow.sendEmail, name: emailRow.name },
				subject: emailRow.subject,
				html: emailRow.content,
				text: emailRow.text,
				headers: autoSubmitted ? [{ key: 'auto-submitted', value: 'auto-replied' }] : [],
			};
			waitUntil(afterReceive(ctx, {
				account: accountRow,
				emailRow,
				mail,
				recipient: emailRow.toEmail,
				setting,
				waitUntil,
				forwardTo: address => this.forwardCopy(ctx, emailRow, address, setting),
			}));
		}

		// Without an ExecutionContext, wait here; afterReceive queues more work
		// while it runs, so drain until nothing is left.
		while (pending.length) {
			const results = await Promise.allSettled(pending.splice(0));
			results.filter(r => r.status === 'rejected').forEach(r => console.error('on-site dispatch failed', r.reason));
		}
	},

	// A copy of an on-site mail for the admin's "forward to other mailboxes"
	// setting. There is no raw message to forward(), so it is sent again as
	// the original sender through the configured provider. Attachments stay
	// on site.
	async forwardCopy(c, emailRow, address, setting) {
		const domain = emailUtils.getDomain(emailRow.sendEmail);
		const resendToken = setting.resendTokens?.[domain];
		const mailjetConfigured = !!(setting.mailjetApiKey && setting.mailjetSecretKey);
		if (!c.env.email && !resendToken && !mailjetConfigured) {
			console.warn('on-site forward skipped: no send provider configured');
			return;
		}
		const params = {
			name: emailRow.name || emailUtils.getName(emailRow.sendEmail),
			accountEmail: emailRow.sendEmail,
			receiveEmail: [address],
			subject: emailRow.subject || '',
			text: emailRow.text || '',
			html: emailRow.content || '',
			attachments: [],
		};
		const result = c.env.email
			? await this.sendByCloudflareEmail(c, params)
			: resendToken
				? await this.sendByResend(resendToken, params)
				: await this.sendByMailjet({ apiKey: setting.mailjetApiKey, secretKey: setting.mailjetSecretKey }, params);
		if (result?.error) {
			console.error(`转发邮箱 ${address} 失败：`, result.error);
		}
	},

	imgReplace(content, cidAttList, r2domain) {

		if (!content) {
			return ''
		}

		const { document } = parseHTML(content);

		const images = Array.from(document.querySelectorAll('img'));

		const useAtts = []

		for (const img of images) {

			const src = img.getAttribute('src');
			if (src && src.startsWith('cid:') && cidAttList) {

				const cid = src.replace(/^cid:/, '');
				const attCidIndex = cidAttList.findIndex(cidAtt => cidAtt.contentId.replace(/^<|>$/g, '') === cid);

				if (attCidIndex > -1) {
					const cidAtt = cidAttList[attCidIndex];
					img.setAttribute('src', '{{domain}}' + cidAtt.key);
					useAtts.push(cidAtt)
				}

			}

			r2domain = domainUtils.toOssDomain(r2domain)

			if (src && src.startsWith(r2domain + '/')) {
				img.setAttribute('src', src.replace(r2domain + '/', '{{domain}}'));
			}

		}

		useAtts.forEach(att => {
			att.type = attConst.type.EMBED
		})

		return document.toString();
	},

	selectById(c, emailId) {
		return orm(c).select().from(email).where(
			and(eq(email.emailId, emailId),
				eq(email.isDel, isDel.NORMAL)))
			.get();
	},

	// NOTE: deliberately no per-user throttle here. This endpoint is the
	// fallback-sync poll (Firebase push is the primary real-time path) and a
	// single user can have several legitimate concurrent pollers — multiple
	// browser tabs, Android, Electron. A cache that silently returned `[]`
	// once one caller had already asked in the last N seconds used to starve
	// every other poller of new mail with no way to tell that apart from
	// "there really is no new mail" — see the mail-sync incident writeup.
	async latest(c, params, userId) {
		let { emailId, accountId, allReceive } = params;
		allReceive = Number(allReceive);

		if (isNaN(allReceive)) {
			let accountRow = await accountService.selectById(c, accountId);
			allReceive = accountRow.allReceive;
		}

		const sharedLatestIds = await getSharedAccountIds(c, userId)
		const latestAccessCond = allReceive
			? (sharedLatestIds.length > 0
				? or(eq(email.userId, userId), inArray(email.accountId, sharedLatestIds))
				: eq(email.userId, userId))
			: accountAccessCond(userId, accountId, sharedLatestIds);

		// Mail the AI screening (or the user) moved to Spam must not reach
		// clients that sync by polling (Electron, background tabs).
		const latestSpamFilter = await columnExists(c, 'email', 'is_spam') ? sql`COALESCE(email.is_spam, 0) = 0` : undefined
		// Same for mail a Subject keywords rule archived on arrival: it belongs
		// in Archive, not in the Inbox list.
		const latestArchiveFilter = await columnExists(c, 'email', 'is_archive') ? sql`COALESCE(email.is_archive, 0) = 0` : undefined

		let list = await orm(c).select({...email}).from(email)
			.leftJoin(
				account,
				eq(account.accountId, email.accountId)
			)
			.where(
				and(
					gt(email.emailId, emailId),
					latestAccessCond,
					latestSpamFilter,
					latestArchiveFilter,
					eq(email.isDel, isDel.NORMAL),
					eq(account.isDel, isDel.NORMAL),
					allReceive ? eq(1,1) : eq(email.accountId, accountId),
					eq(email.type, emailConst.type.RECEIVE)
				))
			.orderBy(desc(email.emailId))
			.limit(20);

		await this.emailAddAtt(c, list);
		await labelService.attachLabels(c, list);

		return list;
	},

	async physicsDelete(c, params) {
		let { emailIds } = params;
		emailIds = emailIds.split(',').map(Number).filter(Number.isInteger);
		// D1: max 100 bound parameters per statement.
		for (let i = 0; i < emailIds.length; i += 90) {
			const ids = emailIds.slice(i, i + 90);
			await attService.removeByEmailIds(c, ids);
			await starService.removeByEmailIds(c, ids);
			try {
				await c.env.db.prepare(`DELETE FROM mail_label_email WHERE email_id IN (${ids.map(() => '?').join(',')})`).bind(...ids).run();
			} catch {} // labels table may not exist on deployments that skipped migration 0002
			await orm(c).delete(email).where(inArray(email.emailId, ids)).run();
		}
	},

	async allEmailDelete(c, params) {
		let { emailIds } = params;
		const emailIdList = emailIds.split(',').map(Number);

		const rows = await orm(c).select({ emailId: email.emailId, isDel: email.isDel })
			.from(email).where(inArray(email.emailId, emailIdList)).all();

		const alreadyTrashedIds = rows.filter(row => row.isDel === isDel.DELETE).map(row => row.emailId);
		const toTrashIds = rows.filter(row => row.isDel !== isDel.DELETE).map(row => row.emailId);

		if (toTrashIds.length > 0) {
			await ensureDeleteTime(c);
			await c.env.db.prepare(
				`UPDATE email SET is_del = ?, delete_time = CURRENT_TIMESTAMP WHERE email_id IN (${toTrashIds.map(() => '?').join(',')})`
			).bind(isDel.DELETE, ...toTrashIds).run();
		}

		if (alreadyTrashedIds.length > 0) {
			await this.physicsDelete(c, { emailIds: alreadyTrashedIds.join(',') });
		}
	},

	async physicsDeleteUserIds(c, userIds) {
		await attService.removeByUserIds(c, userIds);
		await orm(c).delete(email).where(inArray(email.userId, userIds)).run();
	},

	updateEmailStatus(c, params) {
		const { status, resendEmailId, message } = params;
		return orm(c).update(email).set({
			status: status,
			message: message
		}).where(eq(email.resendEmailId, resendEmailId)).returning().get();
	},

	async selectUserEmailCountList(c, userIds, type, del = isDel.NORMAL) {
		const result = await orm(c)
			.select({
				userId: email.userId,
				count: count(email.emailId)
			})
			.from(email)
			.where(and(
				inArray(email.userId, userIds),
				eq(email.type, type),
				eq(email.isDel, del),
				ne(email.status, emailConst.status.SAVING),
			))
			.groupBy(email.userId);
		return result;
	},

	async allList(c, params) {

		let { emailId, size, name, subject, accountEmail, userEmail, type, timeSort } = params;

		size = Number(size);

		emailId = Number(emailId);
		timeSort = Number(timeSort);

		if (size > 50) {
			size = 50;
		}

		if (!emailId) {

			if (timeSort) {
				emailId = 0;
			} else {
				emailId = 9999999999;
			}

		}

		const conditions = [];

		if (type === 'send') {
			conditions.push(eq(email.type, emailConst.type.SEND));
		}

		if (type === 'receive') {
			conditions.push(eq(email.type, emailConst.type.RECEIVE));
		}

		if (type === 'delete') {
			conditions.push(eq(email.isDel, isDel.DELETE));
		} else {
			conditions.push(eq(email.isDel, isDel.NORMAL));
		}

		if (type === 'noone') {
			conditions.push(eq(email.status, emailConst.status.NOONE));
		}

		if (userEmail) {
			conditions.push(sql`${user.email} COLLATE NOCASE LIKE ${'%'+ userEmail + '%'}`);
		}

		if (accountEmail) {
			conditions.push(
				or(
					sql`${email.toEmail} COLLATE NOCASE LIKE ${'%'+ accountEmail + '%'}`,
					sql`${email.sendEmail} COLLATE NOCASE LIKE ${'%'+ accountEmail + '%'}`,
				)
			)
		}

		if (name) {
			conditions.push(sql`${email.name} COLLATE NOCASE LIKE ${'%'+ name + '%'}`);
		}

		if (subject) {
			conditions.push(sql`${email.subject} COLLATE NOCASE LIKE ${'%'+ subject + '%'}`);
		}

		conditions.push(ne(email.status, emailConst.status.SAVING));

		const countConditions = [...conditions];

		if (timeSort) {
			conditions.unshift(gt(email.emailId, emailId));
		} else {
			conditions.unshift(lt(email.emailId, emailId));
		}

		const query = orm(c).select({ ...email, userEmail: user.email })
			.from(email)
			.leftJoin(user, eq(email.userId, user.userId))
			.where(and(...conditions));

		const queryCount = orm(c).select({ total: count() })
			.from(email)
			.leftJoin(user, eq(email.userId, user.userId))
			.where(and(...countConditions));

		if (timeSort) {
			query.orderBy(asc(email.emailId));
		} else {
			query.orderBy(desc(email.emailId));
		}

		const listQuery = await query.limit(size).all();
		const totalQuery = await queryCount.get();
		const latestEmailQuery = await orm(c).select().from(email)
			.where(and(
				eq(email.type, emailConst.type.RECEIVE),
				ne(email.status, emailConst.status.SAVING)
			))
			.orderBy(desc(email.emailId)).limit(1).get();

		let [list, totalRow, latestEmail] = await Promise.all([listQuery, totalQuery, latestEmailQuery]);

		await this.emailAddAtt(c, list);

		if (!latestEmail) {
			latestEmail = {
				emailId: 0,
				accountId: 0,
				userId: 0,
			}
		}

		return { list: list, total: totalRow.total, latestEmail };
	},

	async allEmailLatest(c, params) {

		const { emailId } = params;

		let list = await orm(c).select({...email, userEmail: user.email}).from(email)
			.leftJoin(user, eq(email.userId, user.userId))
			.where(
				and(
					gt(email.emailId, emailId),
					eq(email.type, emailConst.type.RECEIVE),
					ne(email.status, emailConst.status.SAVING)
				))
			.orderBy(desc(email.emailId))
			.limit(20);

		await this.emailAddAtt(c, list);

		return list;
	},

	async emailAddAtt(c, list) {

		const emailIds = list.map(item => item.emailId);

		if (emailIds.length > 0) {

			const attList = await attService.selectByEmailIds(c, emailIds);

			// Build Map for O(n) lookup instead of O(n²) repeated filter
			const attByEmailId = new Map()
			for (const att of attList) {
				const arr = attByEmailId.get(att.emailId)
				if (arr) arr.push(att)
				else attByEmailId.set(att.emailId, [att])
			}
			list.forEach(emailRow => {
				emailRow.attList = attByEmailId.get(emailRow.emailId) || [];
			});
		}
	},

	async restoreByUserId(c, userId) {
		await orm(c).update(email).set({ isDel: isDel.NORMAL }).where(eq(email.userId, userId)).run();
	},

	async completeReceive(c, status, emailId) {
		return await orm(c).update(email).set({
			isDel: isDel.NORMAL,
			status: status
		}).where(eq(email.emailId, emailId)).returning().get();
	},

	// Recovers rows stuck in the SAVING/DELETE staging state — normally
	// completeReceive() flips both status and is_del right after a message is
	// written, but if the Worker was killed between receive() and
	// completeReceive() (e.g. isolation eviction) the row is orphaned mid-stage.
	// This cron fallback must restore BOTH columns, or the row keeps status =
	// RECEIVE/NOONE forever while is_del stays DELETE — invisible in every
	// list query (list()/latest()/allList() all filter on isDel = NORMAL)
	// despite looking "received" to anyone reading just the status column.
	async completeReceiveAll(c) {
		await c.env.db.prepare(
			`UPDATE email as e SET status = ${emailConst.status.RECEIVE}, is_del = ${isDel.NORMAL}
			 WHERE status = ${emailConst.status.SAVING} AND EXISTS (SELECT 1 FROM account WHERE account_id = e.account_id)`
		).run();
		await c.env.db.prepare(
			`UPDATE email SET status = ${emailConst.status.NOONE}, is_del = ${isDel.NORMAL}
			 WHERE status = ${emailConst.status.SAVING}`
		).run();
	},

	// Global retention policy: hard-deletes ALL mail (received and sent,
	// regardless of is_del/star) older than autoCleanDays, except for users
	// listed in autoCleanExclude. Distinct from the trash-only autoDeleteDays
	// purge -- this one runs on the whole mailbox, so it defaults off (0).
	async autoClean(c) {
		const { autoCleanDays, autoCleanExclude } = await settingService.query(c);
		const days = Number(autoCleanDays);

		if (!days || days <= 0) {
			return;
		}

		const cutoff = dayjs().subtract(days, 'day').format('YYYY-MM-DD HH:mm:ss');
		const excludeEmails = String(autoCleanExclude || '')
			.split(/[,，]/)
			.map(item => item.trim())
			.filter(Boolean);

		let excludeUserIds = [];
		if (excludeEmails.length) {
			const rows = await orm(c)
				.select({ userId: user.userId })
				.from(user)
				.where(sql`lower(${user.email}) IN (${sql.join(excludeEmails.map(email => sql`${email.toLowerCase()}`), sql`, `)})`)
				.all();
			excludeUserIds = rows.map(row => row.userId);
		}

		const batchSize = 95;

		while (true) {
			const conditions = [lt(email.createTime, cutoff)];
			if (excludeUserIds.length) {
				conditions.push(notInArray(email.userId, excludeUserIds));
			}

			const rows = await orm(c)
				.select({ emailId: email.emailId })
				.from(email)
				.where(and(...conditions))
				.limit(batchSize)
				.all();

			if (!rows.length) {
				break;
			}

			const emailIds = rows.map(row => row.emailId);
			await this.physicsDelete(c, { emailIds: emailIds.join(',') });

			if (rows.length < batchSize) {
				break;
			}
		}
	},

	async batchDelete(c, params) {
		let { sendName, sendEmail, toEmail, subject, startTime, endTime, type  } = params

		let right = type === 'left' || type === 'include'
		let left = type === 'include'

		const conditions = []

		if (sendName) {
			conditions.push(like(email.name,`${left ? '%' : ''}${sendName}${right ? '%' : ''}`))
		}

		if (subject) {
			conditions.push(like(email.subject,`${left ? '%' : ''}${subject}${right ? '%' : ''}`))
		}

		if (sendEmail) {
			conditions.push(like(email.sendEmail,`${left ? '%' : ''}${sendEmail}${right ? '%' : ''}`))
		}

		if (toEmail) {
			conditions.push(like(email.toEmail,`${left ? '%' : ''}${toEmail}${right ? '%' : ''}`))
		}

		if (startTime && endTime) {
			conditions.push(gte(email.createTime,`${startTime}`))
			conditions.push(lte(email.createTime,`${endTime}`))
		}

		if (conditions.length === 0) {
			return;
		}

		const emailIdsRow = await orm(c).select({emailId: email.emailId}).from(email).where(conditions.length > 1 ? and(...conditions) : conditions[0]).all();

		const emailIds = emailIdsRow.map(row => row.emailId);

		if (emailIds.length === 0){
			return;
		}

		await attService.removeByEmailIds(c, emailIds);

		await orm(c).delete(email).where(conditions.length > 1 ? and(...conditions) : conditions[0]).run();
	},

	async physicsDeleteByAccountId(c, accountId) {
		await attService.removeByAccountId(c, accountId);
		await orm(c).delete(email).where(eq(email.accountId, accountId)).run();
	},

	async read(c, params, userId) {
		await this.setUnread(c, params, userId, emailConst.unread.READ);
	},

	async unread(c, params, userId) {
		await this.setUnread(c, params, userId, emailConst.unread.UNREAD);
	},

	// The other mails of a conversation, oldest first: linked through
	// Message-ID, In-Reply-To and References, two hops out from the open mail.
	// Only mail the caller can read and that isn't in Deleted; capped at 50.
	async thread(c, emailId, userId) {
		const sharedIds = await getSharedAccountIds(c, userId);
		const accessCond = sharedIds.length > 0
			? `(e.user_id = ? OR e.account_id IN (${sharedIds.map(() => '?').join(',')}))`
			: 'e.user_id = ?';
		const accessBinds = [userId, ...sharedIds];
		const root = await c.env.db.prepare(
			`SELECT e.* FROM email e WHERE e.email_id = ? AND ${accessCond}`
		).bind(Number(emailId), ...accessBinds).first();
		if (!root) return [];

		const ids = new Set([...messageIdsIn(root.message_id), ...messageIdsIn(root.in_reply_to), ...messageIdsIn(root.relation)]);
		const found = new Map();
		for (let hop = 0; hop < 2 && ids.size; hop++) {
			const list = [...ids].slice(0, 20);
			const likes = list.map(() => 'e.relation LIKE ?').join(' OR ');
			const { results } = await c.env.db.prepare(
				`SELECT e.* FROM email e WHERE ${accessCond} AND e.is_del = 0 AND e.email_id != ?
				 AND (e.message_id IN (${list.map(() => '?').join(',')}) OR e.in_reply_to IN (${list.map(() => '?').join(',')}) OR ${likes})
				 ORDER BY e.email_id LIMIT 50`
			).bind(...accessBinds, root.email_id, ...list, ...list, ...list.map(id => `%${id}%`)).all();
			let grew = false;
			for (const row of results || []) {
				if (found.has(row.email_id)) continue;
				found.set(row.email_id, row);
				for (const id of [...messageIdsIn(row.message_id), ...messageIdsIn(row.in_reply_to)]) {
					if (!ids.has(id)) { ids.add(id); grew = true; }
				}
			}
			if (!grew) break;
		}
		// Mail the user sent to one of their own addresses exists twice (the
		// Sent copy and the received copy); show it once, as sent.
		const rows = [...found.values()];
		const sentKeys = new Set(rows.filter(r => r.type === emailConst.type.SEND)
			.map(r => `${String(r.send_email).toLowerCase()}|${r.subject}`));
		const list = rows
			.filter(r => r.type === emailConst.type.SEND || !sentKeys.has(`${String(r.send_email).toLowerCase()}|${r.subject}`))
			.sort((a, b) => a.email_id - b.email_id).slice(0, 50).map(mapRawEmailRow);
		await this.emailAddAtt(c, list);
		return list;
	},

	// Unread Inbox mail per account the caller can read (own + shared), for
	// the sidebar badge and the mailbox switcher. Spam, archived, deleted mail
	// and mail of deleted accounts don't count.
	async unreadCounts(c, userId) {
		const sharedIds = await getSharedAccountIds(c, userId);
		const accessCond = sharedIds.length > 0
			? `(e.user_id = ? OR e.account_id IN (${sharedIds.map(() => '?').join(',')}))`
			: 'e.user_id = ?';
		const spam = await columnExists(c, 'email', 'is_spam') ? 'AND COALESCE(e.is_spam, 0) = 0' : '';
		const archive = await columnExists(c, 'email', 'is_archive') ? 'AND COALESCE(e.is_archive, 0) = 0' : '';
		const { results } = await c.env.db.prepare(`
			SELECT e.account_id AS accountId, COUNT(*) AS count FROM email e
			JOIN account a ON a.account_id = e.account_id AND a.is_del = 0
			WHERE ${accessCond} AND e.type = 0 AND e.is_del = 0 AND e.unread = ? ${spam} ${archive}
			GROUP BY e.account_id
		`).bind(userId, ...sharedIds, emailConst.unread.UNREAD).all();
		const accounts = {};
		let total = 0;
		for (const row of results || []) {
			accounts[row.accountId] = row.count;
			total += row.count;
		}
		return { total, accounts };
	},

	// "Mark all as read" for a whole Inbox (one account, or all of them), not
	// only the rows loaded on screen.
	async readAll(c, params, userId) {
		const accountId = Number(params.accountId);
		const allReceive = Number(params.allReceive);
		const sharedIds = await getSharedAccountIds(c, userId);
		const accessCond = sharedIds.length > 0
			? `(user_id = ? OR account_id IN (${sharedIds.map(() => '?').join(',')}))`
			: 'user_id = ?';
		const accountCond = allReceive ? '' : 'AND account_id = ?';
		await c.env.db.prepare(
			`UPDATE email SET unread = ? WHERE ${accessCond} AND type = 0 AND is_del = 0 AND unread = ? ${accountCond}`
		).bind(emailConst.unread.READ, userId, ...sharedIds, emailConst.unread.UNREAD, ...(allReceive ? [] : [accountId])).run();
	},

	async setUnread(c, params, userId, unread) {
		const { emailIds } = params;
		const sharedReadIds = await getSharedAccountIds(c, userId)
		const readAccessCond = sharedReadIds.length > 0
			? or(eq(email.userId, userId), inArray(email.accountId, sharedReadIds))
			: eq(email.userId, userId);
		await orm(c).update(email)
			.set({ unread })
			.where(and(readAccessCond, inArray(email.emailId, emailIds)))
			.run();
	},

};

export default emailService;
