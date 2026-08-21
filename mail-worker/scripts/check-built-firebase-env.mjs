#!/usr/bin/env node
// Post-build proof that the Firebase web config actually made it into the
// production bundle — the exact directory mail-worker/wrangler-action.toml's
// [assets] deploys (mail-worker/dist, not mail-vue/dist) — instead of just
// trusting that the [build] subprocess's env had the values
// (check-vite-env.sh) or that .env.release.local was written
// (build-mail-vue.sh, which runs this script right after `npm run build`).
//
// Presence-only: compares each required VITE_FIREBASE_* value against the
// built .js output via plain substring search. Never logs a value, only
// which variable NAME is missing.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DIST_DIR = './dist';

const REQUIRED_FIELDS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
  'VITE_FIREBASE_VAPID_KEY',
];

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

const missingEnv = REQUIRED_FIELDS.filter((name) => !process.env[name]);
if (missingEnv.length > 0) {
  for (const name of missingEnv) {
    console.error(`❌ production bundle missing field: ${name}`);
  }
  process.exit(1);
}

const jsFiles = listJsFiles(DIST_DIR);
if (jsFiles.length === 0) {
  console.error(`❌ production bundle missing field: no built .js files found in ${DIST_DIR}`);
  process.exit(1);
}

const contents = jsFiles.map((f) => readFileSync(f, 'utf8'));

const missingFields = REQUIRED_FIELDS.filter((name) => {
  const expected = process.env[name];
  return !contents.some((text) => text.includes(expected));
});

if (missingFields.length > 0) {
  for (const name of missingFields) {
    console.error(`❌ production bundle missing field: ${name}`);
  }
  process.exit(1);
}

console.log('✅ Firebase web config present in production bundle');
