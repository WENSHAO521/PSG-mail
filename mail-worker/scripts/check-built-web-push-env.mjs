#!/usr/bin/env node
// Post-build proof that VITE_WEB_PUSH_VAPID_PUBLIC_KEY actually made it into
// the production bundle — the exact directory mail-worker/wrangler-action.toml's
// [assets] deploys (mail-worker/dist, not mail-vue/dist) — instead of just
// trusting that the [build] subprocess's env had it (check-vite-env.sh) or
// that .env.release.local was written (build-mail-vue.sh, which runs this
// script right after `npm run build`).
//
// Optional, like the var itself: if VITE_WEB_PUSH_VAPID_PUBLIC_KEY isn't set
// at all, standards Web Push is meant to stay disabled for this build (same
// graceful-degradation behavior as every other optional integration in this
// app) — this script only fails when the var WAS set but somehow didn't
// reach the bundle, which would mean the build silently shipped a broken
// push config. Never logs the value itself, only whether it's present.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DIST_DIR = './dist';
const VAR_NAME = 'VITE_WEB_PUSH_VAPID_PUBLIC_KEY';

const expected = process.env[VAR_NAME];
if (!expected) {
  console.log(`ℹ️  ${VAR_NAME} not set — standards Web Push is disabled for this build, nothing to verify.`);
  process.exit(0);
}

function listJsFiles(dir) {
  let files = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return files;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      files = files.concat(listJsFiles(full));
    } else if (entry.endsWith('.js')) {
      files.push(full);
    }
  }
  return files;
}

const jsFiles = listJsFiles(DIST_DIR);
if (jsFiles.length === 0) {
  console.error(`❌ production bundle missing field: no built .js files found in ${DIST_DIR}`);
  process.exit(1);
}

const found = jsFiles.some((f) => readFileSync(f, 'utf8').includes(expected));
if (!found) {
  console.error(`❌ production bundle missing field: ${VAR_NAME}`);
  process.exit(1);
}

console.log(`✅ ${VAR_NAME} present in production bundle — standards Web Push enabled.`);
