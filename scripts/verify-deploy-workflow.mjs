#!/usr/bin/env node
// Static guard for .github/workflows/deploy-cloudflare.yml: a normal
// production deploy must push code and Worker Secrets in ONE atomic
// `wrangler deploy --secrets-file` call, never via `wrangler secret put`
// (which, per current Wrangler behavior, creates and immediately deploys
// its own new Worker version per call — see the "🔐🚀 构建 Secrets 文件并
// 部署" step's comment in that workflow for the incident this guards
// against: up to 4 separate deployments per CI run before this was fixed).
//
// Run: node scripts/verify-deploy-workflow.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflowPath = path.join(repoRoot, '.github', 'workflows', 'deploy-cloudflare.yml');
const rawYaml = readFileSync(workflowPath, 'utf8');

// Strip full-line comments (YAML `#...` lines and bash comments inside
// `run: |` blocks share the same syntax) so prose explaining what NOT to do
// — which necessarily mentions "wrangler secret put"/"wrangler deploy" by
// name — doesn't get counted as an actual invocation.
const yaml = rawYaml
	.split('\n')
	.filter((line) => !line.trim().startsWith('#'))
	.join('\n');

const failures = [];

if (/wrangler\s+secret\s+put/.test(yaml)) {
	failures.push(
		'found "wrangler secret put" — secrets must go up via `wrangler deploy --secrets-file` ' +
		'in the same deploy, not separate `secret put` calls.'
	);
}

const deployInvocations = yaml.match(/wrangler\s+deploy\b/g) || [];
if (deployInvocations.length !== 1) {
	failures.push(
		`expected exactly one "wrangler deploy" invocation (one deployment per normal CI run), ` +
		`found ${deployInvocations.length}.`
	);
}

if (!/wrangler\s+deploy\b[^\n]*--secrets-file/.test(yaml)) {
	failures.push('expected the "wrangler deploy" call to pass --secrets-file.');
}

if (failures.length) {
	console.error('❌ deploy-cloudflare.yml failed the single-deployment guard:');
	for (const f of failures) console.error(`  - ${f}`);
	process.exit(1);
}

console.log(
	'✅ deploy-cloudflare.yml: exactly one wrangler deploy, --secrets-file present, no wrangler secret put.'
);
