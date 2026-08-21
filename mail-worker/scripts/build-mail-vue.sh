#!/bin/sh
# Builds mail-vue for production with an explicit, ephemeral
# .env.release.local so Vite's loadEnv() (mail-vue/vite.config.js) is
# guaranteed to pick up the VITE_FIREBASE_* values this [build] subprocess
# actually has (already confirmed present by check-vite-env.sh), instead of
# relying on Vite to see process.env implicitly. Runs from the mail-worker
# cwd — the same subprocess wrangler-action.toml's [build] command chain
# runs in — right after check-vite-env.sh and before wrangler packages
# ./dist for deploy.
#
# .env.release.local is covered by mail-vue/.gitignore's `*.local` and is
# never committed; it exists only for the duration of this script (trap
# below removes it on both success and failure).
set -eu
umask 077

ENV_FILE="../mail-vue/.env.release.local"
trap 'rm -f "$ENV_FILE"' EXIT

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
  echo "❌ build-mail-vue.sh: missing required env var(s):$missing"
  exit 1
fi

printf '%s\n' \
  "VITE_FIREBASE_API_KEY=$VITE_FIREBASE_API_KEY" \
  "VITE_FIREBASE_AUTH_DOMAIN=$VITE_FIREBASE_AUTH_DOMAIN" \
  "VITE_FIREBASE_PROJECT_ID=$VITE_FIREBASE_PROJECT_ID" \
  "VITE_FIREBASE_STORAGE_BUCKET=$VITE_FIREBASE_STORAGE_BUCKET" \
  "VITE_FIREBASE_MESSAGING_SENDER_ID=$VITE_FIREBASE_MESSAGING_SENDER_ID" \
  "VITE_FIREBASE_APP_ID=$VITE_FIREBASE_APP_ID" \
  "VITE_FIREBASE_VAPID_KEY=$VITE_FIREBASE_VAPID_KEY" \
  > "$ENV_FILE"

npm --prefix ../mail-vue run build

# Proves the values actually reached the built bundle (mail-worker/dist,
# the directory wrangler-action.toml's [assets] deploys) — not just that
# the [build] subprocess env had them or that .env.release.local was
# written. See check-built-firebase-env.mjs.
node ./scripts/check-built-firebase-env.mjs
