// Builds a database exactly the way a real deployment does: the legacy
// src/init/init.js upgrade chain (what POST /init runs) followed by every
// file in migrations/ via D1's migration runner. Doubles as the migration
// test — if any step stops being replayable on a fresh database, every spec
// using this helper fails.
import { env, applyD1Migrations } from 'cloudflare:test';
import { dbInit } from '../../src/init/init';

const LEGACY_STEPS = [
	'intDB', 'v1_1DB', 'v1_2DB', 'v1_3DB', 'v1_3_1DB', 'v1_4DB', 'v1_5DB', 'v1_6DB', 'v1_7DB',
	'v2DB', 'v2_3DB', 'v2_4DB', 'v2_5DB', 'v2_6DB', 'v2_7DB', 'v2_8DB', 'v2_9DB',
	'v3_0DB', 'v3_1DB', 'v3_2DB', 'v3_3DB', 'v3_4DB', 'v3_5DB', 'v3_6DB', 'v3_7DB', 'v3_8DB', 'v3_9DB',
	'v4_0DB', 'v4_1DB', 'v4_2DB', 'v4_3DB', 'v4_4DB',
];

export function makeCtx(overrides = {}) {
	const store = new Map();
	const e = { ...env, ...overrides };
	return {
		env: e,
		get: (k) => store.get(k),
		set: (k, v) => store.set(k, v),
		req: { header: () => undefined, url: 'http://example.com/' },
	};
}

let done = null;

export async function bootstrapSchema() {
	if (done) return done;
	done = (async () => {
		const c = makeCtx();
		for (const step of LEGACY_STEPS) {
			await dbInit[step](c);
		}
		await applyD1Migrations(env.db, env.TEST_MIGRATIONS);
	})();
	return done;
}

// Minimal settings snapshot in KV so settingService.query() works without
// running /init's refresh().
export async function seedSettings(extra = {}) {
	const row = await env.db.prepare('SELECT * FROM setting').first();
	const camel = {};
	for (const [k, v] of Object.entries(row || {})) {
		camel[k.replace(/_([a-z])/g, (_, ch) => ch.toUpperCase())] = v;
	}
	camel.resendTokens = JSON.parse(camel.resendTokens || '{}');
	Object.assign(camel, extra);
	await env.kv.put('setting:', JSON.stringify(camel));
	return camel;
}

export async function insertUser({ email, password = null, salt = '', hash = null, type = 1 }) {
	const { results } = await env.db.prepare(
		`INSERT INTO user (email, password, salt, type) VALUES (?, ?, ?, ?) RETURNING user_id`
	).bind(email, hash ?? password, salt, type).all();
	const userId = results[0].user_id;
	const acc = await env.db.prepare(
		`INSERT INTO account (email, name, user_id) VALUES (?, ?, ?) RETURNING account_id`
	).bind(email, email.split('@')[0], userId).all();
	return { userId, accountId: acc.results[0].account_id };
}
