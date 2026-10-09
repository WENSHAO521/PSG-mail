# PSG Mail security / resource optimization log

## Batch 1 — P0 authentication (this commit)

Verified on the latest branch (not assumed from older versions):

| Item | Status before | Change |
|---|---|---|
| Password hash | single-round salted SHA-256 (`crypto-utils.js`) — **confirmed, High** | PBKDF2-HMAC-SHA256, 100000 iterations (Workers runtime maximum), stored as `pbkdf2-sha256$<iter>$<b64>`; legacy hashes still verify and are re-hashed on next successful login (compare-and-set on the old hash). No passwords are reset. |
| Login brute force | no limit on `/login` — **confirmed, High** | Best-effort KV counters: 10 failures / 15 min per account, 40 / 15 min per IP, HTTP 429; failures logged without secrets. KV is non-atomic, so this bounds sustained guessing but is not a strict lock. |
| Password length | min 6, max 30 | min 8, max 128 (register, change, admin reset). Frontend min check updated to 8. Existing shorter passwords still log in. |
| `logout` | threw on missing auth record; `splice(-1)` removed the wrong token when the token was absent | guarded |
| JWT | HS256, signature + `exp` verified; tokens have no `exp` but are revocable via the KV token list | unchanged this batch |

Not yet done (remaining P0): per-device session list/revoke-all, TOTP/Passkey evaluation, user enumeration in login messages, API-route authorization audit, attachment/OSS audit, webhook, secrets at rest.

Tests: `test/password-hash.spec.js` (new); full suite 127/127 passing locally.

Rollback: revert the commit. Users who already logged in once have PBKDF2 hashes, which the old code cannot verify — so roll back only together with a forward-compatible build, or have those users reset their password.

## Batch 2 — P0 API authorization / object access

| # | Finding (verified, reproduced by test before fixing) | Risk | Fix |
|---|---|---|---|
| 1 | `GET /oss/*` is unauthenticated and, in **KV storage mode** (no R2/S3 configured), read any KV key: `/oss/auth-uid:<id>` returned the session record (token list + user row incl. password hash), `/oss/public_key:` the public API token | **Critical** (KV mode only; R2/S3 deployments only exposed objects) | Allowlist: only `attachments/` and `static/background/` keys; reject `..`, `//`, `\`, NUL, bad escapes. `test/oss-access.spec.js` |
| 2 | `email.delete` / `allEmailDelete` ran a second **unscoped** `UPDATE email SET delete_time … WHERE email_id IN (…)`, letting any user alter trash timestamps of other users' mail (affects purge timing) | Medium | single scoped UPDATE (`delete_time` kept if already trashed). `test/email-authz.spec.js` |
| 3 | `/openapi/*` API keys skipped RBAC: a role without `email:send`/`email:delete`, or a banned/deleted user, could still send/delete through a key | High | owner must be active; send needs `email:send`, DELETE routes need `email:delete` (admin exempt, same as JWT routes) |
| 4 | `/public/genToken` (admin password check) and `account/bind` (verifies another user's password) had no throttle → bypass of the `/login` limiter | High | shared `login-throttle.js` applied to both |
| 5 | `ALTER TABLE … ADD COLUMN` executed inside normal requests (delete, archive, spam, avatar, signature) — extra D1 writes/latency on hot paths | Perf | `utils/schema-guard.js`: one memoized `pragma_table_info` check per column per isolate, ALTER only if missing |

Reviewed and left unchanged (documented decisions):
- Attachment/inline-image URLs (`/oss`, `/attachments`) are **capability URLs**: key = 128-bit content hash, unauthenticated by design because `<img>` cannot send a bearer token. Not enumerable, but anyone holding a URL can fetch it, and the key reveals whether a known file exists. Moving to signed, expiring URLs needs a frontend change (backlog).
- Compose: an `<img src="attachments/<key>">` in an outgoing mail attaches the object if the key exists in `att`, regardless of owner — requires knowing the key (capability), so low risk; owner scoping is on the backlog.
- Prefix matching in `security.js` (`exclude` / `requirePerms`) checked: all exclude entries map to intended routes; no unintended route falls under an excluded prefix. Hono routing is case-sensitive, so case variants do not reach a handler.
- `/public/*` compares the shared token with `!==` against `null` when unset, so an unset token cannot be matched by a missing header.

Tests: 131/131 pass locally (new: oss-access, email-authz, login throttle).
Rollback: revert the commit; no schema or data migration is involved (`schema-guard` only adds columns that older code also added lazily).
Still open for P0: remaining per-route audit (labels, contacts, templates, forwarding, backup, AI), webhook replay/idempotency review, secret-at-rest encryption, session list/revoke, response-leak review (authInfo.user holds the password hash in KV).

## Batch 3 — webhooks, outbound targets, secret exposure

| # | Finding | Risk | Fix |
|---|---|---|---|
| 1 | `POST /webhooks` only verified the Svix signature **if** `resend_webhook_secret` was set; otherwise anyone could forge `delivered` / `bounced` / `complained` states for any `resend_email_id` | High | Fail closed (401) when the secret is missing. Explicit compatibility opt-out: set var `resend_webhook_insecure = "true"` (not recommended). **Deployments without the secret will stop receiving delivery-status updates until it is set** (Resend dashboard → webhook signing secret → `wrangler secret put resend_webhook_secret`). |
| 2 | Webhook error path returned `e.message` to the caller | Low | generic `webhook processing failed`, detail only in server log |
| 3 | No replay/idempotency handling beyond the 5-minute timestamp window | Medium | signed `svix-id` stored in KV for 10 min (longer than the tolerance window); duplicates return 200 without re-applying. Best-effort (KV is not atomic). |
| 4 | Session record in KV (`auth-uid:<id>`) embedded the full user row **including password hash and salt**; `c.get('user')` carried it per request | Medium | `toSessionUser()` strips `password`/`salt` on login; existing sessions are scrubbed on their next request |
| 5 | Web-push endpoint (user-supplied) and outbound webhook URL (admin-supplied) were fetched with only a weak `https://` check; the push request carries a VAPID Authorization header | Medium | `utils/url-guard.js`: https only (webhook may be http), no credentials, no IP literals (dotted/decimal/hex/IPv6), no localhost/`.local`/`.internal`-style names, push endpoints restricted to port 443. Enforced on save **and** at send time. |
| 6 | `/setting/query` masked secrets but still revealed 12–20 leading characters of S3 secret, Mailjet secret, webhook secret, Telegram bot token | Low | reveal at most 4–8 characters |

Checked, no change needed: `/setting/websiteConfig` is a field whitelist (no secrets); no console logging of tokens/passwords/mail bodies found; Telegram error logs print the API response, not the request URL.

Tests: `webhook-security`, `url-guard`, `session-user` specs added; 138/138 pass locally.
Rollback: revert the commit. For item 1 alone, set `resend_webhook_insecure = "true"` to restore the old (insecure) behaviour without a redeploy of code.

## Batch 4 — account takeover hardening and device sessions

| # | Finding | Risk | Fix |
|---|---|---|---|
| 1 | `PUT /my/resetPassword` changed the password with **no current password** and left every other session alive: one stolen session/token = permanent account takeover | High | requires `currentPassword` (throttled like login, wrong attempts counted), then signs out all other devices; the current session stays. Frontend dialog now asks for the current password. **Older frontends that omit it get a 400.** |
| 2 | No way to see or revoke sessions | Medium | `GET /my/sessions` (id, ip, os/browser/device, created; never the token), `DELETE /my/sessions/:id`, `DELETE /my/sessions` (all other devices). Session id = truncated hash; an id from another user matches nothing. Settings page gets a "Sign out other devices" button. Sessions that predate this change are listed with empty metadata. |

Route audit of label/star/my/backup/email/openapi/setting APIs: all derive the user from the verified session, not from request parameters. Accepted/noted:
- `GET /my/directory` and `GET /my/avatar?email=` expose name/email/avatar of all active users to any logged-in user (needed for compose autocomplete). On a multi-tenant deployment that is a privacy trade-off; a per-role switch is backlog.
- Limits: sessions per user are still capped at ~11 (oldest evicted), 30-day token lifetime without server-side refresh.

Tests: `session-management.spec.js`; 142/142 worker tests pass; `vite build` of mail-vue succeeds. Pre-existing: `npm ci` in mail-vue fails on a peer-dependency conflict (`@vitejs/plugin-vue@5` vs vite 7/8) and needs `--legacy-peer-deps`.
Rollback: revert the commit; no schema change (`sessions` is an extra field in the existing KV session record, ignored by old code).

## Batch 5 — error handling, headers, maintenance endpoints, dependencies

| # | Finding | Risk | Fix |
|---|---|---|---|
| 1 | Global `onError` returned `err.message` for every exception: SQL/D1 text, provider response bodies (e.g. Firebase token exchange) and parser errors reached the client | Medium | only `BizError` messages are returned; other errors → `500 Internal server error` (details stay in server logs); malformed JSON → `400 Invalid request body`. Existing "KV/D1 not bound / schema out of date" admin hints are kept. |
| 2 | `/init` and `/reset-admin` (maintenance-secret endpoints) had no throttle; reset-admin accepted 6-char passwords | Medium | shared login throttle (10 bad tries / 15 min), min length 8 |
| 3 | API responses had no `nosniff` / `no-store`; the SPA had no clickjacking / referrer / transport headers | Medium | API: `X-Content-Type-Options`, `Referrer-Policy: no-referrer`, `Cache-Control: no-store` (default only; `/oss` keeps its own cache headers). SPA (`mail-vue/public/_headers`): `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, `Strict-Transport-Security: max-age=15552000` (no `includeSubDomains`, no preload). |
| 4 | CORS is `*` | Low (auth is a bearer header, no cookies) | optional pin: var `cors_origins = "https://a,https://b"`; unset keeps `*` so Electron/Android/PWA clients are unaffected |
| 5 | `pnpm audit --prod` (worker): 2 high — `sharp` (<0.35.5), `source-map-js` (<1.2.2), both transitive through `@cloudflare/vite-plugin`/miniflare (build/dev tooling, not in the Worker bundle). `npm audit` (vue): `source-map-js` | Low–Medium | overrides bumped (`sharp ^0.35.5`, `source-map-js ^1.2.2`), lock files regenerated; both audits now report 0 known vulnerabilities. Worker tests and `vite build` re-run green. |

Not done on purpose:
- **No enforced Content-Security-Policy for the SPA.** The app uses TinyMCE, Turnstile, Firebase and Element Plus inline styles; an enforced policy without a browser regression pass would risk breaking login/compose. Next step: ship `Content-Security-Policy-Report-Only` first, collect violations, then enforce. Mail HTML itself is already rendered through the inert DOMParser/sandbox path from earlier commits, and attachments are served with `sandbox` CSP.
- Reviewed per-user routes for forwarding, scheduled mail, templates, contacts: user id always comes from the session; admin forwarding routes assert admin inside the service.

Tests: `api-hardening.spec.js`; 147/147 worker tests pass.
Rollback: revert the commit. If the generic 500 message hides something needed for support, the full error is in the Worker log (observability is enabled).

## Batch 6 — D1 (first P1 pass; measured)

Method: `mail-worker/test/d1-bench.spec.js` builds the real schema (init chain + `migrations/*.sql`) on local D1, seeds 3000 mails (≈2300 in the benchmark inbox; one shared account holding ≈10 % of the table), records every statement the service issues and replays it with `EXPLAIN QUERY PLAN` and `meta.rows_read`. **These are local-D1 numbers on synthetic data — not production Rows Read.** Set `PRINT_REPORT = true` in the file to print the full report.

| Statement | Before | After |
|---|---|---|
| Inbox page 1, list rows | 21 rows read (index range scan, OK) | unchanged |
| Inbox page 1, `COUNT(*)` | 2316 rows read — grows with mailbox size | unchanged (page 1 only) |
| Inbox page 2+ (cursor), `COUNT(*)` | 2316 rows read **on every page** | **skipped** (`total: null`; client keeps page-1 total) |
| Shared-account list page (account = 10 % of table) | 198 rows read, plan `idx_email_type (type, rowid)` + per-row filter | **21 rows**, `idx_email_account_list` |
| Shared-account poll `latest` | plan `idx_email_type`, cost grows with the table share of *other* users' mail | `idx_email_account_list (account_id, type, is_del, email_id>?)`, 2 rows |
| Owner poll `latest`, nothing new | 2 rows | unchanged |

Changes:
1. `list()` no longer runs the COUNT for cursor pages; frontend only overwrites `total` when the server sends one (older cached clients just keep/hide the count line until the next refresh).
2. For single-account reads the access test `user_id = ? OR account_id IN (shared)` is replaced by the equivalent single predicate (shared account → whole account, otherwise own rows). The result set is identical — `d1-bench.spec.js` has authorization assertions (shared readable, foreign account empty, owner unaffected). The all-accounts view keeps the OR form.
3. New migration `0017_email_account_list_index.sql` (`idx_email_account_list`). **Apply it to D1 before/with the deploy** (same procedure as the other files in `migrations/`); without it the code is still correct, only the shared-account queries keep the old plan. Rollback: `DROP INDEX idx_email_account_list;`. Cost: one more index to maintain on every mail insert (≈ one extra row written per mail).

Not changed (decisions / backlog):
- `list()` still returns full `content`/`text` for each row; the reader opens mails from that payload, so dropping it needs a coordinated frontend change (lazy detail fetch via `/email/detail`). Rows-read is unaffected; this is response size / D1 CPU.
- All-accounts view for users *with* shared accounts still uses the OR form (plan not yet optimized); first-page COUNT remains O(mailbox).

Tests: 150/150 pass locally.

## Batch 7 — Cron / scheduled jobs (reliability + measured cost)

| # | Finding (reproduced by test first) | Impact | Fix |
|---|---|---|---|
| 1 | `purgeExpiredTrash` ran `DELETE … IN (<all expired ids>)`. D1 allows 100 bound parameters, so with **>100 expired trash mails the job throws `too many SQL variables`** | Trash was never purged once a backlog existed, and because the daily jobs ran sequentially the throw also **skipped `autoClean`, OAuth cleanup and the stats refresh** | purge in chunks of 90 (capped at 5000 mails per run, remainder next day), via `physicsDelete`; errors are caught and logged |
| 2 | `physicsDelete` had the same 100-parameter limit (user permanent delete / batch delete / auto-clean with >100 ids) and left orphan rows in `mail_label_email` and (for the purge path) `star` | failures on large selections; orphan rows | `physicsDelete` chunks internally and also removes label links |
| 3 | Daily cron: one failing job aborted all following jobs | missed cleanups | each job runs in its own try/catch and logs `daily cron job failed: <name>` |
| 4 | Stats refresh (`analysis_cache` enabled): one refresh reads ≈ 3 × (mail count) rows — measured **≈9 000 rows for 3 004 mails** (full-table aggregate + two 15-day charts + sender ranking) — and ran every 30 minutes | scales with mailbox size × 48/day × timezones | the 30-minute run first reads a 3-row fingerprint (`MAX(email_id)`, `MAX(user_id)`, `MAX(account_id)`) and skips when nothing new arrived; the daily 16:00 run always refreshes in full. Trade-off: deletions / status changes appear in the dashboard counters at the next daily refresh instead of ≤30 min. Only matters when `analysis_cache = true`; with it off the 30-min cron is a no-op. |

Measured and **left as is** (documented so it is not "optimized" later):
- The every-minute fallback (`processDue` for scheduled mail and forwarding retries) is index-bound: with 2 000 historical rows in each table, an empty poll reads **< 5 rows and writes 0** (asserted in `cron-jobs.spec.js`). The fallback stays, as required; it is not a meaningful D1 cost. The Durable Object alarm path and the cron claim use the same atomic `UPDATE … WHERE status='pending' … RETURNING`, so a mail cannot be sent twice by both.

Tests: `cron-jobs.spec.js` (5 cases), shared `test/helpers/full-schema.js`; 153/153 pass.
Rollback: revert the commit; no schema change. Note `purgeExpiredTrash` now also calls `ensureDeleteTime` (adds the `delete_time` column if an old DB lacks it).
Open: Durable Object / alarm usage metrics and cron success/latency statistics belong to the monitoring batch (P2).

## Batch 8 — KV / cache audit and public-endpoint D1 reads

KV call-site inventory (`grep kv.get|put|delete|list` over `src`, ~60 sites). Hot paths already had an isolate-local TTL cache from earlier work and were left alone: settings (60 s, plus per-request memo), session record (30 s), role permissions (120 s), schema probes (1 h). Findings in the rest:

| # | Finding | Fix |
|---|---|---|
| 1 | `GET /setting/websiteConfig` (public, hit by **every login-page visitor**) always ran `SELECT … FROM verify_record WHERE ip = ?` — a table scan (no index on `ip`) — although the result only matters in "COUNT" verify mode | query only when `registerVerify` or `addEmailVerify` is COUNT (value 2); new migration `0018_verify_record_ip_index.sql` for the COUNT-mode case |
| 2 | `/openapi/*` (API-key clients, typically polling) cost one D1 read for the key lookup, and — since batch 3 — one more for the owner status check on every call | key-hash → user id and owner status cached in the isolate for 30 s (same window as session revocation); only the hash is cached. Revoking/banning takes effect within 30 s per isolate |
| 3 | Batch 3 `/openapi` RBAC/ban checks had no end-to-end test | `openapi-rbac.spec.js`: unknown key 401, banned owner 401, no `email:send` → 403, no `email:delete` → 403, permitted owner passes auth |

KV cost of the new security features (so it is accounted for, not hidden):
- Login: +2 KV reads per login attempt (account and IP failure counters); +2 writes only on a **failed** attempt, +1 delete after a successful login that follows failures. Session list/revoke: 1 read (+1 write on revoke).
- Resend webhook: 1 read + 1 write (10-min TTL) per signed event for replay dedupe.
- Not changed: KV is still not used as the sole basis for any strict counter; the login throttle is explicitly best-effort and says so.

Not measured: real KV read/write counts need production analytics (`wrangler kv` / dashboard); the above is call-site analysis, not a measured saving.

Tests: 154 worker tests pass (+ `openapi-rbac.spec.js`).
Apply `migrations/0018_verify_record_ip_index.sql` with the usual migration procedure; rollback `DROP INDEX idx_verify_record_ip;`.

## Batch 9 — Workers AI: assistant security, quota, summary cache

Audit result for the AI surface (assistant tools, mail summary / reply / translate / compose, spam screening, tracker detection, code extraction):

Already in place (verified, unchanged): per-feature admin switches (`aiAssistantStatus`, `aiSpam`, `aiTrackerBlock`, `aiCode`); spam/tracker screening have per-task daily ceilings, a confidence threshold, own-domain/known-sender skips; translation has a per-user hash-keyed cache; email tools are ownership-scoped (`getOwned`, `searchOwned`, `attService.list(userId)`); `sendEmail`/`deleteEmail` are only reachable through `/ai-assistant/confirm` with server-stored arguments bound to the user id.

| # | Finding | Risk | Fix |
|---|---|---|---|
| 1 | The assistant called `c.env.ai.run` directly: **no daily quota, no usage record, no fallback model**; up to 8 model calls per request with a growing context, unlimited requests | High (cost abuse by any user with the feature on) | goes through `aiProviderService.run` (task `assistant`): admin `aiDailyQuota` applies, usage is recorded, fallback model works; if the admin set no quota a default of 200 model calls/user/day applies |
| 2 | The client sent the whole conversation and it was forwarded verbatim: crafted `system`/`tool` messages or `tool_calls` could be planted, and size was unbounded | Medium | `sanitizeHistory`: only plain `user`/`assistant` text; ≤30 messages, ≤8 000 chars each, ≤40 000 total |
| 3 | Prompt injection: mail bodies and attachment text reach the model as tool output with no framing | Medium | system prompt states tool output is untrusted third-party data and that only the user's own messages can request actions; `getEmail`/`getAttachmentText` results carry an explicit untrusted-content notice. Hard guarantee unchanged and unaffected by the model's behaviour: send/delete need the user's confirmation, with the actual recipient/arguments shown, executed from server-stored args. |
| 4 | Mail summary re-ran the model on every click, even for an unchanged mail | Cost | cached in KV for 7 days under `ai_summary:<userId>:<emailId>:<content hash>` — the key is user-scoped and ownership is checked first, so a cached summary is never served across users; changed content hashes differently |

Not done / limits (stated plainly):
- **Neuron consumption is not recorded.** Workers AI returns no per-call Neuron figure; `ai_usage` stores requests and an input-size estimate only. Real Neurons must come from the Cloudflare dashboard/GraphQL analytics.
- Prompt-injection resistance of the *model* cannot be guaranteed by prompts; the protection that holds is structural (ownership scoping + mandatory confirmation + quotas). The confirm step is not strictly single-use under a concurrent double click (KV get-then-delete is not atomic); moving it to an atomic D1 claim is backlog.
- Pending confirmations keep the conversation (which can include mail text) in KV for 5 minutes.
- No MCP server exists in this repository; the external HTTP API (`/openapi`) is covered by the RBAC checks from batch 3.
- Reply suggestion and compose-transform are user-triggered and intentionally not cached.

Tests: `ai-assistant-security.spec.js` (history sanitising, quota enforcement, held confirmation, cross-user confirm refused), `ai-summary-cache.spec.js`; 165/165 pass.
Rollback: revert the commit. To raise/lower the assistant ceiling set the admin AI daily quota; no schema change.

## Batch 10 — Attachments / R2 lifecycle

Attachment objects are content-addressed (`attachments/<hash16><ext>`) and shared by every row with the same content, so deletion needs a correct reference test. Findings (all covered by `attachment-lifecycle.spec.js`; the loss/leak cases were verified to fail when the fix is removed):

| # | Finding | Impact | Fix |
|---|---|---|---|
| 1 | "Is the object still referenced?" was `GROUP BY key HAVING COUNT(*) = 1` over the **whole attachments table, once per deleted mail** | rows read = table size × mails deleted (50 mails × 100 k attachments ≈ 5 M rows); `attachments.key` had no index | rewritten: `SELECT DISTINCT key … WHERE email_id = ?` (indexed) + one `key IN (…)` re-check per 90 keys; new migration `0019_attachments_key_index.sql` (`idx_attachments_key`). Measured on 3 000 rows: both lookups read < 10 rows. |
| 2 | An object attached twice to the same mail was never deleted (count = 2 for both rows) | storage leak | handled by the new logic |
| 3 | Object deletion was decided before the rows were gone and not re-checked: a mail arriving with the same content in between could end up with a row pointing at a deleted object | **data loss window** (small) | the candidate keys are re-checked against the table immediately before storage deletion; test injects a new reference between DELETE and the storage delete |
| 4 | Every inbound/outbound attachment was uploaded even if byte-identical content with identical headers was already stored | R2 Class A PUT per duplicate | R2 mode only: if the key is already referenced in D1 → HEAD (Class B); skip the PUT only when contentType, contentDisposition and cacheControl match, so downloads behave exactly as before. New content costs no extra operation. After the rows are inserted the object is HEAD-verified again and re-uploaded if it vanished (closes the race with a concurrent delete). Net per duplicate: 1 PUT → 2 HEAD. **Not measured on production traffic** — the saving depends on your duplicate rate (e.g. repeated newsletter logos), unique files cost nothing extra. |
| 5 | Sent attachments: rows were inserted before the object was uploaded (a failed upload left a row without an object) | broken attachment link | upload → insert rows → verify |
| 6 | No way to find orphaned objects | storage growth | `GET /setting/storageAudit?cursor=&limit=` (permission `setting:query`): lists one page of stored objects and reports those no row references. **Read-only — it never deletes.** R2 and KV storage; S3 reports "unsupported". Deleting orphans stays a manual, reviewed step (R2/KV have no trash, so there is no undo); the list is the audit trail. |

Also: `removeAttByField` now whitelists the column name (`email_id`/`user_id`/`account_id`).

Not done / backlog:
- Dangling rows (row exists, object missing) are not scanned; it needs a HEAD per key.
- No automatic orphan deletion and no R2 object lifecycle rules were configured; retention periods are unchanged.
- Embedded compose images (`saveArticleAtt`) still upload without dedupe (rare path).
- Signed, expiring download URLs for attachments remain a frontend-coordinated item.

Tests: 176/176 pass. Apply `migrations/0019_attachments_key_index.sql` (rollback: `DROP INDEX idx_attachments_key;`). Without it the code is correct but the re-check scans the table once per 90 keys instead of using the index.

## Batch 11 — Static asset routing (Workers requests) and sync polling review

### Static assets: `run_worker_first = true` → path list

Before: every request (each JS/CSS/font/icon/manifest/service-worker file) invoked the Worker only to forward to `env.assets.fetch`. `src/index.js` itself only handles three prefixes: `/api/`, `/attachments/`, `/static/`.

Change (all four configs: `wrangler.toml`, `wrangler-action.toml`, `wrangler-dev.toml`, `wrangler-test.toml`):
`run_worker_first = ["/api/*", "/attachments/*", "/static/*"]` — everything else is answered by Static Assets directly (no Worker invocation; Static Assets requests are not billed as Worker requests).

Measured locally with `wrangler dev` (4.125.0) against the real built `mail-vue/dist`, counting root spans in the local observability store for the same 9 requests
(`/`, one hashed JS asset, a deep SPA route, `favicon.svg`, `manifest.webmanifest`, `psg-mail-sw.js`, `/attachments/nope.png`, `/static/nope`, `/api/setting/websiteConfig`):

| Config | Worker invocations | Responses |
|---|---|---|
| `run_worker_first = true` | 9 | identical statuses/content types |
| `run_worker_first = [...]` | **3** (the `/api`, `/attachments`, `/static` requests) | identical; deep link `/inbox/some/spa/route` still returns `index.html` (SPA fallback), `_headers` rules still parsed |

This shows the routing effect on a local run; the production saving depends on how many static files each page load fetches and on cache hit rates — **not measured on Cloudflare**. Auth is unaffected: API, private attachments and stored objects still go through the Worker; no authenticated or private route is served by Static Assets.

Guard: `test/static-routing.spec.js` fails if `src/index.js` starts handling a new path prefix that is not in every wrangler config's list (otherwise that path would silently fall through to the SPA), or if a config goes back to `true`.

**Verify in your test environment before production** (as required): deploy with `wrangler-test.toml`, then check login, deep-link refresh (`/settings`, `/label/1`), PWA install/update, avatar/background image, inline mail images (`/api/oss/...`), attachment download. Rollback: set `run_worker_first = true` again (config only, no data impact).

### Service worker / PWA
`psg-mail-sw.js` only precaches the build manifest (`globPatterns: []`, i.e. nothing) and has no runtime caching route: API responses and private attachments are never stored by the service worker. Hashed `/assets/*` are `immutable` via `_headers`. No change.

### Sync polling (`mail-sync-service.js`) — reviewed, deliberately not changed
Already present: one poller per app with a cross-tab `localStorage` lease, in-flight request sharing, 30 s minimum gap, cursor + de-dupe shared between push and poll, hidden tabs do not poll (they catch up on visibility), immediate catch-up on `online`/`focus`/`visibility`, cursor reset on account switch, polling stops on 401/403. An idle poll costs one Worker call and ~2 D1 rows (measured in batch 6).
Not changed: the 30 s floor was set after a mail-sync incident and applies to Electron (no push). Lengthening it needs push-delivery data we do not have here. **Candidate experiment (no code change needed):** raise the admin setting `autoRefresh` to 60 in the test environment and compare Worker request counts and missed-push catch-up latency; the 60 s / 180–300 s figures from the brief remain candidates until measured.

Tests: 181 worker tests pass (+5 routing).

## Batch 12 — Operations / security monitoring (P2)

Design constraint from the brief: the monitoring must not add noticeable Cloudflare usage and must never hold secrets or personal data.

**Mechanism** (`src/service/ops-metrics.js`, migration `0020_ops_metric.sql`): events are counted in memory per Worker instance and written as one small batch (`INSERT … ON CONFLICT DO UPDATE`) at most once a minute per instance, after the response (`waitUntil`), into `ops_metric(day, metric, count, total_ms, max_ms)`. One row per UTC day and metric, no per-event rows, 60-day retention (purged by the daily cron). Measured in `ops-metrics.spec.js`: 502 events → 2 rows written; a flood cannot write more than the number of distinct metrics (hard cap 64 names) per minute per instance. Idle minutes write nothing (the per-minute cron records only outcomes worth looking at).

**What is recorded** (names only, no ids / IPs / addresses / mail content; asserted by a test that greps the stored rows):

| Area | Metrics |
|---|---|
| Authentication | `auth.login_failed`, `auth.login_throttled`, `auth.session_invalid`, `auth.api_key_rejected`, `auth.public_token_rejected` |
| Authorization | `authz.denied` (role-permission 403, JWT and API-key routes) |
| Webhooks | `webhook.invalid_signature`, `webhook.rejected_no_secret`, `webhook.replay_ignored`, `webhook.error` |
| Mail | `mail.scheduled_sent`, `mail.scheduled_failed`, `mail.scheduled_retry` |
| Storage | `storage.oss_blocked` (blocked `/oss` key probes), `storage.object_delete_failed` |
| AI | `ai.request.<task>`, `ai.quota_denied`, `ai.error` |
| Cache | `cache.hit`, `cache.miss` (isolate-local KV cache; shows how often a KV read was avoided) |
| Cron | `cron.minute.scheduled_processed` (+duration), `cron.minute.*_error`, `cron.daily.<job>` (count + avg/max ms), `cron.daily.<job>_error`, `cron.stats_refresh` |

**Admin read API** (requires the `setting:query` permission; verified end-to-end through the real middleware in `admin-endpoints.spec.js`: 403 without it, 401 with a bad token, 200 for the admin):
`GET /setting/opsMetrics?days=7` → daily metric rows plus live gauges: storage type, scheduled-mail backlog by status (indexed), failed forwarding deliveries, today's AI requests per task. Also available: `GET /setting/storageAudit` (orphan report, batch 10) and `GET /setting/providerUsage`.

Behaviour notes:
- Counts are **approximate** (an instance recycled before its flush loses under a minute); the API response says so. They are for trend and alerting, not billing.
- The per-minute cron still fails the invocation when a job throws (Cloudflare's cron error status is preserved); it now also records the error first.
- No frontend page was added; the endpoint returns JSON for an admin or a dashboard script.

**Not available from inside the Worker (use Cloudflare analytics instead):** Workers request count and CPU time, D1 rows read/written and per-query latency, KV operation counts, R2 Class A/B operations and stored bytes, Durable Object requests/duration, actual Workers AI Neurons. The brief's requirement for those is met by the dashboard / GraphQL Analytics API; the numbers in this log that come from local D1 runs (batches 6, 7, 10, 11) are method demonstrations on synthetic data, not production savings.

Tests: 187 pass (+ops-metrics, admin-endpoints). Apply `migrations/0020_ops_metric.sql`; rollback `DROP TABLE ops_metric;` (the app tolerates the table being absent).
