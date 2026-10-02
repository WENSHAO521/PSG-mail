// Per-user compose preferences (migrations/0009_user_preferences.sql): the
// Undo Send delay and the reply-from-receiving-address toggle, upserted into
// psg_user_pref so a user with no row keeps the defaults.
import { env } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import userService from '../src/service/user-service';

const ctx = { env, get: () => undefined, set: () => {} };

async function prefRow(userId) {
	return env.db.prepare('SELECT undo_send_seconds, reply_from_received FROM psg_user_pref WHERE user_id = ?')
		.bind(userId).first();
}

beforeAll(async () => {
	await env.db.prepare(`CREATE TABLE IF NOT EXISTS psg_user_pref (
		user_id INTEGER PRIMARY KEY,
		undo_send_seconds INTEGER NOT NULL DEFAULT 10,
		reply_from_received INTEGER NOT NULL DEFAULT 1
	)`).run();
});

describe('user preferences', () => {
	it('stores the undo delay and keeps the other preference at its default', async () => {
		await userService.updateUndoSendSeconds(ctx, { seconds: 20 }, 101);
		expect(await prefRow(101)).toEqual({ undo_send_seconds: 20, reply_from_received: 1 });
	});

	it('updates each preference independently on an existing row', async () => {
		await userService.updateUndoSendSeconds(ctx, { seconds: 5 }, 102);
		await userService.updateReplyFromReceived(ctx, { enabled: false }, 102);
		await userService.updateUndoSendSeconds(ctx, { seconds: 0 }, 102);
		expect(await prefRow(102)).toEqual({ undo_send_seconds: 0, reply_from_received: 0 });
	});

	it('rejects values outside the offered options', async () => {
		await expect(userService.updateUndoSendSeconds(ctx, { seconds: 7 }, 103)).rejects.toThrow();
		await expect(userService.updateUndoSendSeconds(ctx, {}, 103)).rejects.toThrow();
		await expect(userService.updateUndoSendSeconds(ctx, { seconds: null }, 103)).rejects.toThrow();
		await expect(userService.updateReplyFromReceived(ctx, { enabled: 'yes' }, 103)).rejects.toThrow();
		expect(await prefRow(103)).toBeNull();
	});
});
