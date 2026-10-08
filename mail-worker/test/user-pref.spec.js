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
	await env.db.prepare(`CREATE TABLE IF NOT EXISTS psg_user_signature (
		user_id INTEGER PRIMARY KEY,
		data TEXT NOT NULL DEFAULT '{}'
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

describe('signatures', () => {
	const sigRow = async (userId) => {
		const row = await env.db.prepare('SELECT data FROM psg_user_signature WHERE user_id = ?').bind(userId).first();
		return row ? JSON.parse(row.data) : null;
	};

	it('stores several signatures with separate new-mail and reply defaults', async () => {
		const items = [
			{ id: 'a1', name: 'Work', html: '<p>Work</p>' },
			{ id: 'b2', name: 'Short', html: '<p>-- S</p>' },
		];
		await userService.updateSignatures(ctx, { items, newId: 'a1', replyId: 'b2' }, 201);
		expect(await sigRow(201)).toEqual({ items, newId: 'a1', replyId: 'b2', bySender: {} });

		await userService.updateSignatures(ctx, { items: items.slice(1), newId: null, replyId: 'b2' }, 201);
		expect(await sigRow(201)).toEqual({ items: items.slice(1), newId: null, replyId: 'b2', bySender: {} });
	});

	it('binds signatures to sender addresses, lower-cased, with "" meaning none', async () => {
		const items = [{ id: 'a1', name: 'Work', html: '<p>Work</p>' }];
		await userService.updateSignatures(ctx, { items, newId: 'a1', replyId: 'a1', bySender: { 'Me@PSG.test': 'a1', 'alt@psg.test': '' } }, 203);
		expect((await sigRow(203)).bySender).toEqual({ 'me@psg.test': 'a1', 'alt@psg.test': '' });
		await expect(userService.updateSignatures(ctx, { items, bySender: { 'me@psg.test': 'gone' } }, 203)).rejects.toThrow();
		await expect(userService.updateSignatures(ctx, { items, bySender: { notanaddress: 'a1' } }, 203)).rejects.toThrow();
		await expect(userService.updateSignatures(ctx, { items, bySender: ['a1'] }, 203)).rejects.toThrow();
	});

	it('rejects bad lists and defaults that point at nothing', async () => {
		const ok = { id: 'x', name: 'n', html: '' };
		await expect(userService.updateSignatures(ctx, { items: 'no' }, 202)).rejects.toThrow();
		await expect(userService.updateSignatures(ctx, { items: [ok, ok] }, 202)).rejects.toThrow();
		await expect(userService.updateSignatures(ctx, { items: [{ ...ok, id: 'bad id!' }] }, 202)).rejects.toThrow();
		await expect(userService.updateSignatures(ctx, { items: [ok], newId: 'missing' }, 202)).rejects.toThrow();
		const many = Array.from({ length: 21 }, (_, i) => ({ id: `s${i}`, name: '', html: '' }));
		await expect(userService.updateSignatures(ctx, { items: many }, 202)).rejects.toThrow();
		expect(await sigRow(202)).toBeNull();
	});
});
