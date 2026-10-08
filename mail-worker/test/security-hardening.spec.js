// Hardening for served objects, mail previews and webhook signatures.
import { describe, it, expect } from 'vitest';
import { safeObjectResponse } from '../src/utils/safe-object-response';
import { verifySvix } from '../src/utils/svix-verify';
import emailHtmlTemplate from '../src/template/email-html';

describe('safeObjectResponse', () => {
	it('never serves active content inline', () => {
		for (const type of ['text/html', 'image/svg+xml', 'application/xhtml+xml', 'text/xml']) {
			const res = safeObjectResponse(new Response('<script>1</script>', {
				headers: { 'Content-Type': type, 'Content-Disposition': 'inline;filename=a' },
			}));
			expect(res.headers.get('Content-Type')).toBe('application/octet-stream');
			expect(res.headers.get('Content-Disposition')).toMatch(/^attachment/);
			expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
			expect(res.headers.get('Content-Security-Policy')).toContain('sandbox');
		}
	});

	it('keeps a sanitized filename when forcing a download', () => {
		const res = safeObjectResponse(new Response('x', {
			headers: { 'Content-Type': 'application/zip', 'Content-Disposition': 'attachment;filename="report 1.zip"' },
		}));
		expect(res.headers.get('Content-Disposition')).toBe(`attachment; filename="report 1.zip"; filename*=UTF-8''report%201.zip`);
	});

	it('decodes the extended filename* form and prefers it', () => {
		const res = safeObjectResponse(new Response('x', {
			headers: { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="cafe.zip"; filename*=UTF-8''caf%C3%A9.zip` },
		}));
		const cd = res.headers.get('Content-Disposition');
		expect(cd).toContain(`filename*=UTF-8''caf%C3%A9.zip`);
		expect(cd).toMatch(/^attachment/);
	});

	it('accepts a language tag and encodes RFC 5987 delimiters', () => {
		const res = safeObjectResponse(new Response('x', {
			headers: { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename*=UTF-8'en'r%C3%A9sum%C3%A9%20(1).zip` },
		}));
		expect(res.headers.get('Content-Disposition')).toContain(`filename*=UTF-8''r%C3%A9sum%C3%A9%20%281%29.zip`);
	});

	it('keeps plain images inline', () => {
		const res = safeObjectResponse(new Response('x', {
			headers: { 'Content-Type': 'image/png', 'Content-Disposition': 'inline;filename="a.png"' },
		}));
		expect(res.headers.get('Content-Type')).toBe('image/png');
		expect(res.headers.get('Content-Disposition')).toContain('inline');
	});

	it('wraps R2-style objects too', () => {
		const res = safeObjectResponse({ body: 'x', httpMetadata: { contentType: 'text/html' } });
		expect(res.headers.get('Content-Type')).toBe('application/octet-stream');
	});
});

describe('emailHtmlTemplate', () => {
	it('strips event handlers, javascript: urls and frames', () => {
		const out = emailHtmlTemplate('<img src=x onerror="alert(1)"><a href="java\nscript:alert(1)">a</a><iframe src="//e"></iframe>', 'd.example');
		expect(out).not.toMatch(/onerror/i);
		expect(out).not.toMatch(/javascript:/i);
		expect(out).not.toMatch(/iframe/i);
	});

	it('strips markup delimiters from the body style before it reaches <style>', () => {
		// The style is extracted by the page script at runtime, so check the script.
		const out = emailHtmlTemplate('<p>hi</p>', 'd.example');
		expect(out).toContain("bodyStyleMatch[1].replace(/[<>]/g, '')");
	});
});

describe('verifySvix', () => {
	it('accepts a valid signature and rejects tampering', async () => {
		const secretBytes = crypto.getRandomValues(new Uint8Array(24));
		const secret = 'whsec_' + btoa(String.fromCharCode(...secretBytes));
		const body = '{"type":"email.delivered"}';
		const ts = String(Math.floor(Date.now() / 1000));
		const key = await crypto.subtle.importKey('raw', secretBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
		const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`msg_1.${ts}.${body}`)));
		const headers = new Headers({ 'svix-id': 'msg_1', 'svix-timestamp': ts, 'svix-signature': 'v1,' + btoa(String.fromCharCode(...sig)) });

		expect(await verifySvix(secret, headers, body)).toBe(true);
		expect(await verifySvix(secret, headers, body + ' ')).toBe(false);
		expect(await verifySvix(secret, new Headers(), body)).toBe(false);
	});
});
