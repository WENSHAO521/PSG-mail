// Builds the real schema (init chain + migrations/*.sql) on the local D1 test database.
import { env } from 'cloudflare:test';
import { dbInit } from '../../src/init/init';

const migrations = import.meta.glob('../../migrations/*.sql', { query: '?raw', import: 'default', eager: true });

export function makeCtx() {
	const store = new Map();
	return { env, get: k => store.get(k), set: (k, v) => store.set(k, v), req: { header: () => '' } };
}

let done = false;
export async function setupFullSchema() {
	if (done) return;
	done = true;
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
}
