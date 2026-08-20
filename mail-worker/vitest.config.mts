import { defineConfig } from 'vitest/config';
import { cloudflareTest } from '@cloudflare/vitest-pool-workers';

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
