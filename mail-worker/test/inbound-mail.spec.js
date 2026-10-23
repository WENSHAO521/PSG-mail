// Inbound mail handling: raw decoding, auto-reply loop guards, blacklist
// parsing, Telegram view links and atomic registration-key claims.
import { env } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import PostalMime from 'postal-mime';
import { readRaw, splitAddressList, shouldAutoReply } from '../src/utils/inbound-mail';
import { checkBlock } from '../src/email/email';
import telegramService from '../src/service/telegram-service';
import regKeyService from '../src/service/reg-key-service';
import jwtUtils from '../src/utils/jwt-utils';
import { setupFullSchema, makeCtx } from './helpers/full-schema';

function streamOf(chunks) {
	return new ReadableStream({
		start(controller) {
			for (const chunk of chunks) controller.enqueue(chunk);
			controller.close();
		},
	});
}

describe('readRaw', () => {
	it('keeps multi-byte characters that straddle a chunk boundary', async () => {
		const raw = 'From: a@x.com\r\nTo: b@y.com\r\nSubject: hi\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n你好世界\r\n';
		const bytes = new TextEncoder().encode(raw);
		// Split inside the first Chinese character (3 bytes in UTF-8).
		const cut = bytes.indexOf(0xe4) + 1;
		const parsed = await PostalMime.parse(await readRaw(streamOf([bytes.slice(0, cut), bytes.slice(cut)])));
		expect(parsed.text.trim()).toBe('你好世界');
	});
});

describe('shouldAutoReply', () => {
	const base = { from: { address: 'alice@example.com' }, headers: [] };

	it('replies to an ordinary message', () => {
		expect(shouldAutoReply(base, 'me@psg.test')).toBe(true);
	});

	it('skips automated, list and bounce mail', () => {
		const withHeader = (key, value) => ({ ...base, headers: [{ key, value }] });
		expect(shouldAutoReply(withHeader('auto-submitted', 'auto-replied'), 'me@psg.test')).toBe(false);
		expect(shouldAutoReply(withHeader('auto-submitted', 'no'), 'me@psg.test')).toBe(true);
		expect(shouldAutoReply(withHeader('precedence', 'bulk'), 'me@psg.test')).toBe(false);
		expect(shouldAutoReply(withHeader('list-id', '<news.example.com>'), 'me@psg.test')).toBe(false);
		expect(shouldAutoReply({ ...base, from: { address: 'MAILER-DAEMON@example.com' } }, 'me@psg.test')).toBe(false);
		expect(shouldAutoReply({ ...base, from: { address: 'no-reply@example.com' } }, 'me@psg.test')).toBe(false);
	});

	it('never replies to itself or to a missing sender', () => {
		expect(shouldAutoReply({ ...base, from: { address: 'Me@psg.test' } }, 'me@psg.test')).toBe(false);
		expect(shouldAutoReply({ headers: [] }, 'me@psg.test')).toBe(false);
	});
});

describe('address lists and blacklist', () => {
	it('trims and lowercases comma separated addresses', () => {
		expect(splitAddressList(' A@x.com, b@x.com ,,')).toEqual(['a@x.com', 'b@x.com']);
		expect(splitAddressList(null)).toEqual([]);
	});

	it('ignores empty blacklist entries instead of blocking every mail', () => {
		const mail = { subject: 'Hello', text: 'body', from: { address: 'a@x.com' } };
		expect(checkBlock('spam,', 'casino, ', ' ,', mail)).toBe(false);
	});

	it('matches sender blacklist entries with spaces and any case', () => {
		const mail = { subject: 'Hello', text: 'body', from: { address: 'Bad@Spam.com' } };
		expect(checkBlock('', '', 'x@y.com, spam.com', mail)).toBe(true);
	});

	it('does not throw for a message without From', () => {
		expect(checkBlock('', '', 'spam.com', { subject: 'x' })).toBe(false);
	});
});

describe('telegram view link', () => {
	beforeAll(setupFullSchema);

	it('refuses tokens that were not minted for an email', async () => {
		const c = makeCtx();
		const session = await jwtUtils.generateToken(c, { userId: 1, token: 'abc' });
		const html = await telegramService.getEmailContent(c, { token: session });
		expect(html).toContain('Access denied');
	});

	it('does not show a deleted email', async () => {
		const c = makeCtx();
		const res = await env.db.prepare(
			`INSERT INTO email (send_email, name, account_id, user_id, subject, text, content, is_del) VALUES ('a@x.com','a',1,1,'s','secret text','',1)`
		).run();
		const token = await jwtUtils.generateToken(c, { emailId: res.meta.last_row_id }, 60);
		const html = await telegramService.getEmailContent(c, { token });
		expect(html).not.toContain('secret text');
	});
});

describe('registration key claims', () => {
	beforeAll(setupFullSchema);

	it('never takes a key below zero, even under concurrency', async () => {
		const c = makeCtx();
		await env.db.prepare(
			`INSERT INTO reg_key (code, count, role_id, user_id, expire_time) VALUES ('race-key', 2, 1, 1, '2999-01-01 00:00:00')`
		).run();
		const results = await Promise.all(Array.from({ length: 5 }, () => regKeyService.reduceCount(c, 'race-key', 1)));
		expect(results.filter(Boolean)).toHaveLength(2);
		const row = await env.db.prepare(`SELECT count FROM reg_key WHERE code = 'race-key'`).first();
		expect(row.count).toBe(0);
	});
});
