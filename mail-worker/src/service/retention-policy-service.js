import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import BizError from '../error/biz-error';
import securityAuditService from './security-audit-service';

dayjs.extend(utc);
dayjs.extend(timezone);

// Business-day retention policy (see migrations/0017). Three independent
// gates must ALL be open before anything is touched:
//   1. policy.enabled = 1                       (admin setting)
//   2. policy.status = 'approved' and the stored approval hash matches the
//      current policy (any edit after approval voids it)
//   3. env RETENTION_EXECUTION = 'true'         (deployment switch)
// Even then, mail is only moved to Trash (is_del = 1 + delete_time); the
// existing trash purge (autoDeleteDays) removes it later, so an admin can
// still restore within that window. Attachment-only purging is NOT
// implemented: objects are content-addressed and shared by retained mail,
// and the 7-day attachment rule is still pending business confirmation.

const JSON_FIELDS = ['workdays', 'holidays', 'exempt_account_ids', 'legal_hold_account_ids'];
const EDITABLE = {
	enabled: 'enabled', timezone: 'timezone', emailBusinessDays: 'email_business_days', attachmentDays: 'attachment_days',
	workdays: 'workdays', holidays: 'holidays', exemptAccountIds: 'exempt_account_ids', legalHoldAccountIds: 'legal_hold_account_ids',
	keepStarred: 'keep_starred',
};

function toPolicy(row) {
	if (!row) return null;
	const p = {};
	for (const [camel, col] of Object.entries(EDITABLE)) {
		p[camel] = JSON_FIELDS.includes(col) ? JSON.parse(row[col] || '[]') : row[col];
	}
	p.status = row.status;
	p.approvedBy = row.approved_by;
	p.approvedAt = row.approved_at;
	p.approvedHash = row.approved_hash;
	p.updateTime = row.update_time;
	return p;
}

async function policyHash(p) {
	const canonical = JSON.stringify(Object.keys(EDITABLE).map(k => [k, p[k]]));
	const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
	return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// The UTC timestamp (D1 CURRENT_TIMESTAMP format) before which mail is older
// than `n` business days, counted in `tz`, skipping non-workdays and
// holidays. Today counts as day 0.
export function businessDayCutoff(n, { now = new Date(), tz = 'Asia/Shanghai', workdays = [1, 2, 3, 4, 5], holidays = [] } = {}) {
	const holidaySet = new Set(holidays);
	const work = new Set(workdays.map(Number));
	let day = dayjs(now).tz(tz).startOf('day');
	let counted = 0;
	let guard = 0;
	while (counted < n && guard++ < 3660) {
		day = day.subtract(1, 'day');
		const iso = day.day() === 0 ? 7 : day.day();
		if (work.has(iso) && !holidaySet.has(day.format('YYYY-MM-DD'))) counted++;
	}
	return day.utc().format('YYYY-MM-DD HH:mm:ss');
}

function validate(p) {
	if (p.timezone !== undefined) {
		try { dayjs().tz(String(p.timezone)); } catch { throw new BizError('invalid timezone', 400); }
	}
	for (const k of ['emailBusinessDays', 'attachmentDays']) {
		if (p[k] !== undefined && (!Number.isInteger(Number(p[k])) || Number(p[k]) < 1 || Number(p[k]) > 3650)) {
			throw new BizError(`${k} must be 1..3650`, 400);
		}
	}
	if (p.workdays !== undefined && (!Array.isArray(p.workdays) || !p.workdays.length || p.workdays.some(d => ![1, 2, 3, 4, 5, 6, 7].includes(Number(d))))) {
		throw new BizError('workdays must be ISO weekdays 1..7', 400);
	}
	if (p.holidays !== undefined && (!Array.isArray(p.holidays) || p.holidays.some(d => !/^\d{4}-\d{2}-\d{2}$/.test(d)))) {
		throw new BizError('holidays must be YYYY-MM-DD dates', 400);
	}
	for (const k of ['exemptAccountIds', 'legalHoldAccountIds']) {
		if (p[k] !== undefined && (!Array.isArray(p[k]) || p[k].some(id => !Number.isInteger(Number(id))))) {
			throw new BizError(`${k} must be an array of account ids`, 400);
		}
	}
}

const retentionPolicyService = {

	async get(c) {
		const row = await c.env.db.prepare('SELECT * FROM retention_policy WHERE id = 1').first();
		if (!row) throw new BizError('retention policy table missing — apply migrations', 503);
		return toPolicy(row);
	},

	// Any change resets approval to draft.
	async update(c, params, adminUserId) {
		validate(params || {});
		const sets = [];
		const binds = [];
		for (const [camel, col] of Object.entries(EDITABLE)) {
			if (params[camel] === undefined) continue;
			let v = params[camel];
			if (JSON_FIELDS.includes(col)) v = JSON.stringify(v.map(x => (col === 'holidays' ? String(x) : Number(x))));
			else if (col !== 'timezone') v = Number(v) ? (['enabled', 'keep_starred'].includes(col) ? 1 : Number(v)) : 0;
			sets.push(`${col} = ?`);
			binds.push(v);
		}
		if (!sets.length) return this.get(c);
		await c.env.db.prepare(
			`UPDATE retention_policy SET ${sets.join(', ')}, status = 'draft', approved_by = NULL, approved_at = NULL, approved_hash = NULL,
			 updated_by = ?, update_time = CURRENT_TIMESTAMP WHERE id = 1`
		).bind(...binds, adminUserId).run();
		await securityAuditService.log(c, 'retention.update', { userId: adminUserId, detail: Object.keys(params) });
		return this.get(c);
	},

	async preview(c, now = new Date()) {
		const p = await this.get(c);
		const emailCutoff = businessDayCutoff(p.emailBusinessDays, { now, tz: p.timezone, workdays: p.workdays, holidays: p.holidays });
		const attachmentCutoff = dayjs(now).tz(p.timezone).startOf('day').subtract(p.attachmentDays, 'day').utc().format('YYYY-MM-DD HH:mm:ss');
		const protectedIds = [...new Set([...p.exemptAccountIds, ...p.legalHoldAccountIds].map(Number))];
		const notProtected = protectedIds.length ? `AND e.account_id NOT IN (${protectedIds.map(() => '?').join(',')})` : '';
		const notStarred = p.keepStarred ? 'AND NOT EXISTS (SELECT 1 FROM star s WHERE s.email_id = e.email_id)' : '';

		const emails = await c.env.db.prepare(
			`SELECT COUNT(*) AS n FROM email e WHERE e.is_del = 0 AND e.create_time < ? ${notProtected} ${notStarred}`
		).bind(emailCutoff, ...protectedIds).first();

		// Mail that would be KEPT (newer than the mail cutoff) but whose
		// attachments are older than the attachment cutoff — these lose their
		// files if the attachment rule were ever enforced.
		const keptButLosingFiles = await c.env.db.prepare(
			`SELECT COUNT(DISTINCT e.email_id) AS n FROM email e JOIN attachments a ON a.email_id = e.email_id
			 WHERE e.is_del = 0 AND e.create_time >= ? AND e.create_time < ? ${notProtected}`
		).bind(emailCutoff, attachmentCutoff, ...protectedIds).first();

		const warnings = [
			'attachment_rule_not_enforced: deleting attachments after ' + p.attachmentDays + ' days would break mail that is still retained; 4.0 only reports the impact.',
		];
		if (keptButLosingFiles.n > 0) warnings.push(`${keptButLosingFiles.n} retained mails have attachments older than ${p.attachmentDays} days`);
		if (!p.legalHoldAccountIds.length) warnings.push('no legal-hold mailboxes configured');
		// Machine-readable twins of the strings above, for UIs to translate.
		const warningCodes = [{ code: 'attachment_rule_not_enforced', days: p.attachmentDays }];
		if (keptButLosingFiles.n > 0) warningCodes.push({ code: 'retained_losing_attachments', n: keptButLosingFiles.n, days: p.attachmentDays });
		if (!p.legalHoldAccountIds.length) warningCodes.push({ code: 'no_legal_hold' });

		return {
			policy: p,
			emailCutoffUtc: emailCutoff,
			attachmentCutoffUtc: attachmentCutoff,
			emailsToTrash: emails.n,
			retainedMailsLosingAttachments: keptButLosingFiles.n,
			protectedAccountIds: protectedIds,
			executable: await this.executable(c, p),
			warnings,
			warningCodes,
		};
	},

	async approve(c, adminUserId) {
		const p = await this.get(c);
		const hash = await policyHash(p);
		await c.env.db.prepare(
			`UPDATE retention_policy SET status = 'approved', approved_by = ?, approved_at = CURRENT_TIMESTAMP, approved_hash = ? WHERE id = 1`
		).bind(adminUserId, hash).run();
		await securityAuditService.log(c, 'retention.approve', { userId: adminUserId, detail: { hash: hash.slice(0, 16) } });
		return this.get(c);
	},

	async executable(c, p) {
		if (String(c.env.RETENTION_EXECUTION) !== 'true') return { ok: false, reason: 'RETENTION_EXECUTION not set', code: 'env_off' };
		if (!p.enabled) return { ok: false, reason: 'policy disabled', code: 'disabled' };
		if (p.status !== 'approved' || p.approvedHash !== await policyHash(p)) return { ok: false, reason: 'policy not approved', code: 'not_approved' };
		return { ok: true, code: 'ok' };
	},

	// Daily cron. Soft-deletes (moves to Trash) only; bounded per run.
	async execute(c, now = new Date()) {
		let p;
		try { p = await this.get(c); } catch { return { ran: false, reason: 'no policy table' }; }
		const gate = await this.executable(c, p);
		if (!gate.ok) return { ran: false, reason: gate.reason };

		const cutoff = businessDayCutoff(p.emailBusinessDays, { now, tz: p.timezone, workdays: p.workdays, holidays: p.holidays });
		const protectedIds = [...new Set([...p.exemptAccountIds, ...p.legalHoldAccountIds].map(Number))];
		const notProtected = protectedIds.length ? `AND account_id NOT IN (${protectedIds.map(() => '?').join(',')})` : '';
		const notStarred = p.keepStarred ? 'AND NOT EXISTS (SELECT 1 FROM star s WHERE s.email_id = email.email_id)' : '';
		const res = await c.env.db.prepare(
			`UPDATE email SET is_del = 1, delete_time = CURRENT_TIMESTAMP
			 WHERE email_id IN (SELECT email_id FROM email WHERE is_del = 0 AND create_time < ? ${notProtected} ${notStarred} LIMIT 500)`
		).bind(cutoff, ...protectedIds).run();
		const moved = res.meta?.changes ?? 0;
		await securityAuditService.log(c, 'retention.execute', { detail: { moved, cutoff } });
		return { ran: true, movedToTrash: moved, cutoff };
	}
};

export default retentionPolicyService;
