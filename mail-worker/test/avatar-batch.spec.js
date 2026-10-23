// The mail list fetches sender avatars in one batch instead of one request per row.
import { env } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import userService, { AVATAR_BATCH_MAX } from '../src/service/user-service';
import { setupFullSchema, makeCtx } from './helpers/full-schema';

describe('getAvatarsByEmails', () => {
	beforeAll(async () => {
		await setupFullSchema();
		await env.db.prepare(`INSERT INTO user (user_id, email, password, salt, type, avatar) VALUES (901, 'Pic@x.com', 'p', 's', 1, 'data:image/png;base64,AAA')`).run();
		await env.db.prepare(`INSERT INTO user (user_id, email, password, salt, type) VALUES (902, 'plain@x.com', 'p', 's', 1)`).run();
		await env.db.prepare(`INSERT INTO account (email, user_id, name) VALUES ('alias@x.com', 901, 'alias')`).run();
	});

	it('maps each address to its avatar, linked mailboxes included, and unknowns to empty', async () => {
		const map = await userService.getAvatarsByEmails(makeCtx(), [' pic@X.com ', 'alias@x.com', 'plain@x.com', 'nobody@x.com', 'pic@x.com']);
		expect(map).toEqual({
			'pic@x.com': 'data:image/png;base64,AAA',
			'alias@x.com': 'data:image/png;base64,AAA',
			'plain@x.com': '',
			'nobody@x.com': '',
		});
	});

	it('caps the batch size', async () => {
		const emails = Array.from({ length: AVATAR_BATCH_MAX + 20 }, (_, i) => `u${i}@x.com`);
		expect(Object.keys(await userService.getAvatarsByEmails(makeCtx(), emails))).toHaveLength(AVATAR_BATCH_MAX);
	});
});
