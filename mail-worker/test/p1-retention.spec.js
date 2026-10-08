// P1: retention policy is configurable, previewable, and inert unless all
// three gates (enabled, approved snapshot, RETENTION_EXECUTION) are open.
import { env } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import retentionPolicyService, { businessDayCutoff } from '../src/service/retention-policy-service';
import { bootstrapSchema, insertUser } from './helpers/schema';

const NOW = new Date('2026-10-08T04:00:00Z'); // Thu 12:00 Asia/Shanghai

describe('business-day cutoff', () => {
	it('skips weekends', () => {
		// 5 business days before Thu 2026-10-08 (CST) = Thu 2026-10-01 00:00 CST
		expect(businessDayCutoff(5, { now: NOW })).toBe('2026-09-30 16:00:00');
	});
	it('skips configured holidays (e.g. National Day week)', () => {
		const holidays = ['2026-10-01', '2026-10-02', '2026-10-05', '2026-10-06', '2026-10-07'];
		// remaining business days going back: 10-08 is today; 09-30, 09-29, 09-28, 09-25, 09-24
		expect(businessDayCutoff(5, { now: NOW, holidays })).toBe('2026-09-23 16:00:00');
	});
	it('respects the configured timezone', () => {
		expect(businessDayCutoff(1, { now: NOW, tz: 'UTC' })).toBe('2026-10-07 00:00:00');
		expect(businessDayCutoff(1, { now: NOW, tz: 'Europe/Berlin' })).toBe('2026-10-06 22:00:00');
	});
	it('supports a six-day work week', () => {
		expect(businessDayCutoff(1, { now: new Date('2026-10-12T04:00:00Z'), workdays: [1, 2, 3, 4, 5, 6] })).toBe('2026-10-09 16:00:00');
	});
});

describe('retention gates', () => {
	let normal, held;
	const c = (extraEnv = {}) => ({ env: { ...env, ...extraEnv } });

	beforeAll(async () => {
		await bootstrapSchema();
		normal = await insertUser({ email: 'normal@example.com', hash: 'x', salt: 'x' });
		held = await insertUser({ email: 'held@example.com', hash: 'x', salt: 'x' });
		for (const acc of [normal, held]) {
			await env.db.prepare(`INSERT INTO email (account_id, user_id, subject, create_time) VALUES (?, ?, 'old', '2025-01-01 00:00:00')`).bind(acc.accountId, acc.userId).run();
			await env.db.prepare(`INSERT INTO email (account_id, user_id, subject, create_time) VALUES (?, ?, 'new', CURRENT_TIMESTAMP)`).bind(acc.accountId, acc.userId).run();
		}
		const starred = await env.db.prepare(`INSERT INTO email (account_id, user_id, subject, create_time) VALUES (?, ?, 'starred-old', '2025-01-01 00:00:00') RETURNING email_id`).bind(normal.accountId, normal.userId).first();
		await env.db.prepare('INSERT INTO star (user_id, email_id) VALUES (?, ?)').bind(normal.userId, starred.email_id).run();
	});

	const live = async (subject, accountId) => (await env.db.prepare('SELECT is_del FROM email WHERE subject = ? AND account_id = ?').bind(subject, accountId).first()).is_del;

	it('ships disabled, in draft, with the pending-confirmation defaults', async () => {
		const p = await retentionPolicyService.get(c());
		expect(p).toMatchObject({ enabled: 0, status: 'draft', emailBusinessDays: 15, attachmentDays: 7, timezone: 'Asia/Shanghai' });
	});

	it('does nothing by default', async () => {
		const r = await retentionPolicyService.execute(c({ RETENTION_EXECUTION: 'true' }));
		expect(r.ran).toBe(false);
		expect(await live('old', normal.accountId)).toBe(0);
	});

	it('enabled + approved still does nothing without RETENTION_EXECUTION', async () => {
		await retentionPolicyService.update(c(), { enabled: true, legalHoldAccountIds: [held.accountId] }, 1);
		await retentionPolicyService.approve(c(), 1);
		expect((await retentionPolicyService.execute(c())).ran).toBe(false);
		expect(await live('old', normal.accountId)).toBe(0);
	});

	it('an edit after approval voids the approval', async () => {
		await retentionPolicyService.update(c(), { emailBusinessDays: 20 }, 1);
		const p = await retentionPolicyService.get(c());
		expect(p.status).toBe('draft');
		expect((await retentionPolicyService.execute(c({ RETENTION_EXECUTION: 'true' }))).reason).toBe('policy not approved');
	});

	it('preview reports impact and the attachment warning without changing anything', async () => {
		const pv = await retentionPolicyService.preview(c(), NOW);
		expect(pv.emailsToTrash).toBe(1); // normal/old only: held is legal-hold, starred is kept
		expect(pv.warnings.join(' ')).toMatch(/attachment_rule_not_enforced/);
		expect(await live('old', normal.accountId)).toBe(0);
	});

	it('with all three gates open: moves to Trash only, honoring legal hold and stars', async () => {
		await retentionPolicyService.approve(c(), 1);
		const r = await retentionPolicyService.execute(c({ RETENTION_EXECUTION: 'true' }), NOW);
		expect(r).toMatchObject({ ran: true, movedToTrash: 1 });
		expect(await live('old', normal.accountId)).toBe(1);
		expect(await live('new', normal.accountId)).toBe(0);
		expect(await live('old', held.accountId)).toBe(0);
		expect(await live('starred-old', normal.accountId)).toBe(0);
		const row = await env.db.prepare(`SELECT delete_time FROM email WHERE subject = 'old' AND account_id = ?`).bind(normal.accountId).first();
		expect(row.delete_time).toBeTruthy(); // restorable from Trash until the trash purge window
	});

	it('rejects invalid configuration', async () => {
		await expect(retentionPolicyService.update(c(), { timezone: 'Mars/Olympus' }, 1)).rejects.toThrow();
		await expect(retentionPolicyService.update(c(), { holidays: ['10/01/2026'] }, 1)).rejects.toThrow();
		await expect(retentionPolicyService.update(c(), { emailBusinessDays: 0 }, 1)).rejects.toThrow();
	});
});
