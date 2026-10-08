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
