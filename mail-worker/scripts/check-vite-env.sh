#!/bin/sh
# Presence-only preflight for the mail-vue production build, run from
# wrangler-action.toml's [build] command chain right before `npm run
# build`. It lives inside that exact same subprocess (not the outer GitHub
# Actions job shell), so this is direct proof — not an assumption — of
# which VITE_* vars actually reached wrangler's [build] command from the
# job-level env set in .github/workflows/deploy-cloudflare.yml. Never
# prints a value, only which variable NAME(s) are present/missing.
#
# Nothing here is hard-required. Standards Web Push
# (VITE_WEB_PUSH_VAPID_PUBLIC_KEY) and the legacy Firebase web SDK config
# (VITE_FIREBASE_*, dormant now that nothing imports mail-vue/src/firebase.js
# — see web-push.js's header for the migration-strategy note) both degrade
# gracefully when unset, the same way every other optional integration in
# this app does (OAuth providers, etc.) — this script only reports what
# reached the subprocess, so a misconfiguration surfaces here instead of as
# a silent runtime no-op days later.
set -e

if [ -n "${VITE_WEB_PUSH_VAPID_PUBLIC_KEY:-}" ]; then
  echo "✅ [build] subprocess sees VITE_WEB_PUSH_VAPID_PUBLIC_KEY — standards Web Push will be enabled."
else
  echo "::notice:: VITE_WEB_PUSH_VAPID_PUBLIC_KEY is not set — standards Web Push stays disabled in this build."
fi

missing=""
for v in VITE_FIREBASE_API_KEY VITE_FIREBASE_AUTH_DOMAIN VITE_FIREBASE_PROJECT_ID \
         VITE_FIREBASE_STORAGE_BUCKET VITE_FIREBASE_MESSAGING_SENDER_ID \
         VITE_FIREBASE_APP_ID VITE_FIREBASE_VAPID_KEY; do
  eval "val=\${$v:-}"
  if [ -z "$val" ]; then
    missing="$missing $v"
  fi
done
if [ -n "$missing" ]; then
  echo "::notice:: legacy VITE_FIREBASE_* var(s) not set (expected — dormant since firebase.js is unreferenced):$missing"
fi
