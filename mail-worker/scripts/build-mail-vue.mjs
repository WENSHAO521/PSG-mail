import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const workerRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vueRoot = path.resolve(workerRoot, '../mail-vue');
const releaseEnvFile = path.join(vueRoot, '.env.release.local');
const viteVariableNames = [
	'VITE_WEB_PUSH_VAPID_PUBLIC_KEY',
	'VITE_FIREBASE_API_KEY',
	'VITE_FIREBASE_AUTH_DOMAIN',
	'VITE_FIREBASE_PROJECT_ID',
	'VITE_FIREBASE_STORAGE_BUCKET',
	'VITE_FIREBASE_MESSAGING_SENDER_ID',
	'VITE_FIREBASE_APP_ID',
	'VITE_FIREBASE_VAPID_KEY',
];

function run(command, args, env, shell = process.platform === 'win32') {
	const result = spawnSync(command, args, {
		cwd: workerRoot,
		env,
		stdio: 'inherit',
		shell,
	});
	if (result.error) throw result.error;
	if (result.status !== 0) {
		const error = new Error(`${command} exited with status ${result.status || 1}`);
		error.exitCode = result.status || 1;
		throw error;
	}
}

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const buildEnv = {
	...process.env,
	NODE_ENV: 'development',
	ELECTRON_SKIP_BINARY_DOWNLOAD: '1',
};
const envLines = viteVariableNames
	.filter(name => buildEnv[name])
	.map(name => `${name}=${buildEnv[name]}`);
const hadReleaseEnvFile = existsSync(releaseEnvFile);
const previousReleaseEnv = hadReleaseEnvFile ? readFileSync(releaseEnvFile) : null;
let buildError;

try {
	// Vite's loadEnv reads the release files from disk. Copy CI build variables
	// into the local release override so Workers Builds and local Wrangler
	// deploys produce the same frontend bundle.
	if (envLines.length > 0) writeFileSync(releaseEnvFile, `${envLines.join('\n')}\n`, 'utf8');

	run(npmCommand, ['--prefix', vueRoot, 'ci', '--legacy-peer-deps'], buildEnv);
	run(npmCommand, ['--prefix', vueRoot, 'run', 'build'], buildEnv);
	run(process.execPath, ['scripts/check-built-web-push-env.mjs'], buildEnv, false);
} catch (error) {
	buildError = error;
} finally {
	if (hadReleaseEnvFile) {
		writeFileSync(releaseEnvFile, previousReleaseEnv);
	} else if (existsSync(releaseEnvFile)) {
		rmSync(releaseEnvFile, { force: true });
	}
}

if (buildError) {
	console.error(`Frontend build failed: ${buildError.message}`);
	process.exitCode = buildError.exitCode || 1;
}
