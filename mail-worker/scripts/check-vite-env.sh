#!/bin/sh
# Presence-only preflight for the mail-vue production build, run from
# wrangler-action.toml's [build] command chain right before `npm run
# build`. It lives inside that exact same subprocess (not the outer GitHub
# Actions job shell), so a pass here is direct proof — not an assumption —
# that wrangler's [build] command actually inherited the job-level
# VITE_FIREBASE_* env vars set in .github/workflows/deploy-cloudflare.yml.
# Never prints a value, only which variable NAME(s) are missing.
set -e

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
  echo "❌ [build] subprocess is missing:$missing"
  echo "   (wrangler's [build] command did not receive these from the job env)"
  exit 1
fi

echo "✅ [build] subprocess sees all 7 VITE_FIREBASE_* variables."
