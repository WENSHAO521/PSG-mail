# D1 migrations

Versioned schema changes for the `email`/`cloud-mail` D1 database, applied via
Wrangler's built-in D1 migrations tooling — **not** the request-time
`ALTER TABLE ... catch {}` pattern used throughout `src/init/init.js` and a
handful of hot-path service methods (`archiveEmail`, `markSpam`, `delete`,
`saveAvatar`, `updateSignature` in particular re-issue an `ALTER TABLE` on
*every single call*, forever — a known issue, not touched here to avoid
breaking a database that hasn't run these migrations yet; see the note in
each of those files).

New tables/columns from this point forward go here instead of growing that
list further.

## Applying

```sh
cd mail-worker

# Local dev D1 (the one wrangler dev / vitest use). "db" is the D1 binding
# name declared in every wrangler*.toml here — pass that, not the
# database_name, since it resolves correctly regardless of which config's
# database_name/id you're targeting.
pnpm wrangler d1 migrations apply db --local -c wrangler-dev.toml

# Production — also wired into .github/workflows/deploy-cloudflare.yml,
# runs automatically on every deploy right before `wrangler deploy`. Only
# needed manually for a first-time/local production apply or to test
# unreleased migrations.
pnpm wrangler d1 migrations apply db --remote -c wrangler-action.toml
```

Wrangler tracks applied migrations in an auto-created `d1_migrations` table —
running `apply` again is a no-op for files already recorded there. Migrations
are forward-only; do not edit a migration file once it has shipped — add a
new numbered file instead.

## Naming

`NNNN_short_description.sql`, sequential, zero-padded. Each file should be
idempotent where practical (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF
NOT EXISTS`) since `d1_migrations` bookkeeping alone is what Wrangler uses to
decide whether to run a file — the `IF NOT EXISTS` guards are a second,
cheap line of defense in case bookkeeping and reality ever diverge (e.g. a
migration was applied by hand before this system existed).
