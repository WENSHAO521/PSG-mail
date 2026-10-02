// AI spam screening of incoming mail (src/service/spam-service.js,
// migrations/0010_ai_spam.sql). Workers AI is stubbed; the D1 tables are the
// real schema from the migration plus a minimal email table.
import { env } from 'cloudflare:test';
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import spamService from '../src/service/spam-service';
import emailService from '../src/service/email-service';

let aiReply = '';
let aiCalls = 0;

function ctx(aiSpam = 0) {
	return {
		env: {
			...env,
			domain: ['psg.example.com'],
			ai: { run: async () => { aiCalls++; return { response: aiReply }; } },
		},
		get: key => (key === 'setting' ? { aiSpam, aiDailyQuota: 0 } : undefined),
		set: () => {},
	};
}

async function insertEmail(id, { userId = 1, sendEmail = 'promo@shop.example', type = 0, recipient = '' } = {}) {
	await env.db.prepare(
		`INSERT INTO email (email_id, send_email, account_id, user_id, subject, type, recipient, is_spam)
		 VALUES (?, ?, 1, ?, 'Hello', ?, ?, 0)`
	).bind(id, sendEmail, userId, type, recipient).run();
}

async function isSpam(id) {
	return (await env.db.prepare('SELECT is_spam FROM email WHERE email_id = ?').bind(id).first())?.is_spam;
}

const incoming = (from = 'promo@shop.example') => ({
	from: { address: from, name: 'Shop' },
	subject: 'You won a prize',
	text: 'Click here to claim your prize now',
	headers: [],
});

beforeAll(async () => {
	await env.db.prepare(`CREATE TABLE IF NOT EXISTS email (
		email_id INTEGER PRIMARY KEY, send_email TEXT, account_id INTEGER, user_id INTEGER,
		subject TEXT, type INTEGER DEFAULT 0, recipient TEXT, is_spam INTEGER NOT NULL DEFAULT 0
	)`).run();
	await env.db.prepare(`CREATE TABLE IF NOT EXISTS psg_spam_verdict (
		email_id INTEGER PRIMARY KEY, source TEXT NOT NULL DEFAULT 'ai',
		confidence REAL NOT NULL DEFAULT 0, reason TEXT NOT NULL DEFAULT '',
		created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
	)`).run();
	await env.db.prepare(`CREATE TABLE IF NOT EXISTS psg_spam_allow (
		user_id INTEGER NOT NULL, sender TEXT NOT NULL,
		created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (user_id, sender)
	)`).run();
});

beforeEach(async () => {
	aiCalls = 0;
	await env.db.prepare('DELETE FROM email').run();
	await env.db.prepare('DELETE FROM psg_spam_verdict').run();
	await env.db.prepare('DELETE FROM psg_spam_allow').run();
});

describe('AI spam screening', () => {
	it('moves a confident spam verdict to Spam and records the reason', async () => {
		await insertEmail(1);
		aiReply = '{"spam": true, "confidence": 0.95, "reason": "中奖诈骗"}';
		const moved = await spamService.screen(ctx(), { email: incoming(), emailRow: { emailId: 1, userId: 1 }, setting: { aiSpam: 0 } });
		expect(moved).toBe(true);
		expect(await isSpam(1)).toBe(1);
		expect(await spamService.verdict(ctx(), 1)).toMatchObject({ source: 'ai', reason: '中奖诈骗' });
	});

	it('leaves mail in the inbox below the confidence threshold or when not spam', async () => {
		await insertEmail(2);
		aiReply = '{"spam": true, "confidence": 0.6, "reason": "可能是推广"}';
		expect(await spamService.screen(ctx(), { email: incoming(), emailRow: { emailId: 2, userId: 1 }, setting: { aiSpam: 0 } })).toBe(false);
		aiReply = 'Sure! {"spam": false, "confidence": 0.9, "reason": "正常邮件"}';
		expect(await spamService.screen(ctx(), { email: incoming(), emailRow: { emailId: 2, userId: 1 }, setting: { aiSpam: 0 } })).toBe(false);
		expect(await isSpam(2)).toBe(0);
	});

	it('does nothing when the admin switch is off, or the AI reply is unusable', async () => {
		await insertEmail(3);
		aiReply = '{"spam": true, "confidence": 0.99, "reason": "x"}';
		expect(await spamService.screen(ctx(1), { email: incoming(), emailRow: { emailId: 3, userId: 1 }, setting: { aiSpam: 1 } })).toBe(false);
		expect(aiCalls).toBe(0);
		aiReply = 'not json at all';
		expect(await spamService.screen(ctx(), { email: incoming(), emailRow: { emailId: 3, userId: 1 }, setting: { aiSpam: 0 } })).toBe(false);
		expect(await isSpam(3)).toBe(0);
	});

	it('never screens own-domain senders or people the user has written to', async () => {
		aiReply = '{"spam": true, "confidence": 0.99, "reason": "x"}';
		await insertEmail(4, { sendEmail: 'colleague@psg.example.com' });
		expect(await spamService.screen(ctx(), { email: incoming('Colleague@PSG.example.com'), emailRow: { emailId: 4, userId: 1 }, setting: { aiSpam: 0 } })).toBe(false);
		await insertEmail(5, { type: 1, recipient: '[{"address":"author@uni.example"}]' });
		await insertEmail(6, { sendEmail: 'author@uni.example' });
		expect(await spamService.screen(ctx(), { email: incoming('author@uni.example'), emailRow: { emailId: 6, userId: 1 }, setting: { aiSpam: 0 } })).toBe(false);
		expect(aiCalls).toBe(0);
	});

	it('"not spam" restores the mail, clears the verdict and trusts the sender', async () => {
		await insertEmail(7);
		aiReply = '{"spam": true, "confidence": 0.95, "reason": "推广"}';
		await spamService.screen(ctx(), { email: incoming(), emailRow: { emailId: 7, userId: 1 }, setting: { aiSpam: 0 } });
		expect(await isSpam(7)).toBe(1);

		await emailService.unmarkSpam(ctx(), { emailIds: '7' }, 1);
		expect(await isSpam(7)).toBe(0);
		expect(await spamService.verdict(ctx(), 7)).toBeNull();

		await insertEmail(8);
		aiCalls = 0;
		expect(await spamService.screen(ctx(), { email: incoming('PROMO@shop.example'), emailRow: { emailId: 8, userId: 1 }, setting: { aiSpam: 0 } })).toBe(false);
		expect(aiCalls).toBe(0);
	});

	it('does not trust senders of mail the user cannot access', async () => {
		await insertEmail(9, { userId: 2, sendEmail: 'other@spam.example' });
		await emailService.unmarkSpam(ctx(), { emailIds: '9' }, 1);
		const row = await env.db.prepare('SELECT 1 FROM psg_spam_allow WHERE user_id = 1 AND sender = ?').bind('other@spam.example').first();
		expect(row).toBeNull();
	});
});
