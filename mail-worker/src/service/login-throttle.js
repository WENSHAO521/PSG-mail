import { bump } from './ops-metrics';
import BizError from '../error/biz-error';
import KvConst from '../const/kv-const';
import reqUtils from '../utils/req-utils';
import { t } from '../i18n/i18n.js';

const LOGIN_FAIL_WINDOW_SECONDS = 15 * 60;
const LOGIN_ACCOUNT_LIMIT = 10;
const LOGIN_IP_LIMIT = 40;

// Best-effort brute-force throttle. KV is not atomic, so concurrent attempts can
// slip a few extra tries through; it bounds sustained guessing, it is not a lock.
export async function loginThrottleKeys(c, email) {
	const ip = reqUtils.getIp(c) || 'unknown';
	return {
		acct: `${KvConst.LOGIN_FAIL_ACCOUNT}${String(email).toLowerCase()}`,
		ip: `${KvConst.LOGIN_FAIL_IP}${ip}`
	};
}

// /init and /reset-admin: the "account" counter is per source IP, never a shared constant -
// otherwise anyone could lock the deployment/recovery endpoints for everybody by failing ten times.
export async function maintenanceThrottleKeys(c) {
	const ip = reqUtils.getIp(c) || 'unknown';
	return loginThrottleKeys(c, 'maintenance:' + ip);
}

export async function assertLoginAllowed(c, keys) {
	const [acct, ip] = await Promise.all([c.env.kv.get(keys.acct), c.env.kv.get(keys.ip)]);
	if (Number(acct || 0) >= LOGIN_ACCOUNT_LIMIT || Number(ip || 0) >= LOGIN_IP_LIMIT) {
		bump('auth.login_throttled');
		throw new BizError(t('loginRateLimit'), 429);
	}
	return { acct: Number(acct || 0), ip: Number(ip || 0) };
}

export async function recordLoginFailure(c, keys, counts) {
	bump('auth.login_failed');
	await Promise.all([
		c.env.kv.put(keys.acct, String(counts.acct + 1), { expirationTtl: LOGIN_FAIL_WINDOW_SECONDS }),
		c.env.kv.put(keys.ip, String(counts.ip + 1), { expirationTtl: LOGIN_FAIL_WINDOW_SECONDS })
	]);
	console.warn('login failure', JSON.stringify({ ip: reqUtils.getIp(c), acctFails: counts.acct + 1, ipFails: counts.ip + 1 }));
}

