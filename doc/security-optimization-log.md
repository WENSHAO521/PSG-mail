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
