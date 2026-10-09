// Admin-only read endpoints must enforce the role permission through the real middleware chain.
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import worker from '../src';
import jwtUtils from '../src/utils/jwt-utils';
import { setupFullSchema } from './helpers/full-schema';

async function session(userId, email, roleId) {
	await env.db.prepare(`INSERT OR REPLACE INTO role (role_id, name, send_type) VALUES (?, ?, 'count')`).bind(roleId, 'r' + roleId).run();
	await env.db.prepare(`INSERT OR REPLACE INTO user (user_id, email, password, salt, type, status) VALUES (?, ?, 'x', 'x', ?, 0)`).bind(userId, email, roleId).run();
	const token = 'tok-' + userId;
	await env.kv.put('auth-uid:' + userId, JSON.stringify({ tokens: [token], user: { userId, email, type: roleId }, refreshTime: new Date().toISOString() }));
	return await jwtUtils.generateToken({ env }, { userId, token });
}

async function get(path, jwt) {
	const ctx = createExecutionContext();
	const res = await worker.fetch(new Request('http://example.com/api' + path, { headers: { Authorization: jwt } }), env, ctx);
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
});
