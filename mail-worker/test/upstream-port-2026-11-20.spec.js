// Fixes ported from the upstream review of 2026-11-20 (cloud-mail 0abdbc7 …
// 64f9d2c). The WebSocket push has its own spec (realtime.spec.js).
import { env, SELF } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import { setupFullSchema, makeCtx } from './helpers/full-schema';
import attService from '../src/service/att-service';
import { storedObjectMetadata } from '../src/utils/safe-object-response';

beforeAll(async () => {
	await setupFullSchema();
});

describe('storedObjectMetadata (53584f8)', () => {
	it('never stores active content as renderable', () => {
		for (const type of ['text/html', 'image/svg+xml', 'application/xhtml+xml', 'text/javascript', '']) {
			const meta = storedObjectMetadata({ contentType: type, filename: 'x', inline: true });
			expect(meta.contentType).toBe('application/octet-stream');
			expect(meta.contentDisposition.startsWith('attachment')).toBe(true);
		}
	});

	it('keeps passive images inline and other files as downloads', () => {
		expect(storedObjectMetadata({ contentType: 'image/png', filename: 'a.png', inline: true, cacheControl: 'max-age=1' }))
			.toEqual({ contentType: 'image/png', contentDisposition: 'inline;filename="a.png"', cacheControl: 'max-age=1' });
		expect(storedObjectMetadata({ contentType: 'image/png', filename: 'a.png' }).contentDisposition).toBe('attachment;filename="a.png"');
		expect(storedObjectMetadata({ contentType: 'application/zip', filename: 'a.zip', inline: true }).contentDisposition).toBe('attachment;filename="a.zip"');
	});

	it('keeps sender filenames out of the header syntax', () => {
		const meta = storedObjectMetadata({ contentType: 'image/png', filename: 'a";b\r\n.png' });
		expect(meta.contentDisposition).toBe('attachment;filename="a__b__.png"');
	});
});

describe('relative attachment paths from the editor (28494e7)', () => {
	it('turns ../attachments/ images into cid parts', async () => {
		const before = await attService.toImageUrlHtml(makeCtx(), '<p><img src="https://elsewhere.test/a.png"></p>');
		expect(before.html).not.toContain('cid:');
		const c = makeCtx();
		for (const src of ['../attachments/abc.png', '../../attachments/abc.png', '/attachments/abc.png', '/api/oss/attachments/abc.png', 'attachments/abc.png']) {
			// (imageDataList drops parts whose stored object is missing, so
			// only the rewrite itself is checked here.)
			const { html } = await attService.toImageUrlHtml(c, `<p><img src="${src}"></p>`);
			expect(html).toContain('src="cid:');
		}
	});
});

describe('Telegram mail page CSP (649de72)', () => {
	it('sends a restrictive Content-Security-Policy', async () => {
		const res = await SELF.fetch('https://example.com/api/telegram/getEmail/not-a-token');
		const csp = res.headers.get('Content-Security-Policy');
		expect(res.status).toBe(200);
		expect(csp).toContain("default-src 'none'");
		expect(csp).toContain("connect-src 'none'");
	});
});
