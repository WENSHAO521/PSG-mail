import orm from '../entity/orm';
import mailLabel from '../entity/mail-label';
import mailLabelEmail from '../entity/mail-label-email';
import email from '../entity/email';
import { star } from '../entity/star';
import { and, eq, asc, desc, inArray, or, sql, lt } from 'drizzle-orm';
import BizError from '../error/biz-error';
import { t } from '../i18n/i18n';
import { isDel } from '../const/entity-const';

// User-scoped labels, many-to-many with email via mail_label_email — NOT a
// comma-separated column on `email`, so a label can be renamed/recolored/
// deleted in one place, an email can carry any number of labels, and
// "which emails have label X" stays an indexed join instead of a LIKE scan.
// Labels are a personal organization layer on top of the existing system
// folders (Inbox/Archive/Spam/Trash) — deleting a label only removes the
// association rows, never touches `email` itself.

async function getSharedAccountIds(c, userId) {
	try {
		const { results } = await c.env.db
			.prepare('SELECT account_id FROM account_share WHERE user_id = ?')
			.bind(userId).all();
		return results.map(r => r.account_id);
	} catch { return []; }
}

async function assertOwnedLabel(c, labelId, userId) {
	const row = await orm(c).select().from(mailLabel)
		.where(and(eq(mailLabel.labelId, Number(labelId)), eq(mailLabel.userId, userId))).get();
	if (!row) throw new BizError(t('labelNotExist') || 'Label does not exist', 404);
	return row;
}

// Emails can only be labeled if the caller can actually see them — owner or
// a shared account, same access model email-service.js's list()/latest()
// use. Silently drops IDs the caller doesn't have access to rather than
// erroring, so a bulk-apply over a mixed selection labels what it can.
async function filterAccessibleEmailIds(c, emailIds, userId) {
	if (!emailIds.length) return [];
	const sharedIds = await getSharedAccountIds(c, userId);
	const accessCond = sharedIds.length > 0
		? or(eq(email.userId, userId), inArray(email.accountId, sharedIds))
		: eq(email.userId, userId);
	const rows = await orm(c).select({ emailId: email.emailId }).from(email)
		.where(and(inArray(email.emailId, emailIds), accessCond))
		.all();
	return rows.map(r => r.emailId);
}

const labelService = {

	async create(c, { name, color }, userId) {
		name = String(name || '').trim();
		if (!name) throw new BizError(t('labelNameRequired') || 'Label name is required', 400);
		if (name.length > 60) throw new BizError(t('labelNameTooLong') || 'Label name is too long', 400);

		const maxSort = await orm(c).select({ max: sql`COALESCE(MAX(${mailLabel.sortOrder}), -1)` }).from(mailLabel)
			.where(eq(mailLabel.userId, userId)).get();

		const row = await orm(c).insert(mailLabel).values({
			userId,
			name,
			color: color || '#7e7576',
			sortOrder: (maxSort?.max ?? -1) + 1,
		}).returning().get();
		return row;
	},

	async update(c, labelId, { name, color, sortOrder }, userId) {
		await assertOwnedLabel(c, labelId, userId);
		const patch = { updateTime: new Date().toISOString() };
		if (name != null) {
			name = String(name).trim();
			if (!name) throw new BizError(t('labelNameRequired') || 'Label name is required', 400);
			patch.name = name;
		}
		if (color != null) patch.color = color;
		if (sortOrder != null) patch.sortOrder = Number(sortOrder);

		const row = await orm(c).update(mailLabel).set(patch)
			.where(eq(mailLabel.labelId, Number(labelId))).returning().get();
		return row;
	},

	async remove(c, labelId, userId) {
		await assertOwnedLabel(c, labelId, userId);
		await orm(c).delete(mailLabelEmail).where(eq(mailLabelEmail.labelId, Number(labelId))).run();
		await orm(c).delete(mailLabel).where(eq(mailLabel.labelId, Number(labelId))).run();
	},

	async list(c, userId) {
		const labels = await orm(c).select().from(mailLabel)
			.where(eq(mailLabel.userId, userId))
			.orderBy(asc(mailLabel.sortOrder))
			.all();
		if (!labels.length) return [];

		const counts = await c.env.db.prepare(
			`SELECT le.label_id, COUNT(*) as cnt
			 FROM mail_label_email le
			 JOIN email e ON e.email_id = le.email_id
			 WHERE le.label_id IN (${labels.map(() => '?').join(',')}) AND e.is_del = ?
			 GROUP BY le.label_id`
		).bind(...labels.map(l => l.labelId), isDel.NORMAL).all();
		const countMap = new Map((counts.results || []).map(r => [r.label_id, r.cnt]));

		return labels.map(l => ({ ...l, emailCount: countMap.get(l.labelId) || 0 }));
	},

	// Applies/removes are batch operations over a caller-supplied emailId
	// list (bulk-apply from a list selection, or a single id from the
	// reading pane) — both silently skip emails the caller can't access
	// rather than failing the whole batch over one bad id.
	async apply(c, { labelId, emailIds }, userId) {
		await assertOwnedLabel(c, labelId, userId);
		const ids = (emailIds || []).map(Number).filter(Boolean);
		const accessible = await filterAccessibleEmailIds(c, ids, userId);
		if (!accessible.length) return { applied: 0 };

		for (const emailId of accessible) {
			try {
				await c.env.db.prepare(
					`INSERT OR IGNORE INTO mail_label_email (label_id, email_id) VALUES (?, ?)`
				).bind(Number(labelId), emailId).run();
			} catch {}
		}
		return { applied: accessible.length };
	},

	async removeFromEmails(c, { labelId, emailIds }, userId) {
		await assertOwnedLabel(c, labelId, userId);
		const ids = (emailIds || []).map(Number).filter(Boolean);
		if (!ids.length) return { removed: 0 };
		await orm(c).delete(mailLabelEmail)
			.where(and(eq(mailLabelEmail.labelId, Number(labelId)), inArray(mailLabelEmail.emailId, ids)))
			.run();
		return { removed: ids.length };
	},

	// Attaches a `labels: [{labelId,name,color}]` array to each row in
	// `list` (mutates in place) — same shape/call convention as
	// emailService.emailAddAtt for attachments, used by list()/detail()/
	// search() so the client always gets labels alongside every email
	// without a separate round-trip.
	async attachLabels(c, list) {
		const emailIds = list.map(item => item.emailId);
		if (!emailIds.length) return;

		// Tolerates the table not existing yet (a deploy where migrations
		// haven't run, or an older test's self-contained schema that predates
		// Labels) — every call site here is a read-augmentation, not
		// load-bearing, so degrading to "no labels" beats a hard failure.
		let results;
		try {
			({ results } = await c.env.db.prepare(
				`SELECT le.email_id, l.label_id, l.name, l.color
				 FROM mail_label_email le
				 JOIN mail_label l ON l.label_id = le.label_id
				 WHERE le.email_id IN (${emailIds.map(() => '?').join(',')})`
			).bind(...emailIds).all());
		} catch {
			list.forEach(item => { item.labels = []; });
			return;
		}

		const byEmailId = new Map();
		for (const row of results || []) {
			const arr = byEmailId.get(row.email_id) || [];
			arr.push({ labelId: row.label_id, name: row.name, color: row.color });
			byEmailId.set(row.email_id, arr);
		}
		list.forEach(item => { item.labels = byEmailId.get(item.emailId) || []; });
	},

	// Per-label email list — mirrors emailService.list()'s access scoping
	// and pagination shape (emailId cursor + size) so the frontend can reuse
	// the same email-scroll component/getEmailList(emailId, size) contract.
	async emailsForLabel(c, labelId, userId, { emailId, size }) {
		await assertOwnedLabel(c, labelId, userId);
		size = Math.min(Number(size) || 20, 50);
		emailId = Number(emailId) || 9999999999;

		const sharedIds = await getSharedAccountIds(c, userId);
		const accessCond = sharedIds.length > 0
			? or(eq(email.userId, userId), inArray(email.accountId, sharedIds))
			: eq(email.userId, userId);

		const rows = await orm(c).select({ ...email, starId: star.starId })
			.from(mailLabelEmail)
			.innerJoin(email, eq(email.emailId, mailLabelEmail.emailId))
			.leftJoin(star, and(eq(star.emailId, email.emailId), eq(star.userId, userId)))
			.where(and(
				eq(mailLabelEmail.labelId, Number(labelId)),
				accessCond,
				eq(email.isDel, isDel.NORMAL),
				lt(email.emailId, emailId),
			))
			.orderBy(desc(email.emailId))
			.limit(size)
			.all();

		const list = rows.map(row => ({ ...row, isStar: row.starId != null ? 1 : 0 }));
		return { list, total: list.length, latestEmail: list[0] || { emailId: 0, userId } };
	},

};

export default labelService;
