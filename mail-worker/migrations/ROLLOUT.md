# Production rollout checklist — 2.9.0

Covers this release's schema changes (`0001_scheduled_email.sql`,
`0002_mail_label.sql`) and the Durable Object binding (`ScheduledSendAlarm`,
for Undo Send). Both migrations are purely additive — `CREATE TABLE IF NOT
EXISTS` / `CREATE INDEX IF NOT EXISTS`, no `ALTER`/`DROP`, no data mutation —
old code never references the new tables, so there is no code/schema
incompatibility window to worry about in either direction. The Durable
Object is a new binding, not a schema change; it has its own migration
concept (`[[migrations]] new_sqlite_classes = [...]` in the wrangler
configs), unrelated to the D1 SQL files here.

## 1. Backup

D1 has time-travel built in (point-in-time recovery), which covers this
release's changes since they're additive-only — there's nothing destructive
to roll back. Still, for a release this size, take an explicit export first:

```sh
npx wrangler d1 export <database_name> --output backup-pre-2.9.0.sql --remote
```

## 2. Migrations to apply

```
mail-worker/migrations/0001_scheduled_email.sql   (scheduled_email table)
mail-worker/migrations/0002_mail_label.sql        (mail_label, mail_label_email tables)
```

Check what's pending before applying anything:

```sh
cd mail-worker
pnpm wrangler d1 migrations list db --remote -c wrangler-action.toml
```

## 3. Apply migrations

**Must happen before the new Worker code is deployed** — the new code (the
`* * * * *` cron, `/email/schedule/*`, `/label/*`) assumes these tables
exist. Reversed order isn't catastrophic (see "Rollback considerations"
below — everything degrades gracefully rather than corrupting data) but
produces a few minutes of noisy error logs and non-functional new
endpoints for no reason.

This is already automated: `.github/workflows/deploy-cloudflare.yml` runs
`wrangler d1 migrations apply` as its own step immediately before `wrangler
deploy`, and — because GitHub Actions `run:` steps default to `bash -eo
pipefail` — a failed migration step stops the job before the deploy step
ever runs. No manual action needed for a normal CI-driven deploy; only run
this by hand if deploying outside that workflow:

```sh
pnpm wrangler d1 migrations apply db --remote -c wrangler-action.toml
```

## 4. Deploy

Via the existing `deploy-cloudflare.yml` workflow (push to `main`, or
`workflow_dispatch`). **Before relying on this actually deploying anything:
confirm the required GitHub Variables/Secrets are set** — `DOMAIN`, `ADMIN`,
`JWT_SECRET`, and `MAINTENANCE_SECRET` in particular are hard requirements
the workflow checks and fails fast on if missing (see "Known pre-existing
blocker" below). `MAINTENANCE_SECRET` is new as of this pass — a separate
credential from `JWT_SECRET` that gates `/api/init` and `/api/reset-admin`;
it doesn't need to match any existing value, just be set to something
(generate a fresh random string).

Secrets and code are uploaded together in a single `wrangler deploy
--secrets-file` call — not the old `wrangler secret put` × N followed by a
separate `wrangler deploy`, which used to produce one deployment per secret.

## 5. Smoke test (after deploy)

- [ ] `GET /api/email/list` (any existing account) still returns mail —
      confirms the deploy didn't break the base path.
- [ ] Compose → "Send later" → pick a time a few minutes out → confirm it
      shows up at `/scheduled` as `pending`, and actually sends around that
      time (not immediately).
- [ ] Compose → normal Send with Undo Send enabled (Settings → Mail
      management) → confirm the Undo toast appears and clicking it restores
      the draft without the mail being sent.
- [ ] Let an Undo Send elapse without clicking Undo → confirm it actually
      sends within a few seconds of the chosen delay (not up to a minute
      late) — this is the Durable Object alarm firing, not the cron
      backstop; a multi-second-late send would indicate the alarm silently
      isn't armed and it fell back to the cron.
- [ ] Create a label, apply it to an email, confirm it shows in the sidebar
      count and the reading pane.
- [ ] Run a `/search` query with an operator (e.g. `is:unread`) and confirm
      results.
- [ ] Check Worker logs (`wrangler tail`) for the first few `* * * * *`
      cron ticks — should show no `processDue` errors.

## 6. Rollback considerations

- **Schema**: nothing to roll back — both migrations are additive. Rolling
  the Worker code back to the previous version while leaving the new tables
  in place is safe; old code simply never queries them.
- **Durable Object binding**: removing `[[durable_objects.bindings]]` from
  a wrangler config on a subsequent deploy without also removing the
  `[[migrations]]` class-migration entry can error — Cloudflare requires an
  explicit `deleted_classes` migration to retire a DO class. If rolling back
  past this release, prefer redeploying the previous Worker *version*
  (`wrangler rollback`) over hand-editing bindings.
- **In-flight scheduled sends**: a rollback while `scheduled_email` rows are
  `pending` is safe — the cron backstop (present in this and future
  versions) will still pick them up once the new code is redeployed. A
  rollback to a version *before* this release (no `scheduled_email` table
  awareness at all) simply leaves those rows un-processed until rolled
  forward again; nothing is lost or double-sent.

## Known pre-existing blocker (unrelated to this release)

`.github/workflows/deploy-cloudflare.yml` has failed on every push for
months (confirmed via `gh run list` — every "🚀 Deploy cloud-mail to
Cloudflare Workers" run since at least 2026-06-14 failed in under 30s) due
to `DOMAIN`, `ADMIN`, and `JWT_SECRET` not being set as GitHub
Variables/Secrets for this repo — the workflow's own validation step
rejects the run before touching Cloudflare at all. `MAINTENANCE_SECRET` is
now checked the same way (see "4. Deploy" above) and will also block the
run if unset. This means **pushing this release does not, by itself, deploy
anything** until all four are configured (Settings → Secrets and variables
→ Actions). Not something this release caused or can fix from inside the
repo — it needs your actual domain, admin email, a JWT secret you choose,
and a maintenance secret you choose (see "8. Required deployment config" in
the 2.9.0 deploy/security report for the full list, including
`CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID`).
