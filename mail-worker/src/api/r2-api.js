import r2Service from '../service/r2-service';
import app from '../hono/hono';
import { safeObjectResponse } from '../utils/safe-object-response';

app.get('/oss/*', async (c) => {
	const key = c.req.path.split('/oss/')[1];
	const obj = await r2Service.getObj(c, key);

	if (!obj) {
		return c.text('Not Found', 404);
	}

	return safeObjectResponse(obj);
});
