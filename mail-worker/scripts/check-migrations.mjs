// CI gate for schema changes. Two checks:
//  1. migrations/ files are named NNNN_<name>.sql, sequential, no gaps/dupes.
//  2. Runtime DDL (ALTER/CREATE TABLE|INDEX in src/) may only shrink. The
//     legacy request-time pattern in src/init/init.js and a few hot paths is
//     frozen at the counts in runtime-ddl-baseline.json; new schema changes
//     must be a file in migrations/. Run with --update after REMOVING DDL to
//     lower the baseline.
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const baselinePath = join(root, 'scripts', 'runtime-ddl-baseline.json');
const errors = [];

// 1. migration naming
const files = readdirSync(join(root, 'migrations')).filter((f) => f.endsWith('.sql')).sort();
files.forEach((f, i) => {
	const m = /^(\d{4})_[a-z0-9_]+\.sql$/.exec(f);
	if (!m) return errors.push(`migrations/${f}: name must match NNNN_snake_case.sql`);
	if (Number(m[1]) !== i + 1) errors.push(`migrations/${f}: expected number ${String(i + 1).padStart(4, '0')} (gap or duplicate)`);
});

// 2. runtime DDL ratchet
const DDL = /\b(ALTER\s+TABLE|CREATE\s+(UNIQUE\s+)?(TABLE|INDEX))\b/gi;
function walk(dir) {
	return readdirSync(dir).flatMap((n) => {
		const p = join(dir, n);
		return statSync(p).isDirectory() ? walk(p) : /\.(js|ts)$/.test(n) ? [p] : [];
	});
}
const counts = {};
for (const f of walk(join(root, 'src'))) {
	const n = (readFileSync(f, 'utf8').match(DDL) || []).length;
	if (n) counts[relative(root, f)] = n;
}

if (process.argv.includes('--update')) {
	writeFileSync(baselinePath, JSON.stringify(counts, null, '\t') + '\n');
	console.log('baseline updated');
	process.exit(0);
}

const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
for (const [f, n] of Object.entries(counts)) {
	if (n > (baseline[f] ?? 0)) {
		errors.push(`${f}: ${n} runtime DDL statement(s), baseline ${baseline[f] ?? 0}. Add a migration in migrations/ instead.`);
	}
}

if (errors.length) {
	console.error(errors.join('\n'));
	process.exit(1);
}
console.log(`ok: ${files.length} migrations, runtime DDL within baseline`);
