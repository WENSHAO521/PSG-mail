// Regression test for a pre-existing bug in dispatchIncoming(): it called
// deliverLog(c, log, rule, accountRow.userId) — one argument short of
// deliverLog's real signature (c, log, rule, emailRow, userId) — so the
// numeric userId silently landed in the `emailRow` parameter and `userId`
// itself came through as undefined. deliver()'s notification-mode branch
// then read emailRow.subject/.name/.sendEmail off a bare number (all
// undefined), so the notification email that actually got sent showed
// "主题：无主题" / "发件人：<>" instead of the real message's subject and
// sender — this only became visible once a real send provider (Alibaba
// DirectMail) was configured that didn't also depend on a valid userId to
// resolve a sending account, since before that this same bug made the send
// throw and retry instead of silently succeeding with garbled content.
import { env } from 'cloudflare:test';
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import forwardingService from '../src/service/forwarding-service';
import settingService from '../src/service/setting-service';

function makeCtx() {
	const store = new Map();
	return { env, get: (k) => store.get(k), set: (k, v) => store.set(k, v) };
}

const SCHEMA = [
	`CREATE TABLE IF NOT EXISTS personal_forwarding (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER NOT NULL,
		target_email TEXT NOT NULL,
		status TEXT NOT NULL DEFAULT 'pending',
		mode TEXT NOT NULL DEFAULT 'notification',
		include_attachments INTEGER NOT NULL DEFAULT 0,
		verification_hash TEXT NOT NULL DEFAULT '',
		verification_expires_at TEXT,
		verification_sent_at TEXT,
		verification_attempts INTEGER NOT NULL DEFAULT 0,
		verified_at TEXT,
		last_error TEXT,
		created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
		updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
	)`,
	`CREATE TABLE IF NOT EXISTS forward_delivery_log (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		forwarding_id INTEGER NOT NULL,
		source_email_id INTEGER NOT NULL,
		source_message_id TEXT NOT NULL DEFAULT '',
		status TEXT NOT NULL DEFAULT 'pending',
		attempt_count INTEGER NOT NULL DEFAULT 0,
		next_attempt_at TEXT,
		provider_message_id TEXT,
		last_error TEXT,
		created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
		updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
		UNIQUE(forwarding_id, source_email_id)
	)`,
];

beforeAll(async () => {
	for (const sql of SCHEMA) await env.db.prepare(sql).run();
});

beforeEach(() => {
	vi.restoreAllMocks();
	vi.spyOn(settingService, 'query').mockResolvedValue({
		allowPersonalForward: 1,
		allowForwardNotification: 1,
		allowForwardFullCopy: 0,
		allowForwardAttachments: 0,
		forwardMaxAddresses: 3,
		forwardAllowedDomains: '',
		publicAppUrl: 'https://mail.example.com',
		domainList: [],
	});
});

describe('forwardingService.dispatchIncoming() -> deliverLog() argument wiring', () => {
	it('passes the real emailRow through to deliver(), not the numeric userId', async () => {
		const ctx = makeCtx();
		await env.db.prepare(
			`INSERT INTO personal_forwarding (user_id, target_email, status, mode) VALUES (901, 'ext@external.example', 'enabled', 'notification')`
		).run();

		const deliverSpy = vi.spyOn(forwardingService, 'deliver').mockResolvedValue({ id: 'stub' });

		const emailRow = {
			emailId: 5001,
			messageId: '<real-message-id@example.com>',
			subject: 'Real subject line',
			name: 'Real Sender Name',
			sendEmail: 'real.sender@example.com',
			createTime: '2026-08-29 12:00:00',
		};

		await forwardingService.dispatchIncoming(ctx, { userId: 901 }, emailRow);

		expect(deliverSpy).toHaveBeenCalledTimes(1);
		const [, , passedEmailRow, passedUserId] = deliverSpy.mock.calls[0];
		expect(passedEmailRow).toBe(emailRow);
		expect(passedEmailRow.subject).toBe('Real subject line');
		expect(passedEmailRow.sendEmail).toBe('real.sender@example.com');
		expect(passedUserId).toBe(901);
	});
});
