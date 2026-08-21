#!/bin/sh
# Builds mail-vue for production with an explicit, ephemeral
# .env.release.local so Vite's loadEnv() (mail-vue/vite.config.js) is
# guaranteed to pick up whichever VITE_* values this [build] subprocess
# actually has, instead of relying on Vite to see process.env implicitly.
# Runs from the mail-worker cwd — the same subprocess wrangler-action.toml's
# [build] command chain runs in — right after check-vite-env.sh and before
# wrangler packages ./dist for deploy.
#
# Both VITE_WEB_PUSH_VAPID_PUBLIC_KEY (standards Web Push) and the legacy
# VITE_FIREBASE_* vars (dormant, see web-push.js's header) are optional —
# see check-vite-env.sh. Whichever are set get written through; whichever
# aren't just leave that path disabled, same graceful-degradation behavior
# every other optional integration in this app already has.
#
# .env.release.local is covered by mail-vue/.gitignore's `*.local` and is
# never committed; it exists only for the duration of this script (trap
# below removes it on both success and failure).
set -eu
umask 077

ENV_FILE="../mail-vue/.env.release.local"
trap 'rm -f "$ENV_FILE"' EXIT

: > "$ENV_FILE"
for v in VITE_WEB_PUSH_VAPID_PUBLIC_KEY VITE_FIREBASE_API_KEY VITE_FIREBASE_AUTH_DOMAIN \
         VITE_FIREBASE_PROJECT_ID VITE_FIREBASE_STORAGE_BUCKET \
         VITE_FIREBASE_MESSAGING_SENDER_ID VITE_FIREBASE_APP_ID VITE_FIREBASE_VAPID_KEY; do
  eval "val=\${$v:-}"
  if [ -n "$val" ]; then
    printf '%s=%s\n' "$v" "$val" >> "$ENV_FILE"
  fi
done

npm --prefix ../mail-vue run build

# Proves whichever values were set actually reached the built bundle
# (mail-worker/dist, the directory wrangler-action.toml's [assets] deploys)
# — not just that this subprocess's env had them or that .env.release.local
# was written. See check-built-web-push-env.mjs.
node ./scripts/check-built-web-push-env.mjs
