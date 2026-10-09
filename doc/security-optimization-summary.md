# PSG Mail — security hardening & resource optimization: summary

Branch `claude/psg-mail-security-optimization-sm00ea` (13 batches on top of `309c63b`).
Per-batch detail, evidence and rollback notes: `doc/security-optimization-log.md`.
Nothing here was deployed, no production database or DNS/MX/route/secret was touched, no mail, user, attachment, setting or history was deleted, and no retention period was changed.

## 1. Status by phase

| Phase | Result |
|---|---|
| P0 authentication | **Done:** PBKDF2 with progressive migration, login/maintenance/admin-password throttling, current-password requirement for self-service change, device sessions (list / revoke / sign out others), credential-free session cache. **Open:** TOTP/Passkey (not evaluated in depth), login messages still reveal whether an account exists |
| P0 API authorization | **Done:** `/oss` allowlist (critical in KV mode), API-key RBAC + banned-owner check, unscoped `delete_time` update fixed, per-route review of the remaining modules (no further IDOR found) |
| P0 attachments / objects | **Done:** attachment reference test is indexed and re-checked; safe response headers were already in place. **Open:** signed expiring URLs (needs frontend), owner-scoping of compose-time embedded images |
| P0 webhooks / callbacks | **Done:** fail-closed signature, replay dedupe, outbound URL guard (web push, webhook), generic errors |
| P0 secrets | **Done (opt-in):** AES-GCM encryption at rest for provider/bot/S3/Mailjet/SMTP/translate keys and backup OAuth tokens with a Worker-secret master key, migration action and key rotation (batch 13); responses mask secrets harder, no secrets in logs. **Needs you:** set `credential_master_key` and run the migration |
| P0 web app | **Done:** generic error bodies, API + SPA security headers, optional CORS pin, dependency audit clean. **Open:** enforced CSP (should ship report-only first) |
| P1 Workers | **Done:** `run_worker_first` path list (locally verified, 9 → 3 Worker invocations for 9 requests). Polling reviewed, deliberately unchanged |
| P1 D1 | **Done:** cursor pages skip `COUNT`, shared-account queries index-bound, 4 new indexes, request-time `ALTER TABLE` removed. **Open:** list still returns full bodies (frontend change) |
| P1 KV / R2 | **Done:** public config no longer scans, API-key lookups cached 30 s, R2 upload dedupe, orphan audit (read-only). **Open:** dangling-row scan, automatic orphan cleanup (intentionally manual) |
| P1 AI | **Done:** assistant under quota, sanitized history, untrusted-content framing, summary cache. **Open:** per-call Neuron accounting (not exposed by Workers AI), atomic one-time confirmation |
| P1 Cron / DO | **Done:** purge fixed for > 100 rows, jobs isolated, stats refresh skips when unchanged, per-minute fallback measured as index-bound (kept) |
| P2 monitoring | **Done:** aggregated counters + admin API. Workers/D1/KV/R2/DO/Neuron totals must come from Cloudflare analytics |

## 2. Changes operators must know about (behaviour changes)

1. **Resend webhooks are rejected without `resend_webhook_secret`.** Set it (Resend dashboard → signing secret) before deploying, otherwise delivery/bounce status stops updating. Temporary escape hatch: `resend_webhook_insecure = "true"` (not recommended).
2. **New passwords: 8–128 characters** (was 6–30). Existing passwords keep working.
3. **Self-service password change now requires the current password** and signs out the other devices. The bundled frontend was updated; third-party clients of `PUT /my/resetPassword` must send `currentPassword`.
4. **Old password hashes are upgraded to PBKDF2 on the next successful login.** After that, an older build cannot verify those users (see rollback).
5. **Unexpected server errors return `Internal server error`**; details are in the Worker log.
6. **`/openapi` API keys obey the owner's role permissions and status.** Revocation/ban takes effect within 30 s (isolate cache).
7. **Dashboard statistics (only if `analysis_cache = true`)**: the 30-minute refresh runs only when new mail/users/accounts exist; deletions show at the daily 16:00 refresh.
8. **`run_worker_first` is now a path list** — must be verified in a test environment first (checklist below).
9. **HSTS** `max-age=15552000` (no `includeSubDomains`/preload) is sent for the SPA.
10. **AI assistant**: default ceiling 200 model calls/user/day when no admin quota is set.

New optional variables: `resend_webhook_insecure`, `cors_origins` (comma-separated origins; unset keeps `*`), Worker secrets `credential_master_key` / `credential_master_key_previous` (credential encryption; unset = unchanged behaviour).

## 3. Release checklist

1. Take a D1 export / rely on time-travel (all new migrations are additive).
2. Migrations — applied automatically by `deploy-cloudflare.yml` before `wrangler deploy`; manually: `pnpm wrangler d1 migrations apply db --remote -c wrangler-action.toml`:
   `0017_email_account_list_index`, `0018_verify_record_ip_index`, `0019_attachments_key_index`, `0020_ops_metric`.
   The app works without them (slower plans / no metrics storage). Like the existing `0007`, they index core tables, so they assume the database was initialised.
3. Set `resend_webhook_secret` as a Worker secret. Optionally set `credential_master_key` (back it up!) and run `POST /setting/credentialMigrate?dryRun=1` then without `dryRun` — see batch 13.
4. Deploy to the **test environment** (`wrangler-test.toml`) and check: login (old-hash and new user), password change, "sign out other devices", deep-link refresh (`/settings`, `/label/1`), PWA install/update, avatar/background, inline mail images, attachment download/delete, scheduled send, a Resend status webhook, `GET /api/setting/opsMetrics`, `GET /api/setting/storageAudit`.
5. Deploy production; watch `auth.*`, `webhook.*`, `cron.*_error`, `ai.quota_denied` for a few days.
6. Optional experiments (not changes): `autoRefresh = 60` in the test environment; review `storageAudit` output before any manual orphan cleanup.

## 4. Rollback

| What | How | Data impact |
|---|---|---|
| Any code batch | `git revert <commit>` (commits listed in the log) | none |
| PBKDF2 hashes | users who logged in after the change have PBKDF2 hashes; reverting needs a build that can verify them (keep batch 1's `crypto-utils.js` verify path) or a password reset for those users | no data loss, login friction |
| Worker routing | set `run_worker_first = true` again | none |
| Webhook strictness | `resend_webhook_insecure = "true"` | none |
| Indexes / metrics table | `DROP INDEX idx_email_account_list`, `idx_verify_record_ip`, `idx_attachments_key`; `DROP TABLE ops_metric` | none |

## 5. Evidence and its limits

- 203 automated tests (worker, local Workers runtime) pass; the Vue app builds. Security fixes were reproduced by a failing test first where feasible (`/oss` key leak, trash purge > 100 rows, attachment re-check).
- Performance numbers (rows read, query plans, Worker invocations) come from **local D1 / `wrangler dev` runs on synthetic data**, as stated in each batch. They show the mechanism and guard against regressions; they are **not** production savings. Production effect has to be read from Cloudflare analytics before/after the release.
- Not performed: load testing, concurrent multi-user stress, large-attachment tests, backup/restore drill, push-outage and Cloudflare-outage drills, real-device sync tests.

## 6. Remaining risk, in suggested order

1. **Turn credential encryption on** (code is shipped, off until `credential_master_key` is set); it protects against database/KV/export disclosure, not against code execution in the Worker.
2. **Account enumeration** via distinct login error messages (registration also reveals existence) — product decision.
3. **CSP**: ship `Content-Security-Policy-Report-Only`, collect violations, then enforce.
4. **List payload**: omit bodies from `/email/list`, fetch on open (frontend + native clients).
5. **AI confirmation** single-use via an atomic D1 claim; pending confirmations keep conversation text in KV for 5 minutes.
6. **Attachment URLs** are capability links (unguessable but shareable); signed expiring URLs would need frontend work.
7. **Rate limits are best-effort** (KV is not atomic); a Cloudflare WAF/rate-limiting rule in front of `/api/login` is the strong control.
8. TOTP/Passkey, dangling attachment rows scan, `npm ci` peer-dependency conflict in `mail-vue` (needs `--legacy-peer-deps`).
