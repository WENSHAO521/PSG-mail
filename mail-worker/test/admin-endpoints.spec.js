// Admin-only read endpoints must enforce the role permission through the real middleware chain.
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import worker from '../src';
import jwtUtils from '../src/utils/jwt-utils';
import { setupFullSchema } from './helpers/full-schema';

async function session(userId, email, roleId, permKeys = []) {
	await env.db.prepare(`INSERT OR REPLACE INTO role (role_id, name, send_type) VALUES (?, ?, 'count')`).bind(roleId, 'r' + roleId).run();
	for (const key of permKeys) {
		const perm = await env.db.prepare(`SELECT perm_id FROM perm WHERE perm_key = ?`).bind(key).first();
		await env.db.prepare(`INSERT INTO role_perm (role_id, perm_id) VALUES (?, ?)`).bind(roleId, perm.perm_id).run();
	}
	await env.db.prepare(`INSERT OR REPLACE INTO user (user_id, email, password, salt, type, status) VALUES (?, ?, 'x', 'x', ?, 0)`).bind(userId, email, roleId).run();
	const token = 'tok-' + userId;
	await env.kv.put('auth-uid:' + userId, JSON.stringify({ tokens: [token], user: { userId, email, type: roleId }, refreshTime: new Date().toISOString() }));
	return await jwtUtils.generateToken({ env }, { userId, token });
}

async function get(path, jwt, method = 'GET') {
	const ctx = createExecutionContext();
	const res = await worker.fetch(new Request('http://example.com/api' + path, { method, headers: { Authorization: jwt } }), env, ctx);
	await waitOnExecutionContext(ctx);
	return res.json();
}

describe('admin read endpoints', () => {
	let plain, admin;
	beforeAll(async () => {
		await setupFullSchema();
		plain = await session(7001, 'plain@example.com', 7001);
		admin = await session(7002, env.admin, 7002);
	});

	for (const path of ['/setting/opsMetrics?days=3', '/setting/storageAudit', '/setting/providerUsage']) {
		it(`${path}: refused without the setting permission, allowed for the admin`, async () => {
			expect((await get(path, plain)).code).toBe(403);
			expect((await get(path, 'garbage')).code).toBe(401);
			expect((await get(path, admin)).code).toBe(200);
		});
	}

	it('credential encryption: status needs setting:query, migrate needs setting:set (no prefix overlap)', async () => {
		const viewer = await session(7003, 'viewer@example.com', 7003, ['setting:query']);
		expect((await get('/setting/credentialStatus', plain)).code).toBe(403);
		expect((await get('/setting/credentialStatus', viewer)).code).toBe(200);
		expect((await get('/setting/credentialMigrate?dryRun=1', viewer, 'POST')).code).toBe(403);
		expect((await get('/setting/credentialMigrate?dryRun=1', plain, 'POST')).code).toBe(403);
		// the admin reaches the handler; without a master key it answers 400, not 403
		expect((await get('/setting/credentialMigrate?dryRun=1', admin, 'POST')).code).toBe(400);
	});
});
