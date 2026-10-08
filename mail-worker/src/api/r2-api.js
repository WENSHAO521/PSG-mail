import r2Service from '../service/r2-service';
import app from '../hono/hono';
import constant from '../const/constant';
import { safeObjectResponse } from '../utils/safe-object-response';

// /oss is unauthenticated (inline images cannot send an Authorization header),
// so it may only reach keys the app itself writes as objects. In KV storage mode
// the object store IS the KV namespace: without this allowlist /oss/auth-uid:<id>
// would return session records and /oss/public_key: the public API token.
const PUBLIC_OBJECT_PREFIXES = [constant.ATTACHMENT_PREFIX, constant.BACKGROUND_PREFIX];

function toPublicObjectKey(path) {
	const raw = path.slice(path.indexOf('/oss/') + '/oss/'.length);
	let key;
	try {
		key = decodeURIComponent(raw);
	} catch {
		return null;
	}
	if (key.includes('..') || key.includes('\\') || key.includes('\0') || key.includes('//')) return null;
	return PUBLIC_OBJECT_PREFIXES.some(prefix => key.startsWith(prefix) && key.length > prefix.length) ? key : null;
}

app.get('/oss/*', async (c) => {
	const key = toPublicObjectKey(c.req.path);
	if (!key) {
		return c.text('Not Found', 404);
	}

	const obj = await r2Service.getObj(c, key);

	if (!obj) {
		return c.text('Not Found', 404);
	}

	return safeObjectResponse(obj);
});
