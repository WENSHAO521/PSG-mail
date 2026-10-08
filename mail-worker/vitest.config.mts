import { defineConfig } from 'vitest/config';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';
import path from 'node:path';

// The real migrations/ directory, handed to tests as a binding so
// test/helpers/schema.js can apply exactly what production applies.
const migrations = await readD1Migrations(path.join(__dirname, 'migrations'));

// The installed @cloudflare/vitest-pool-workers version targets Vitest v4,
// which moved config from `defineWorkersConfig({ test: { poolOptions... } })`
// (a "./config" subpath that no longer exists in this version) to a Vite
// plugin — see the package's own codemods/vitest-v3-to-v4.mjs. This was
// previously misconfigured to point at a wrangler.jsonc that never existed
// in this repo, so `vitest run` never actually worked.
export default defineConfig({
	plugins: [
		cloudflareTest({
			// wrangler.vitest.toml is a dedicated minimal config (no [assets]
			// binding, which needs a built ./dist that doesn't exist pre-build)
			// — see its header comment.
			wrangler: { configPath: './wrangler.vitest.toml' },
			miniflare: { bindings: { TEST_MIGRATIONS: migrations } },
		}),
	],
	// linkedom (used by email-service.js/email.js for HTML rewriting) pulls
	// in cssom, whose extensionless `require('./CSSStyleDeclaration')` isn't
	// resolvable by vitest-pool-workers' lazy module loader (a documented
	// limitation, not specific to this repo — see
	// https://developers.cloudflare.com/workers/testing/vitest-integration/known-issues/#module-resolution).
	// Pre-bundling it with Vite/esbuild instead of loading it lazily avoids
	// the unresolved extensionless require.
	ssr: {
		noExternal: ['linkedom', 'cssom', 'domutils', 'entities'],
	},
});
