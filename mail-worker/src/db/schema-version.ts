// Schema version = number of the newest migration in migrations/ that
// `wrangler d1 migrations apply` has recorded in its d1_migrations table.
// Bump EXPECTED_SCHEMA_VERSION together with every new migration file
// (enforced by scripts/check-migrations.mjs).
export const EXPECTED_SCHEMA_VERSION = 15;

export type SchemaStatus = 'ok' | 'behind' | 'unknown';

export interface SchemaReport {
	status: SchemaStatus;
	applied: number | null;
	expected: number;
}

// Pure so it can be unit-tested without a database.
export function parseAppliedVersion(names: string[]): number {
	return names.reduce((max, name) => {
		const m = /^(\d{4})_/.exec(name);
		return m ? Math.max(max, Number(m[1])) : max;
	}, 0);
}

export async function readSchemaReport(db: D1Database, expected = EXPECTED_SCHEMA_VERSION): Promise<SchemaReport> {
	let names: string[];
	try {
		const { results } = await db.prepare('SELECT name FROM d1_migrations').all<{ name: string }>();
		names = results.map((r) => r.name);
	} catch {
		// No d1_migrations table: the DB was set up outside wrangler's migration
		// tooling (legacy POST /init only). We can't tell, so don't claim "behind".
		return { status: 'unknown', applied: null, expected };
	}
	const applied = parseAppliedVersion(names);
	return { status: applied >= expected ? 'ok' : 'behind', applied, expected };
}
