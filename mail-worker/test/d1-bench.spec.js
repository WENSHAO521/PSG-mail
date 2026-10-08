// D1 query-plan / rows-read benchmark against the REAL schema (init chain + migrations) on
// local D1. Not a production measurement: it shows how many rows the engine touches for the
// hot mail-list statements and whether they use an index. Numbers are printed, and the
// assertions guard against regressions to full scans.
import { env } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import { dbInit } from '../src/init/init';
import emailService from '../src/service/email-service';

const migrations = import.meta.glob('../migrations/*.sql', { query: '?raw', import: 'default', eager: true });

function makeCtx() {
	const store = new Map();
	return { env, get: k => store.get(k), set: (k, v) => store.set(k, v), req: { header: () => '' } };
}

// Flip to true to print the full plan/rows-read report as a test failure message.
const PRINT_REPORT = false;
const recorded = [];
let capturing = true;

beforeAll(async () => {
	const c = makeCtx();
	const steps = Object.keys(dbInit).filter(k => /^(intDB|v\d+(_\d+)*DB)$/.test(k));
	const order = (k) => k === 'intDB' ? [-1] : k.slice(1, -2).split('_').map(Number);
	steps.sort((a, b) => { const x = order(a), y = order(b); for (let i = 0; i < 3; i++) { const d = (x[i] ?? 0) - (y[i] ?? 0); if (d) return d; } return 0; });
	for (const s of steps) { try { await dbInit[s](c); } catch (e) { console.warn('init step', s, e.message); } }
	for (const [path, sqlText] of Object.entries(migrations).sort()) {
		for (const stmt of sqlText.split(/;\s*(?:\n|$)/).map(s => s.replace(/^\s*--.*$/gm, '').trim()).filter(Boolean)) {
			try { await env.db.prepare(stmt).run(); } catch (e) { /* already applied / not applicable */ }
		}
	}

	// seed: 3 users, 1 account each + one shared; 3000 mails for user 1 over 2 accounts
	const batch = [];
	for (let u = 1; u <= 3; u++) {
		batch.push(env.db.prepare(`INSERT OR IGNORE INTO account (account_id, email, user_id, name) VALUES (?, ?, ?, '')`).bind(u, `u${u}@example.com`, u));
	}
	await env.db.batch(batch);
	for (let chunk = 0; chunk < 30; chunk++) {
		const rows = [];
		for (let i = 0; i < 100; i++) {
			const n = chunk * 100 + i;
			const user = n % 10 === 0 ? 2 : 1;
			rows.push(env.db.prepare(
				`INSERT INTO email (send_email, name, account_id, user_id, subject, content, text, type, status, is_del) VALUES (?,?,?,?,?,?,?,?,?,0)`
			).bind('s@x.com', 's', user, user, 'subj ' + n, '<p>' + 'x'.repeat(2000) + '</p>', 'x'.repeat(500), n % 7 === 0 ? 1 : 0, 0));
		}
		await env.db.batch(rows);
	}
	await env.db.prepare(`ANALYZE`).run().catch(() => {});

	// capture every statement the service issues
	const realPrepare = env.db.prepare.bind(env.db);
	env.db.prepare = (sqlText) => {
		const stmt = realPrepare(sqlText);
		const origBind = stmt.bind.bind(stmt);
		stmt.bind = (...args) => { if (capturing) recorded.push({ sql: sqlText, args }); return origBind(...args); };
		return stmt;
	};
});

async function analyze(entry) {
	const plan = await env.db.prepare('EXPLAIN QUERY PLAN ' + entry.sql).bind(...entry.args).all().catch(() => ({ results: [] }));
	const res = await env.db.prepare(entry.sql).bind(...entry.args).all();
	return { rowsRead: res.meta?.rows_read, plan: plan.results.map(r => r.detail) };
}

async function scenario(name, fn) {
	recorded.length = 0;
	capturing = true;
	await fn();
	capturing = false;
	const report = [];
	for (const entry of [...recorded]) {
		if (!/from "?(email|attachments)"?/i.test(entry.sql)) continue;
		report.push({ sql: entry.sql.replace(/\s+/g, ' ').slice(0, 90), ...(await analyze(entry)) });
	}
	return { name, report };
}

describe('mail list query plans', () => {
	it('inbox page: rows read per statement and index usage', async () => {
		recorded.length = 0;
		capturing = true;
		const out = await emailService.list(makeCtx(), { emailId: 0, type: 0, accountId: 1, size: 20, timeSort: 0, allReceive: 0 }, 1);
		expect(out.list.length).toBe(20);
		capturing = false;
		const report = [];
		for (const entry of [...recorded]) {
			if (!/from "?email"?/i.test(entry.sql) && !/from "?attachments"?/i.test(entry.sql)) continue;
			report.push({ sql: entry.sql.replace(/\s+/g, ' ').slice(0, 110), ...(await analyze(entry)) });
		}
		if (PRINT_REPORT) throw new Error(JSON.stringify(report, null, 1));
		const scans = report.filter(r => r.plan.some(p => /^SCAN (email|attachments)\b/.test(p) && !/USING/.test(p)));
		expect(scans).toEqual([]);
	});

	it('all scenarios', async () => {
		await env.db.prepare(`CREATE TABLE IF NOT EXISTS account_share (id INTEGER PRIMARY KEY AUTOINCREMENT, account_id INTEGER NOT NULL, user_id INTEGER NOT NULL, create_time DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(account_id, user_id))`).run();
		await env.db.prepare(`INSERT OR IGNORE INTO account_share (account_id, user_id) VALUES (1, 3)`).run();
		await env.db.prepare(`INSERT OR IGNORE INTO account_share (account_id, user_id) VALUES (2, 3)`).run();
		const out = [];
		out.push(await scenario('SPARSE shared account 2: list page', () => emailService.list(makeCtx(), { emailId: 0, type: 0, accountId: 2, size: 20, timeSort: 0, allReceive: 0 }, 3)));
		out.push(await scenario('SPARSE shared account 2: latest', () => emailService.latest(makeCtx(), { emailId: 99999, accountId: 2, allReceive: 0 }, 3)));
		out.push(await scenario('page2 (cursor)', () => emailService.list(makeCtx(), { emailId: 2500, type: 0, accountId: 1, size: 20, timeSort: 0, allReceive: 0 }, 1)));
		out.push(await scenario('latest, nothing new (owner)', () => emailService.latest(makeCtx(), { emailId: 99999, accountId: 1, allReceive: 0 }, 1)));
		out.push(await scenario('list (user with a shared account)', () => emailService.list(makeCtx(), { emailId: 0, type: 0, accountId: 1, size: 20, timeSort: 0, allReceive: 0 }, 3)));
		out.push(await scenario('latest, nothing new (user with a shared account)', () => emailService.latest(makeCtx(), { emailId: 99999, accountId: 1, allReceive: 0 }, 3)));
		out.push(await scenario('list all-inboxes', () => emailService.list(makeCtx(), { emailId: 0, type: 0, accountId: 1, size: 20, timeSort: 0, allReceive: 1 }, 1)));
		if (PRINT_REPORT) throw new Error(JSON.stringify(out, null, 1));

		const by = Object.fromEntries(out.map(o => [o.name, o.report]));
		const mailQueries = name => by[name].filter(r => /^select "email"/.test(r.sql) || /^select count/.test(r.sql));
		const noTableWideScan = r => !r.plan.some(p => /idx_email_type|SCAN email/.test(p));

		// Cursor pages must not COUNT the mailbox.
		expect(by['page2 (cursor)'].some(r => /^select count/.test(r.sql))).toBe(false);

		// Pages and polls stay O(page), never O(table), also for shared accounts.
		for (const name of ['SPARSE shared account 2: list page', 'SPARSE shared account 2: latest',
			'latest, nothing new (owner)', 'latest, nothing new (user with a shared account)']) {
			for (const r of by[name].filter(r => /^select "email"/.test(r.sql))) {
				expect(r.rowsRead, name).toBeLessThan(60);
				expect(noTableWideScan(r), name + ' ' + r.plan.join(' | ')).toBe(true);
			}
		}
		expect(mailQueries('list (user with a shared account)').every(noTableWideScan)).toBe(true);
	});

	it('access scope: shared account readable, foreign account not', async () => {
		await env.db.prepare(`CREATE TABLE IF NOT EXISTS account_share (id INTEGER PRIMARY KEY AUTOINCREMENT, account_id INTEGER NOT NULL, user_id INTEGER NOT NULL, create_time DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(account_id, user_id))`).run();
		await env.db.prepare(`INSERT OR IGNORE INTO account_share (account_id, user_id) VALUES (2, 3)`).run();
		const q = (userId, accountId) => ({ emailId: 0, type: 0, accountId, size: 20, timeSort: 0, allReceive: 0 });
		// user 3 owns nothing but account 2 is shared with them
		expect((await emailService.list(makeCtx(), q(3, 2), 3)).list.length).toBe(20);
		expect((await emailService.latest(makeCtx(), { emailId: 0, accountId: 2, allReceive: 0 }, 3)).length).toBeGreaterThan(0);
		// account 3 belongs to user 3 and holds nothing; account 1 is not shared with user 4 at all
		expect((await emailService.list(makeCtx(), q(4, 1), 4)).list).toEqual([]);
		expect(await emailService.latest(makeCtx(), { emailId: 0, accountId: 1, allReceive: 0 }, 4)).toEqual([]);
		// the owner still sees their own mail through a non-shared account
		expect((await emailService.list(makeCtx(), q(1, 1), 1)).list.length).toBe(20);
		// user 2's mails inside account 2 are the only rows user 2 sees there (account 2 is theirs)
		const own = await emailService.list(makeCtx(), q(2, 2), 2);
		expect(own.list.every(r => r.userId === 2 && r.accountId === 2)).toBe(true);
	});
});
