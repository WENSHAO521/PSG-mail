// External API keys must obey the owner's status and role permissions (same as JWT routes).
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import worker from '../src';
import { setupFullSchema } from './helpers/full-schema';

async function sha256Hex(str) {
	const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
	return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function call(path, key, init = {}) {
	const ctx = createExecutionContext();
	const res = await worker.fetch(new Request('http://example.com/api' + path, {
		...init, headers: { 'X-Api-Key': key, 'content-type': 'application/json' }
	}), env, ctx);
	await waitOnExecutionContext(ctx);
	return res.json();
}

async function mkUser({ userId, roleId, status = 0, permKeys = [] }) {
	await env.db.prepare(`INSERT OR REPLACE INTO role (role_id, name, send_type) VALUES (?, ?, 'count')`).bind(roleId, 'r' + roleId).run();
	for (const key of permKeys) {
		const perm = await env.db.prepare(`SELECT perm_id FROM perm WHERE perm_key = ?`).bind(key).first();
		await env.db.prepare(`INSERT INTO role_perm (role_id, perm_id) VALUES (?, ?)`).bind(roleId, perm.perm_id).run();
	}
	await env.db.prepare(`INSERT OR REPLACE INTO user (user_id, email, password, salt, type, status) VALUES (?, ?, 'x', 'x', ?, ?)`)
		.bind(userId, `user${userId}@example.com`, roleId, status).run();
	const token = 'cm_live_test_' + userId;
	await env.db.prepare(`INSERT INTO external_api_key (user_id, name, key_hash, key_prefix, status) VALUES (?, 'k', ?, ?, 1)`)
		.bind(userId, await sha256Hex(token), token.slice(0, 14)).run();
	return token;
}

describe('/openapi authorization', () => {
	let noPerm, banned, sender, deleter;
	beforeAll(async () => {
		await setupFullSchema();
		noPerm = await mkUser({ userId: 801, roleId: 801 });
		banned = await mkUser({ userId: 802, roleId: 802, status: 1, permKeys: ['email:send'] });
		sender = await mkUser({ userId: 803, roleId: 803, permKeys: ['email:send'] });
		deleter = await mkUser({ userId: 804, roleId: 804, permKeys: ['email:delete'] });
	});

	it('rejects unknown keys', async () => {
		expect((await call('/openapi/send', 'cm_live_nope', { method: 'POST', body: '{}' })).code).toBe(401);
	});

	it('refuses send without the email:send permission', async () => {
		expect((await call('/openapi/send', noPerm, { method: 'POST', body: '{}' })).code).toBe(403);
	});

	it('refuses delete without the email:delete permission', async () => {
		expect((await call('/openapi/email/1', noPerm, { method: 'DELETE' })).code).toBe(403);
		expect((await call('/openapi/email/1', sender, { method: 'DELETE' })).code).toBe(403);
	});

	it('refuses a banned owner', async () => {
		expect((await call('/openapi/send', banned, { method: 'POST', body: '{}' })).code).toBe(401);
	});

	it('lets a permitted owner past RBAC (fails later on the missing "from", not on auth)', async () => {
		const body = await call('/openapi/send', sender, { method: 'POST', body: '{}' });
		expect(body.code).toBe(400);
		expect((await call('/openapi/email/999999', deleter, { method: 'DELETE' })).code).toBe(200);
	});
});
