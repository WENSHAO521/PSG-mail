#!/usr/bin/env node
// One-off VAPID (RFC 8292) keypair generator for standards Web Push. Uses
// node:crypto's webcrypto export — the exact same crypto.subtle surface the
// Worker runs at send time (see web-push-vapid-service.js) — so there is no
// format-translation risk between what this prints and what the Worker
// imports. Run once per deployment; re-running rotates the keypair, which
// invalidates every existing browser subscription (they'd need to
// re-subscribe under the new public key).
import { webcrypto } from 'node:crypto';

const { subtle } = webcrypto;

function base64UrlFromBytes(bytes) {
	let str = '';
	for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
	return Buffer.from(str, 'binary').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const keyPair = await subtle.generateKey(
	{ name: 'ECDSA', namedCurve: 'P-256' },
	true, // extractable — required to export both halves
	['sign', 'verify']
);

const rawPublic = new Uint8Array(await subtle.exportKey('raw', keyPair.publicKey)); // 65 bytes: 0x04 || X(32) || Y(32)
const jwkPrivate = await subtle.exportKey('jwk', keyPair.privateKey);

const publicKey = base64UrlFromBytes(rawPublic);
const privateKeyJwk = JSON.stringify(jwkPrivate);

console.log('VAPID keypair generated.\n');
console.log('VAPID_PUBLIC_KEY (also used as VITE_WEB_PUSH_VAPID_PUBLIC_KEY in the frontend build):');
console.log(publicKey, '\n');
console.log('VAPID_PRIVATE_KEY_JWK (Worker secret — paste the JSON string as-is):');
console.log(privateKeyJwk, '\n');
console.log('Set these against the Worker with:');
console.log('  cd mail-worker');
console.log('  npx wrangler secret put VAPID_PUBLIC_KEY          # paste the VAPID_PUBLIC_KEY value above');
console.log('  npx wrangler secret put VAPID_PRIVATE_KEY_JWK     # paste the JSON string above');
console.log('  npx wrangler secret put VAPID_SUBJECT              # e.g. mailto:you@example.com');
console.log('\nAnd set VITE_WEB_PUSH_VAPID_PUBLIC_KEY (same value as VAPID_PUBLIC_KEY) as a');
console.log('frontend build variable — see mail-vue/.env* / CI workflow env vars.');
