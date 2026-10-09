// Attachment objects are content-addressed and shared: deleting mails must never remove an object
// that another row still references, and must remove it once nothing does.
import { env } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import { setupFullSchema } from './helpers/full-schema';
import attService from '../src/service/att-service';

function ctx() {
	const store = new Map([['setting', { resendTokens: {}, autoRefresh: 0 }]]);
	return { env, get: k => store.get(k), set: (k, v) => store.set(k, v), req: { header: () => '' } };
}

async function addRow(emailId, userId, key, accountId = 1) {
	await env.db.prepare(`INSERT INTO attachments (user_id, email_id, account_id, key, filename, size, type) VALUES (?, ?, ?, ?, 'f', 1, 0)`)
		.bind(userId, emailId, accountId, key).run();
}
const exists = async key => (await env.kv.get(key)) !== null;

beforeAll(async () => { await setupFullSchema(); });

describe('removeByEmailIds', () => {
	it('keeps a shared object until its last reference is gone', async () => {
		await env.kv.put('attachments/shared.pdf', 'bytes');
		await env.kv.put('attachments/own.pdf', 'bytes');
		await addRow(100, 1, 'attachments/shared.pdf');
		await addRow(101, 2, 'attachments/shared.pdf');
		await addRow(100, 1, 'attachments/own.pdf');

		await attService.removeByEmailIds(ctx(), [100]);
		expect(await exists('attachments/shared.pdf')).toBe(true);   // mail 101 still uses it
		expect(await exists('attachments/own.pdf')).toBe(false);     // only mail 100 used it

		await attService.removeByEmailIds(ctx(), [101]);
		expect(await exists('attachments/shared.pdf')).toBe(false);
		const left = await env.db.prepare(`SELECT COUNT(*) AS n FROM attachments WHERE email_id IN (100, 101)`).first();
		expect(left.n).toBe(0);
	});

	it('removes an object referenced by several mails when all of them are deleted in one call', async () => {
		await env.kv.put('attachments/both.png', 'bytes');
		await addRow(110, 1, 'attachments/both.png');
		await addRow(111, 1, 'attachments/both.png');
		await attService.removeByEmailIds(ctx(), [110, 111]);
		expect(await exists('attachments/both.png')).toBe(false);
	});

	it('removes an object attached twice to the same mail (used to leak)', async () => {
		await env.kv.put('attachments/twice.png', 'bytes');
		await addRow(120, 1, 'attachments/twice.png');
		await addRow(120, 1, 'attachments/twice.png');
		await attService.removeByEmailIds(ctx(), [120]);
		expect(await exists('attachments/twice.png')).toBe(false);
	});

	it('does not delete an object that gained a new reference after the old rows were removed', async () => {
		await env.kv.put('attachments/race.png', 'bytes');
		await addRow(130, 1, 'attachments/race.png');
		const realBatch = env.db.batch.bind(env.db);
		// A new mail starts referencing the same content right after the DELETE batch ran and
		// before the storage delete: the re-check must see it.
		env.db.batch = async (stmts) => {
			const out = await realBatch(stmts);
			env.db.batch = realBatch;
			await addRow(131, 9, 'attachments/race.png');
			return out;
		};
		try {
			await attService.removeByEmailIds(ctx(), [130]);
		} finally {
			env.db.batch = realBatch;
		}
		expect(await exists('attachments/race.png')).toBe(true);
		await attService.removeByEmailIds(ctx(), [131]);
		expect(await exists('attachments/race.png')).toBe(false);
	});

	it('rejects an unsupported field name', async () => {
		await expect(attService.removeAttByField(ctx(), 'key; DROP TABLE x', [1])).rejects.toThrow();
	});
});

describe('delete cost with a large attachments table', () => {
	it('reads rows proportional to the mail being deleted, not to the table', async () => {
		for (let b = 0; b < 30; b++) {
			const st = [];
			for (let i = 0; i < 100; i++) st.push(env.db.prepare(`INSERT INTO attachments (user_id, email_id, account_id, key, filename, size, type) VALUES (1, ?, 1, ?, 'f', 1, 0)`).bind(200000 + b * 100 + i, 'attachments/bulk' + (b * 100 + i)));
			await env.db.batch(st);
		}
		await addRow(300000, 1, 'attachments/target-a');
		await addRow(300000, 1, 'attachments/target-b');
		const rows = await env.db.batch([
			env.db.prepare(`SELECT DISTINCT key FROM attachments WHERE email_id = ?`).bind(300000),
			env.db.prepare(`SELECT DISTINCT key FROM attachments WHERE key IN (?, ?)`).bind('attachments/target-a', 'attachments/target-b'),
		]);
		for (const r of rows) expect(r.meta.rows_read).toBeLessThan(10); // 3000+ rows in the table
	});
});

describe('upload de-duplication (R2 mode, stubbed bucket)', () => {
	function r2Stub() {
		const objects = new Map();
		const calls = { put: 0, head: 0 };
		return {
			calls, objects,
			async put(key, content, opts) { calls.put++; objects.set(key, { httpMetadata: opts?.httpMetadata || {} }); },
			async head(key) { calls.head++; return objects.get(key) || null; },
			async delete(key) { objects.delete(key); },
		};
	}
	const r2Ctx = r2 => {
		const store = new Map([['setting', { resendTokens: {}, autoRefresh: 0 }]]);
		return { env: { ...env, r2 }, get: k => store.get(k), set: (k, v) => store.set(k, v), req: { header: () => '' } };
	};
	const att = (emailId, key = 'attachments/logo.png', filename = 'logo.png') =>
		({ key, content: new Uint8Array([1, 2, 3]), mimeType: 'image/png', filename, size: 3, emailId, userId: 1, accountId: 1, contentId: null });

	it('uploads new content once, then skips identical re-uploads with a HEAD instead of a PUT', async () => {
		const r2 = r2Stub();
		const c = r2Ctx(r2);
		await attService.addAtt(c, [att(500)]);
		expect(r2.calls).toEqual({ put: 1, head: 0 });            // unknown content: no extra operation
		await attService.addAtt(c, [att(501)]);
		expect(r2.calls).toEqual({ put: 1, head: 2 });            // known + identical: no PUT; 2 HEADs (check + post-insert verify)
		const rows = await env.db.prepare(`SELECT COUNT(*) AS n FROM attachments WHERE key = 'attachments/logo.png'`).first();
		expect(rows.n).toBe(2);
	});

	it('re-uploads when the stored headers differ (download behaviour must not change)', async () => {
		const r2 = r2Stub();
		const c = r2Ctx(r2);
		await attService.addAtt(c, [att(510, 'attachments/same.png', 'a.png')]);
		await attService.addAtt(c, [att(511, 'attachments/same.png', 'b.png')]);   // other filename -> other Content-Disposition
		expect(r2.calls.put).toBe(2);
	});

	it('re-uploads when the referenced object is missing from the bucket', async () => {
		const r2 = r2Stub();
		const c = r2Ctx(r2);
		await addRow(520, 1, 'attachments/gone.png');            // row exists, object does not
		await attService.addAtt(c, [att(521, 'attachments/gone.png')]);
		expect(r2.calls.put).toBe(1);
	});

	it('repairs the object if it vanished between the dedupe check and the row insert', async () => {
		const r2 = r2Stub();
		const c = r2Ctx(r2);
		await attService.addAtt(c, [att(530, 'attachments/vanish.png')]);
		const realHead = r2.head.bind(r2);
		let first = true;
		r2.head = async key => {
			const out = await realHead(key);
			if (first) { first = false; r2.objects.delete(key); }   // deleted right after we saw it
			return out;
		};
		await attService.addAtt(c, [att(531, 'attachments/vanish.png')]);
		expect(r2.objects.has('attachments/vanish.png')).toBe(true);
	});
});

describe('storage audit (read-only)', () => {
	it('reports unreferenced objects and never deletes anything', async () => {
		await env.kv.put('attachments/audit-ref.pdf', 'x');
		await env.kv.put('attachments/audit-orphan.pdf', 'x');
		await addRow(600, 1, 'attachments/audit-ref.pdf');
		const out = await attService.auditOrphans(ctx(), { limit: 500 });
		expect(out.supported).toBe(true);
		const orphanKeys = out.orphans.map(o => o.key);
		expect(orphanKeys).toContain('attachments/audit-orphan.pdf');
		expect(orphanKeys).not.toContain('attachments/audit-ref.pdf');
		expect(await exists('attachments/audit-orphan.pdf')).toBe(true);   // still there
		expect(await exists('attachments/audit-ref.pdf')).toBe(true);
	});
});
