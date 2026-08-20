import app from '../hono/hono';
import { dbInit } from '../init/init';

// POST + Authorization: Bearer <jwt_secret> — not GET /init/:secret. A
// secret in the URL path can land in request/proxy/observability logs even
// over HTTPS; a header does not. There is no back-compat GET route kept
// here: this is an internal deploy-bootstrap endpoint with a single known
// caller (.github/workflows/deploy-cloudflare.yml), which has been updated
// to match — see dbInit.init() in ../init/init.js for the actual check.
app.post('/init', (c) => {
	return dbInit.init(c);
})
