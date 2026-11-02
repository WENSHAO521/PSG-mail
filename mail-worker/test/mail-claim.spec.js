// Ported from upstream maillab/cloud-mail PRs #630 and #634: a role's domain list
// never bounces mail to the user's own primary mailbox, and the super admin can
// assign unclaimed mail to a mailbox that matches its recipient address.
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import worker from '../src';
import jwtUtils from '../src/utils/jwt-utils';
import { isPrimaryAccount } from '../src/email/email';
import { claimAddresses } from '../src/service/mail-claim-service';
import { emailConst } from '../src/const/entity-const';
import { setupFullSchema } from './helpers/full-schema';

async function session(userId, email, permKeys = []) {
	const roleId = userId;
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

async function call(path, jwt, body) {
	const ctx = createExecutionContext();
	const init = body
		? { method: 'POST', headers: { Authorization: jwt, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
		: { headers: { Authorization: jwt } };
	const res = await worker.fetch(new Request('http://example.com/api' + path, init), env, ctx);
	await waitOnExecutionContext(ctx);
	return res.json();
}

async function unclaimed(toEmail) {
	const row = await env.db.prepare(
		`INSERT INTO email (send_email, account_id, user_id, to_email, subject, type, status)
		 VALUES ('x@outside.test', 0, 0, ?, 'hello', ?, ?) RETURNING email_id`
	).bind(toEmail, emailConst.type.RECEIVE, emailConst.status.NOONE).first();
	await env.db.prepare(`INSERT INTO attachments (email_id, user_id, account_id, key, filename) VALUES (?, 0, 0, ?, 'a.txt')`)
		.bind(row.email_id, 'att/' + row.email_id).run();
	return row.email_id;
}

describe('primary mailbox and the role domain list', () => {
	it('treats the registered address as primary, in any case', () => {
		expect(isPrimaryAccount({ email: 'Me@psg.test' }, { email: 'me@PSG.test' })).toBe(true);
		expect(isPrimaryAccount({ email: 'me@psg.test' }, { email: 'alias@other.test' })).toBe(false);
		expect(isPrimaryAccount(null, { email: 'me@psg.test' })).toBe(false);
		expect(isPrimaryAccount({ email: 'me@psg.test' }, null)).toBe(false);
	});
});

describe('claim addresses', () => {
	it('allows the exact recipient, then the base of a plus address', () => {
		expect(claimAddresses('Bob+news@psg.test')).toEqual(['bob+news@psg.test', 'bob@psg.test']);
		expect(claimAddresses('bob@psg.test')).toEqual(['bob@psg.test']);
		expect(claimAddresses('')).toEqual([]);
	});
});

describe('assigning unclaimed mail', () => {
	let admin, viewer, owner;
	const OWNER = 9501, OWNER_ACC = 9511, OTHER_ACC = 9512;

	beforeAll(async () => {
		await setupFullSchema();
		admin = await session(9500, env.admin);
		viewer = await session(9502, 'viewer@psg.test', ['all-email:query']);
		owner = await session(OWNER, 'late@psg.test');
		await env.db.prepare('INSERT INTO account (account_id, email, user_id) VALUES (?, ?, ?)').bind(OWNER_ACC, 'late@psg.test', OWNER).run();
		await env.db.prepare('INSERT INTO account (account_id, email, user_id) VALUES (?, ?, ?)').bind(OTHER_ACC, 'other@psg.test', OWNER).run();
	});

	it('is refused to anyone but the super admin', async () => {
		const emailId = await unclaimed('late@psg.test');
		expect((await call('/allEmail/claimTargets?emailId=' + emailId, viewer)).code).toBe(403);
		expect((await call('/allEmail/claim', viewer, { emailId, accountId: OWNER_ACC })).code).toBe(403);
		expect((await call('/allEmail/claim', owner, { emailId, accountId: OWNER_ACC })).code).toBe(403);
	});

	it('lists only matching mailboxes and moves the message with its attachments', async () => {
		const emailId = await unclaimed('late+shop@psg.test');
		const targets = await call('/allEmail/claimTargets?emailId=' + emailId, admin);
		expect(targets.code).toBe(200);
		expect(targets.data.accounts.map(a => a.accountId)).toEqual([OWNER_ACC]);

		const res = await call('/allEmail/claim', admin, { emailId, accountId: OWNER_ACC });
		expect(res.code).toBe(200);
		const row = await env.db.prepare('SELECT user_id, account_id, status FROM email WHERE email_id = ?').bind(emailId).first();
		expect(row).toEqual({ user_id: OWNER, account_id: OWNER_ACC, status: emailConst.status.RECEIVE });
		const att = await env.db.prepare('SELECT user_id, account_id FROM attachments WHERE email_id = ?').bind(emailId).first();
		expect(att).toEqual({ user_id: OWNER, account_id: OWNER_ACC });

		// A second claim finds nothing left to assign.
		expect((await call('/allEmail/claim', admin, { emailId, accountId: OWNER_ACC })).code).toBe(409);
	});

	it('refuses a mailbox that does not match the recipient', async () => {
		const emailId = await unclaimed('late@psg.test');
		expect((await call('/allEmail/claim', admin, { emailId, accountId: OTHER_ACC })).code).toBe(409);
		const row = await env.db.prepare('SELECT user_id, status FROM email WHERE email_id = ?').bind(emailId).first();
		expect(row).toEqual({ user_id: 0, status: emailConst.status.NOONE });
	});

	it('rejects malformed ids', async () => {
		expect((await call('/allEmail/claim', admin, { emailId: '1 OR 1', accountId: OWNER_ACC })).code).toBe(400);
	});
});
