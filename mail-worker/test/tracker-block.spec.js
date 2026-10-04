// Mail tracker blocking (src/service/tracker-service.js). Workers AI is
// stubbed; ai_usage is the real quota table shape.
import { env } from 'cloudflare:test';
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { parseHTML } from 'linkedom';
import trackerService from '../src/service/tracker-service';

let aiReply = '';
let aiCalls = 0;
let aiPrompt = '';

function ctx({ withAi = true } = {}) {
	return {
		env: {
			...env,
			ai: withAi ? {
				run: async (_model, input) => {
					aiCalls++;
					aiPrompt = input.messages.map(m => m.content).join('\n');
					return { response: aiReply };
				},
			} : undefined,
		},
		get: key => (key === 'setting' ? { aiTrackerBlock: 0, aiDailyQuota: 0 } : undefined),
		set: () => {},
	};
}

function imgs(html) {
	return Array.from(parseHTML(html).document.querySelectorAll('img'));
}

beforeAll(async () => {
	await env.db.prepare(`CREATE TABLE IF NOT EXISTS ai_usage (
		id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, usage_date TEXT NOT NULL,
		task TEXT NOT NULL, input_units INTEGER NOT NULL DEFAULT 0, request_count INTEGER NOT NULL DEFAULT 0,
		updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id, usage_date, task)
	)`).run();
});

beforeEach(() => {
	aiReply = '';
	aiCalls = 0;
	aiPrompt = '';
});

describe('tracker blocking', () => {
	it('is on unless the admin turns it off', () => {
		expect(trackerService.enabled({ aiTrackerBlock: 0 })).toBe(true);
		expect(trackerService.enabled({ aiTrackerBlock: 1 })).toBe(false);
	});

	it('blocks known services, tiny and hidden images by rule, without AI', async () => {
		const html = `<p>Hi</p>
			<img src="https://example.us1.list-manage.com/track/open.php?u=abc&id=def&e=123">
			<img src="https://news.example.org/x.gif" width="1" height="1">
			<img src="https://news.example.org/y.gif" style="display:none">
			<img src="https://news.example.org/logo.png" width="200" alt="Logo">`;
		const out = await trackerService.scrub(ctx(), html, { userId: 1 });
		expect(aiCalls).toBe(0);
		expect(out.blocked).toBe(3);
		expect(out.vendors).toEqual(['Mailchimp']);
		const [mc, tiny, hidden, logo] = imgs(out.html);
		for (const img of [mc, tiny, hidden]) {
			expect(img.hasAttribute('src')).toBe(false);
			expect(img.hasAttribute('hidden')).toBe(true);
			expect(img.hasAttribute('data-psg-tracker')).toBe(true);
		}
		expect(mc.getAttribute('data-psg-tracker-src')).toContain('list-manage.com/track/open.php');
		expect(logo.getAttribute('src')).toBe('https://news.example.org/logo.png');
		expect(logo.hasAttribute('data-psg-tracker')).toBe(false);
	});

	it('keeps content images whose path only resembles a tracker', async () => {
		const html = ['/pixelart/hero.png', '/beacon-hill-photo.jpg', '/static/beacons/banner.jpg', '/open/hero.png']
			.map(p => `<img src="https://cdn.example.org${p}">`).join('');
		const out = await trackerService.scrub(ctx(), html, { userId: 1 });
		expect(out.blocked).toBe(0);
		expect(out.html).toBe(html);
		expect(aiCalls).toBe(0);
	});

	it('leaves mail without trackers untouched', async () => {
		const html = '<div><img src="https://cdn.example.org/banner.jpg" width="600"><a href="https://example.org/">site</a></div>';
		const out = await trackerService.scrub(ctx(), html, { userId: 1 });
		expect(out.html).toBe(html);
		expect(out.blocked).toBe(0);
		expect(aiCalls).toBe(0);
	});

	it('asks the AI about opaque-token images and blocks only confident verdicts', async () => {
		aiReply = JSON.stringify({ items: [
			{ i: 0, tracker: true, confidence: 0.95 },
			{ i: 1, tracker: true, confidence: 0.5 },
		] });
		const html = `
			<img src="https://em.shop.example/e/a9F3kQ2xLm8Zp7Rt4Vb1Nc6Hy0Wd5Ue">
			<img src="https://img.shop.example/p/7f3c2a9e1b8d4c6f0a2e5b7d9c1f3a8e.jpg">`;
		const out = await trackerService.scrub(ctx(), html, { userId: 7 });
		expect(aiCalls).toBe(1);
		expect(aiPrompt).toContain('em.shop.example');
		expect(out.blocked).toBe(1);
		expect(out.ai).toBe(true);
		const [beacon, photo] = imgs(out.html);
		expect(beacon.hasAttribute('src')).toBe(false);
		expect(photo.getAttribute('src')).toContain('img.shop.example');

		const usage = await env.db.prepare(
			`SELECT request_count FROM ai_usage WHERE user_id = 7 AND task = 'tracker_detection'`
		).first();
		expect(usage?.request_count).toBe(1);
	});

	it('falls back to rules when the AI fails or is unavailable', async () => {
		const html = `
			<img src="https://em.shop.example/e/a9F3kQ2xLm8Zp7Rt4Vb1Nc6Hy0Wd5Ue">
			<img src="https://t.example.net/open.gif?id=1">`;
		const failing = ctx();
		failing.env.ai = { run: async () => { throw new Error('down'); } };
		const out = await trackerService.scrub(failing, html, { userId: 1 });
		expect(out.blocked).toBe(1);
		const [candidate, pixel] = imgs(out.html);
		expect(candidate.hasAttribute('src')).toBe(true);
		expect(pixel.hasAttribute('src')).toBe(false);

		const noAi = await trackerService.scrub(ctx({ withAi: false }), html, { userId: 1 });
		expect(noAi.blocked).toBe(1);
	});

	it('blocks images carrying the recipient address or its hash, without AI', async () => {
		const to = 'Reader@Example.org';
		const bytes = new TextEncoder().encode(to.toLowerCase());
		const hex = async alg => [...new Uint8Array(await crypto.subtle.digest(alg, bytes))]
			.map(b => b.toString(16).padStart(2, '0')).join('');
		const b64 = btoa(to.toLowerCase()).replace(/=+$/, '');
		const html = [
			`https://img.news.example/h/${await hex('MD5')}.png`,
			`https://img.news.example/h/${(await hex('SHA-256')).toUpperCase()}.png`,
			`https://img.news.example/v?who=${encodeURIComponent(to.toLowerCase())}`,
			`https://img.news.example/b/${b64}`,
			'https://img.news.example/banner.png',
		].map(src => `<img src="${src}" width="600" alt="x">`).join('');
		const out = await trackerService.scrub(ctx({ withAi: false }), html, { userId: 1, recipient: to });
		expect(out.blocked).toBe(4);
		expect(imgs(out.html).at(-1).getAttribute('src')).toBe('https://img.news.example/banner.png');
	});

	it('adds up weak signals and blocks at the threshold without AI', async () => {
		// opaque token + lone foreign host + last image without alt + bulk headers = 4
		const html = `<img src="https://cdn.shop.example/hero.jpg" width="600" alt="Sale">
			<img src="https://e.mta-host.example/x/Q2xY9mK3pL7vR2tN8wB4zH6j">`;
		const opts = {
			userId: 1,
			sender: 'news@shop.example',
			headers: [{ key: 'list-unsubscribe', value: '<mailto:u@shop.example>' }],
		};
		const out = await trackerService.scrub(ctx({ withAi: false }), html, opts);
		expect(out.blocked).toBe(1);
		const [hero, beacon] = imgs(out.html);
		expect(hero.getAttribute('src')).toContain('hero.jpg');
		expect(beacon.hasAttribute('src')).toBe(false);

		// Same image from a personal sender (no bulk headers): 3 points, kept.
		const personal = await trackerService.scrub(ctx({ withAi: false }), html, { userId: 1, sender: 'alice@shop.example' });
		expect(personal.blocked).toBe(0);
	});

	it('keeps a hashed-name footer logo from a bulk sender', async () => {
		const html = `<img src="https://cdn.shop.example/hero.jpg" width="600" alt="Sale">
			<img src="https://assets.cdn-host.example/i/7f3c2a9e1b8d4c6f0a2e5b7d9c1f3a8e.png">`;
		const out = await trackerService.scrub(ctx({ withAi: false }), html, {
			userId: 1, sender: 'news@shop.example', headers: [{ key: 'list-unsubscribe', value: 'x' }],
		});
		expect(out.blocked).toBe(0);
	});

	it('does not ask the AI about what the rules already decided', async () => {
		const html = `<img src="https://e.mta-host.example/x/Q2xY9mK3pL7vR2tN8wB4zH6j">`;
		const out = await trackerService.scrub(ctx(), html, {
			userId: 1, sender: 'news@shop.example', headers: [{ key: 'x-sg-eid', value: 'abc' }],
		});
		expect(out.blocked).toBe(1);
		expect(aiCalls).toBe(0);
	});

	it('neutralizes tracker CSS backgrounds and marks click-tracking links', async () => {
		const html = `
			<td style="background-image:url('https://sendgrid.net/wf/open?upn=xyz'); color:red">x</td>
			<a href="https://u123.ct.sendgrid.net/ls/click?upn=abc">Read more</a>
			<a href="https://example.org/">Plain</a>`;
		const out = await trackerService.scrub(ctx(), `<table><tr>${html}</tr></table>`, { userId: 1 });
		const { document } = parseHTML(out.html);
		const td = document.querySelector('td');
		expect(td.getAttribute('style')).not.toContain('sendgrid');
		expect(td.getAttribute('data-psg-tracker-style')).toContain('sendgrid.net/wf/open');
		const links = document.querySelectorAll('a');
		expect(links[0].getAttribute('data-psg-click-tracker')).toBe('SendGrid');
		expect(links[0].getAttribute('href')).toContain('sendgrid.net/ls/click');
		expect(links[1].hasAttribute('data-psg-click-tracker')).toBe(false);
		expect(out.clickTrackers).toBe(1);
	});
});
