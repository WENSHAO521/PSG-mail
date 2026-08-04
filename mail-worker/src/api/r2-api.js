import r2Service from '../service/r2-service';
import app from '../hono/hono';

app.get('/oss/*', async (c) => {
	const key = c.req.path.split('/oss/')[1];
	const obj = await r2Service.getObj(c, key);

	if (!obj) {
		return c.text('Not Found', 404);
	}

	// KV/S3 backends already return a fully-formed Response (correct
	// Content-Type/Content-Disposition) — only R2ObjectBody needs wrapping.
	if (obj instanceof Response) {
		return obj;
	}

	return new Response(obj.body, {
		headers: {
			'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream',
			'Content-Disposition': obj.httpMetadata?.contentDisposition || null
		}
	});
});


