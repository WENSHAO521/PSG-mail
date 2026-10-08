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
