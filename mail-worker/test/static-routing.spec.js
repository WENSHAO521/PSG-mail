// The Worker only runs first for the paths listed in run_worker_first; everything else is served
// by Static Assets without a Worker invocation. If src/index.js ever starts handling another path
// prefix, it MUST be added to every wrangler config, or that path silently falls through to the SPA.
import { describe, it, expect } from 'vitest';
import indexSource from '../src/index.js?raw';
import wranglerMain from '../wrangler.toml?raw';
import wranglerAction from '../wrangler-action.toml?raw';
import wranglerDev from '../wrangler-dev.toml?raw';
import wranglerTest from '../wrangler-test.toml?raw';

const configs = { 'wrangler.toml': wranglerMain, 'wrangler-action.toml': wranglerAction, 'wrangler-dev.toml': wranglerDev, 'wrangler-test.toml': wranglerTest };

function workerFirstPatterns(toml) {
	const m = toml.match(/^run_worker_first\s*=\s*\[([^\]]*)\]/m);
	return m ? [...m[1].matchAll(/"([^"]+)"/g)].map(x => x[1]) : null;
}

// Prefixes index.js routes itself: pathname.startsWith('/api/'), ['/static/','/attachments/'].some(...)
function handledPrefixes() {
	const found = new Set();
	for (const m of indexSource.matchAll(/(?:startsWith\(|\[)\s*'(\/[a-z-]+\/)'(?:\s*,\s*'(\/[a-z-]+\/)')*/g)) {
		[m[1], m[2]].filter(Boolean).forEach(p => found.add(p));
	}
	for (const m of indexSource.matchAll(/'(\/[a-z-]+\/)'/g)) found.add(m[1]);
	return [...found];
}

describe('run_worker_first routing', () => {
	it('index.js handles exactly the known prefixes', () => {
		expect(handledPrefixes().sort()).toEqual(['/api/', '/attachments/', '/static/']);
	});

	for (const [name, toml] of Object.entries(configs)) {
		it(`${name}: every Worker-handled prefix is routed to the Worker first, nothing broader`, () => {
			const patterns = workerFirstPatterns(toml);
			expect(patterns, name + ' must use a pattern list, not `true`').not.toBeNull();
			expect(patterns.sort()).toEqual(handledPrefixes().map(p => p + '*').sort());
		});
	}
});
