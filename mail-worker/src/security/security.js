import BizError from '../error/biz-error';
import constant from '../const/constant';
import jwtUtils from '../utils/jwt-utils';
import KvConst from '../const/kv-const';
import kvCache, { TTL } from '../cache/kv-cache';
import dayjs from 'dayjs';
import userService from '../service/user-service';
import permService from '../service/perm-service';
import { t } from '../i18n/i18n'
import app from '../hono/hono';
import externalApiKeyService from '../service/external-api-key-service';
import sessionService, { publicUser } from './session-service';
import timingSafeEqual from '../utils/secure-compare';

const exclude = [
	'/login',
	'/register',
	'/oss',
	'/setting/websiteConfig',
	'/webhooks',
	'/init',
	'/reset-admin',
	'/public/genToken',
	'/telegram',
	'/oauth',
	'/backup/oauth',
];

const requirePerms = [
	'/email/send',
	'/email/delete',
	'/account/list',
	'/account/delete',
	'/account/add',
	'/my/delete',
	'/analysis/echarts',
	'/role/add',
	'/role/list',
	'/role/delete',
	'/role/tree',
	'/role/set',
	'/role/setDefault',
	'/allEmail/list',
	'/allEmail/delete',
	'/allEmail/batchDelete',
	'/allEmail/latest',
	'/setting/setBackground',
	'/setting/deleteBackground',
	'/setting/set',
	'/setting/query',
	'/setting/setBlacklist',
	'/setting/providerUsage',
	'/setting/alibaba/testConnection',
	'/setting/alibaba/testNotification',
	'/user/delete',
	'/user/setPwd',
	'/user/setStatus',
	'/user/revokeSessions',
	'/user/setType',
	'/user/list',
	'/user/restore',
	'/user/resetSendCount',
	'/user/add',
	'/user/deleteAccount',
	'/user/allAccount',
	'/user/setName',
	'/regKey/add',
	'/regKey/list',
	'/regKey/delete',
	'/regKey/clearNotUse',
	'/regKey/history'
];

const premKey = {
	'email:delete': ['/email/delete'],
	'email:send': ['/email/send'],
	'account:add': ['/account/add'],
	'account:query': ['/account/list'],
	'account:delete': ['/account/delete'],
	'my:delete': ['/my/delete'],
	'role:add': ['/role/add'],
	'role:set': ['/role/set','/role/setDefault'],
	'role:query': ['/role/list', '/role/tree'],
	'role:delete': ['/role/delete'],
	'user:query': ['/user/list','/user/allAccount'],
	'user:add': ['/user/add'],
	'user:reset-send': ['/user/resetSendCount'],
	'user:set-pwd': ['/user/setPwd'],
	'user:set-status': ['/user/setStatus', '/user/restore', '/user/revokeSessions'],
	'user:set-type': ['/user/setType'],
	'user:delete': ['/user/delete','/user/deleteAccount'],
	'user:set-name': ['/user/setName'],
	'all-email:query': ['/allEmail/list','/allEmail/latest'],
	'all-email:delete': ['/allEmail/delete','/allEmail/batchDelete'],
	'setting:query': ['/setting/query', '/setting/providerUsage'],
	'setting:set': ['/setting/set', '/setting/setBackground','/setting/deleteBackground','/setting/setBlacklist','/setting/alibaba/testConnection','/setting/alibaba/testNotification'],
	'analysis:query': ['/analysis/echarts'],
	'reg-key:add': ['/regKey/add'],
	'reg-key:query': ['/regKey/list','/regKey/history'],
	'reg-key:delete': ['/regKey/delete','/regKey/clearNotUse'],
};

// Exact path or a whole-segment prefix: '/login' matches '/login' and
// '/login/changePassword' but NOT '/loginAnything'. 3.x used a bare
// startsWith(), so any future route merely sharing a prefix with an excluded
// one (e.g. '/testFoo', '/oauthAdmin') would have silently skipped auth.
export function matchesPrefix(path, prefix) {
	return path === prefix || path.startsWith(prefix + '/');
}

app.use('*', async (c, next) => {

	const path = c.req.path;

	if (exclude.some(item => matchesPrefix(path, item))) {
		return await next();
	}

	if (matchesPrefix(path, '/public')) {

		const userPublicToken = await c.env.kv.get(KvConst.PUBLIC_KEY);
		const publicToken = c.req.header(constant.TOKEN_HEADER);
		if (!userPublicToken || !publicToken || !timingSafeEqual(publicToken, userPublicToken)) {
			throw new BizError(t('publicTokenFail'), 401);
		}
		return await next();
	}

	if (matchesPrefix(path, '/openapi')) {

		const apiKey = c.req.header('X-Api-Key');
		const userId = apiKey ? await externalApiKeyService.verify(c, apiKey) : null;
		if (!userId) {
			throw new BizError(t('apiKeyInvalid'), 401);
		}
		c.set('user', { userId });
		return await next();
	}


	const jwt = c.req.header(constant.TOKEN_HEADER);

	const result = await jwtUtils.verifyToken(c, jwt);

	if (!result) {
		throw new BizError(t('authExpired'), 401);
	}

	const { userId, token } = result;
	const authInfo = await sessionService.read(c, userId);

	if (!sessionService.isValid(authInfo, token)) {
		throw new BizError(t('authExpired'), 401);
	}

	c.set('sessionId', token);

	const permIndex = requirePerms.findIndex(item => {
		return matchesPrefix(path, item);
	});

	if (permIndex > -1) {

		const permCacheKey = 'perm:' + userId
		let permKeys = kvCache.get(permCacheKey)
		if (!permKeys) {
			permKeys = await permService.userPermKeys(c, authInfo.user.userId)
			kvCache.set(permCacheKey, permKeys, TTL.PERM)
		}

		const userPaths = permKeyToPaths(permKeys);

		const userPermIndex = userPaths.findIndex(item => {
			return matchesPrefix(path, item);
		});

		if (userPermIndex === -1 && authInfo.user.email !== c.env.admin) {
			throw new BizError(t('unauthorized'), 403);
		}

	}

	const refreshTime = dayjs(authInfo.refreshTime).startOf('day');
	const nowTime = dayjs().startOf('day')

	if (!nowTime.isSame(refreshTime)) {
		authInfo.refreshTime = dayjs().toISOString();
		sessionService.touch(authInfo, token, c);
		// Drop credential fields from sessions created by 3.x.
		authInfo.user = publicUser(authInfo.user);
		await userService.updateUserInfo(c, authInfo.user.userId);
		await sessionService.write(c, userId, authInfo);
	}

	c.set('user', publicUser(authInfo.user))

	return await next();
});

function permKeyToPaths(permKeys) {

	const paths = [];

	for (const key of permKeys) {
		const routeList = premKey[key];
		if (routeList && Array.isArray(routeList)) {
			paths.push(...routeList);
		}
	}
	return paths;
}
