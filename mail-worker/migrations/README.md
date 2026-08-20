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

## Legacy schema evolution (known debt)

`src/init/init.js` (`dbInit.init`, called from `POST /api/init` on every
deploy) still runs its own historical v1 → v4_2 chain of ad hoc
`ALTER TABLE`/`CREATE TABLE IF NOT EXISTS` steps, wrapped in
`try { } catch { console.warn(...) }` so an already-applied change is
silently skipped rather than tracked. This predates the D1 migrations system
above and currently runs **in addition to** it — two parallel schema-change
mechanisms, not one.

This was deliberately left alone in the 2.9.0 deploy/security pass: rewriting
30 versions' worth of upgrader steps into proper migrations is a real project
of its own, and doing it under a security-hardening change would risk the
one thing that pass was trying to protect (a clean, atomic deploy). Not
touched here.

Planned for a 3.x release: port the v1 → v4_2 steps into numbered files in
this directory (one squashed baseline migration, most likely, rather than 30
separate ports), then shrink `/api/init` down to bootstrap data only
(seeding the default admin/settings rows) with no schema changes left in it.
Until that lands, treat this directory and `dbInit`'s version chain as one
combined schema history — check both before assuming a column/table does or
doesn't exist yet.
