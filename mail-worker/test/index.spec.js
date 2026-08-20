// This used to be the vitest-pool-workers scaffold's placeholder test — it
// asserted on env.assets.fetch() serving a literal "Hello World!", which was
// never true of this app (assets serves the built mail-vue SPA) and the
// pool was pointed at a wrangler.jsonc that didn't exist in this repo, so it
// never actually ran. Replaced with a real smoke test of the API routing +
// auth chain. See test/mail-sync-regression.spec.js for the substantive
// new-mail-sync regression coverage.
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import worker from '../src';

describe('API routing + auth', () => {
	it('rejects an unauthenticated request to a protected route with 401, not a crash', async () => {
		const request = new Request('http://example.com/api/email/latest?emailId=0&accountId=1&allReceive=0');
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(200); // Hono's onError still returns 200 with a {code:401} body — see hono.js
		const body = await response.json();
		expect(body.code).toBe(401);
	});
});
