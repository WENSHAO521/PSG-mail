import { parseHTML } from 'linkedom';
import { settingConst } from '../const/entity-const';
import aiProviderService from './ai-provider-service';

// Mail tracker blocking for incoming mail (admin switch: setting.aiTrackerBlock).
//
// Open trackers are remote images (usually 1×1 or hidden) whose URL tells the
// sender who opened the mail, when, and from which IP. They are neutralized
// before the mail is stored, so no client ever fetches them:
//
//   1. Rules decide on their own. Decisive signals block outright: a known
//      tracking service, the recipient's address (plain, URL-encoded, base64
//      or its MD5/SHA-1/SHA-256) in the image URL, a tiny or hidden remote
//      image, an open-tracking path. Weaker signals add up (see SCORE) and
//      block at BLOCK_SCORE.
//   2. Optional: if Workers AI is bound, unsized images the rules can't
//      settle (an opaque token in the URL, or some score below the bar) are
//      asked about, from the URL and attributes only — never the mail text.
//      Only confident verdicts block; without AI the rules' result stands.
//
// Blocking is reversible: a blocked <img> keeps its URL in
// data-psg-tracker-src (and is hidden), CSS backgrounds keep theirs in
// data-psg-tracker-style / -background. The reader shows a notice and can
// restore them. Click-tracking links are only marked (data-psg-click-tracker),
// never rewritten: unwrapping a redirect can break the link.

const AI_THRESHOLD = 0.8;

// Rule scoring for one remote image. Anything reaching BLOCK_SCORE is a
// tracker without asking the AI.
const BLOCK_SCORE = 4;
const SCORE = {
	decisive: BLOCK_SCORE, // tiny / hidden, open-tracking path
	opaqueToken: 1,        // long per-recipient-looking token in the URL
	idParam: 1,            // ?uid= / ?e= / ?subscriber= ...
	foreignHost: 1,        // lone image from a domain unrelated to the sender
	lastNoAlt: 1,          // last remote image in the body, no alt text
	bulkSender: 1,         // headers show a bulk / marketing sender
	sized: -3,             // declared >= 40px: meant to be seen
};
const AI_TIMEOUT_MS = 6000;
const MAX_AI_CANDIDATES = 12;
// Per-recipient daily ceiling on AI calls when the admin set no AI quota.
const DEFAULT_DAILY_CHECKS = 300;

// Known tracking services: [vendor, host suffix, optional path test].
// A host-only entry means every image from that host is a tracker.
const OPEN_TRACKERS = [
	['Mailchimp', 'list-manage.com', /\/track\/open/i],
	['Mailchimp', 'mandrillapp.com', /\/track\/open/i],
	['SendGrid', 'sendgrid.net', /\/wf\/open/i],
	['Amazon SES', 'awstrack.me'],
	['HubSpot', 'hubspotemail.net'],
	['HubSpot', 'hubspotlinks.com'],
	['HubSpot', 'track.hubspot.com'],
	['HubSpot', 't.sidekickopen.com'],
	['Mailgun', 'mailgun.org', /^\/o\//i],
	['Postmark', 'pstmrk.it'],
	['Brevo', 'sendibt2.com'],
	['Brevo', 'sendibt3.com'],
	['Brevo', 'sendibw.com'],
	['Constant Contact', 'rs6.net', /\/on\.jsp/i],
	['Campaign Monitor', 'createsend.com', /\/t\//i],
	['Campaign Monitor', 'cmail19.com', /\/t\//i],
	['Campaign Monitor', 'cmail20.com', /\/t\//i],
	['Salesforce Marketing Cloud', 'exct.net', /open\.aspx/i],
	['Salesforce Marketing Cloud', 'exacttarget.com', /open\.aspx/i],
	['Marketo', 'mktoweb.com'],
	['Marketo', 'mktdns.com'],
	['Klaviyo', 'klaviyomail.com'],
	['Klaviyo', 'trk.klclick.com'],
	['Mailtrack', 'mailtrack.io'],
	['Yesware', 't.yesware.com'],
	['Streak', 'mailfoogae.appspot.com'],
	['Mixmax', 'track.mixmax.com'],
	['Superhuman', 'r.superhuman.com'],
	['Bananatag', 'bl-1.com'],
	['Outreach', 'outrch.com'],
	['Salesloft', 'sdr.salesloft.com'],
	['Mailjet', 'mjt.lu', /\/oo\//i],
	['Zoho Campaigns', 'maillist-manage.com', /\/open/i],
	['Substack', 'substack.com', /\/o\/|\/open/i],
	['Google Analytics', 'google-analytics.com'],
	['Facebook', 'facebook.com', /^\/tr\b/i],
];

const CLICK_TRACKERS = [
	['Mailchimp', 'list-manage.com', /\/track\/click/i],
	['Mailchimp', 'mandrillapp.com', /\/track\/click/i],
	['SendGrid', 'sendgrid.net', /\/ls\/click/i],
	['Amazon SES', 'awstrack.me'],
	['HubSpot', 'hubspotlinks.com'],
	['HubSpot', 'hubspotemail.net'],
	['Mailgun', 'mailgun.org', /^\/c\//i],
	['Postmark', 'pstmrk.it'],
	['Brevo', 'sendibt2.com'],
	['Brevo', 'sendibt3.com'],
	['Constant Contact', 'rs6.net', /\/tn\.jsp/i],
	['Campaign Monitor', 'createsend.com', /\/t\//i],
	['Salesforce Marketing Cloud', 'exct.net'],
	['Klaviyo', 'klclick.com'],
	['Klaviyo', 'klclick1.com'],
	['Klaviyo', 'klclick3.com'],
	['Mailtrack', 'mailtrack.io'],
	['Yesware', 't.yesware.com'],
	['Mixmax', 'track.mixmax.com'],
	['Mailjet', 'mjt.lu', /\/lnk\//i],
	['Substack', 'substack.com', /\/redirect\//i],
];

// Path shapes typical of open-tracking endpoints on custom domains. Each
// must be a whole path segment: /pixel.gif is a beacon, /pixelart/x.png is not.
const TRACKING_PATH = /\/(?:(?:track(?:ing)?\/open|wf\/open|e\/o|pixel|beacon|imp(?:ression)?s?|openmail|trk)(?:\.(?:gif|png|php|aspx?|jsp))?|open\.(?:gif|png|php|aspx?|jsp)|(?:o|t|blank|spacer)\.gif)(?=$|[/?#;])/i;
// A per-recipient token: a long opaque run of base64url / hex characters
// mixing letters and digits (a long hyphenated file name is not one).
const OPAQUE_RUN = /[A-Za-z0-9_\-=%]{24,}/g;
// Query parameters that usually carry a recipient / campaign id.
const ID_PARAM = /^(u|e|uid|eid|rid|sid|mid|cid|lid|email|subscriber(_?id)?|recipient(_?id)?|contact(_?id)?|user_?id|token|hash)$/i;
// Headers set by bulk / marketing senders and the ESPs they use.
const BULK_HEADER = /^(list-unsubscribe|list-id|feedback-id|precedence|x-campaign.*|x-mailer-campaign|x-sg-.*|x-mailgun-.*|x-mc-.*|x-mandrill-.*|x-ses-.*|x-pm-.*|x-mj-.*|x-sib-.*|x-hs-.*|x-hubspot-.*|x-klaviyo-.*|x-marketo-.*|x-sfmc-.*|x-campaignid|x-rpcampaign)$/i;
const CSS_URL = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi;

const SYSTEM_PROMPT = [
	'You inspect remote images found in an HTML email and decide which ones are tracking pixels / web beacons:',
	'images whose only purpose is to tell the sender that the email was opened (usually invisible or tiny, URL carries a per-recipient id, served by an email marketing or analytics service).',
	'Logos, banners, product photos, avatars, icons and other images meant to be seen are NOT trackers, even if their URL is long.',
	'When unsure, answer not a tracker.',
	'Reply with JSON only: {"items": [{"i": <index>, "tracker": true|false, "confidence": 0.0-1.0}]}.',
].join(' ');

function hasOpaqueToken(value) {
	return (value.match(OPAQUE_RUN) || []).some(run => /\d/.test(run) && /[A-Za-z]/.test(run) && !/^[a-z]+(-[a-z0-9]+)+$/i.test(run));
}

// Registrable domain, roughly: the last two labels, or three for
// country-code second levels like co.uk / com.cn.
function siteOf(host) {
	const labels = String(host || '').toLowerCase().replace(/\.$/, '').split('.').filter(Boolean);
	if (labels.length <= 2) return labels.join('.');
	const tld = labels.at(-1), second = labels.at(-2);
	const take = tld.length === 2 && second.length <= 3 ? 3 : 2;
	return labels.slice(-take).join('.');
}

function hex(buffer) {
	return [...new Uint8Array(buffer)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// Forms in which a sender embeds the recipient's address in a beacon URL.
// Lower-case forms are matched case-insensitively, base64 forms exactly.
async function recipientForms(address) {
	const addr = String(address || '').trim().toLowerCase();
	if (!addr.includes('@')) return { lower: [], exact: [] };
	const lower = [addr, encodeURIComponent(addr).toLowerCase()];
	const bytes = new TextEncoder().encode(addr);
	for (const alg of ['MD5', 'SHA-1', 'SHA-256']) {
		try { lower.push(hex(await crypto.subtle.digest(alg, bytes))); } catch {}
	}
	const b64 = btoa(addr).replace(/=+$/, '');
	return { lower, exact: [b64, b64.replace(/\+/g, '-').replace(/\//g, '_')] };
}

function containsRecipient(url, forms) {
	const raw = url.href;
	let lower = raw.toLowerCase();
	try { lower += ' ' + decodeURIComponent(raw).toLowerCase(); } catch {}
	return forms.lower.some(f => lower.includes(f)) || forms.exact.some(f => raw.includes(f));
}

function isBulkSender(headers) {
	return Array.isArray(headers) && headers.some(h => BULK_HEADER.test(String(h?.key || '')));
}

function withTimeout(promise, ms) {
	return Promise.race([
		promise,
		new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
	]);
}

function parseUrl(raw) {
	const value = String(raw || '').trim();
	if (!/^(https?:)?\/\//i.test(value)) return null;
	try {
		return new URL(value.startsWith('//') ? 'https:' + value : value);
	} catch {
		return null;
	}
}

function hostMatches(host, suffix) {
	return host === suffix || host.endsWith('.' + suffix);
}

function matchVendor(list, url) {
	const host = url.hostname.toLowerCase();
	for (const [vendor, suffix, pathTest] of list) {
		if (hostMatches(host, suffix) && (!pathTest || pathTest.test(url.pathname + url.search))) return vendor;
	}
	return null;
}

function cssValue(style, prop) {
	let value = null;
	for (const decl of String(style || '').split(';')) {
		const idx = decl.indexOf(':');
		if (idx > -1 && decl.slice(0, idx).trim().toLowerCase() === prop) value = decl.slice(idx + 1).trim().toLowerCase();
	}
	return value;
}

function pixels(value) {
	if (value == null || value === '') return null;
	const m = String(value).trim().match(/^(\d+(?:\.\d+)?)(px)?$/i);
	return m ? Number(m[1]) : null;
}

function imageSize(img) {
	const style = img.getAttribute('style');
	return {
		width: pixels(cssValue(style, 'width')) ?? pixels(img.getAttribute('width')),
		height: pixels(cssValue(style, 'height')) ?? pixels(img.getAttribute('height')),
	};
}

function isHidden(img) {
	if (img.hasAttribute('hidden')) return true;
	const style = img.getAttribute('style');
	return cssValue(style, 'display')?.startsWith('none')
		|| cssValue(style, 'visibility')?.startsWith('hidden')
		|| Number(cssValue(style, 'opacity')) === 0 && cssValue(style, 'opacity') != null
		|| pixels(cssValue(style, 'max-height')) === 0
		|| pixels(cssValue(style, 'max-width')) === 0;
}

// Rule verdict for one remote image: { vendor } when it is a tracker,
// { candidate: true } when the rules can't settle it (the AI may), null when
// it is content. ctx carries the mail-level facts the score needs.
function judgeImage(img, url, ctx) {
	const vendor = matchVendor(OPEN_TRACKERS, url);
	if (vendor) return { vendor };
	if (containsRecipient(url, ctx.recipient)) return { vendor: '' };

	const { width, height } = imageSize(img);
	const tiny = (width != null && width <= 3) && (height != null && height <= 3)
		|| width === 0 || height === 0;
	if (tiny || isHidden(img)) return { vendor: '' };

	const sized = (width != null && width >= 40) || (height != null && height >= 40);
	// A hashed file name on a content image (…/a3f9…e.png) is a CDN cache key,
	// not a recipient id; beacons are .gif or extensionless.
	const contentFile = /\.(png|jpe?g|webp|svg|avif)$/i.test(url.pathname);
	const opaque = !contentFile && hasOpaqueToken(url.pathname + url.search);
	let score = 0;
	if (TRACKING_PATH.test(url.pathname)) score += SCORE.decisive;
	if (opaque) score += SCORE.opaqueToken;
	if ([...url.searchParams.keys()].some(k => ID_PARAM.test(k))) score += SCORE.idParam;
	if (ctx.senderSite && siteOf(url.hostname) !== ctx.senderSite && ctx.hostCount.get(url.hostname) === 1) {
		score += SCORE.foreignHost;
	}
	if (img === ctx.lastImage && !(img.getAttribute('alt') || '').trim()) score += SCORE.lastNoAlt;
	if (ctx.bulk) score += SCORE.bulkSender;
	if (sized) score += SCORE.sized;

	if (score >= BLOCK_SCORE) return { vendor: '' };
	if (!sized && (opaque || score >= 2)) return { candidate: true };
	return null;
}

function blockImage(img, vendor) {
	for (const attr of ['src', 'srcset']) {
		const value = img.getAttribute(attr);
		if (value == null) continue;
		img.setAttribute(`data-psg-tracker-${attr}`, value);
		img.removeAttribute(attr);
	}
	img.setAttribute('data-psg-tracker', vendor || '');
	img.setAttribute('hidden', '');
}

// <picture><source srcset> loads before the <img> fallback is consulted.
function blockPictureSources(img) {
	const picture = img.parentNode?.tagName === 'PICTURE' ? img.parentNode : null;
	if (!picture) return;
	for (const source of picture.querySelectorAll('source[srcset]')) {
		source.setAttribute('data-psg-tracker-srcset', source.getAttribute('srcset'));
		source.removeAttribute('srcset');
	}
}

function blockBackgrounds(document, found) {
	for (const el of document.querySelectorAll('[background]')) {
		const url = parseUrl(el.getAttribute('background'));
		const vendor = url && matchVendor(OPEN_TRACKERS, url);
		if (!vendor) continue;
		el.setAttribute('data-psg-tracker-background', el.getAttribute('background'));
		el.removeAttribute('background');
		el.setAttribute('data-psg-tracker', vendor);
		found.push(vendor);
	}
	for (const el of document.querySelectorAll('[style*="url("]')) {
		const style = el.getAttribute('style');
		let vendor = null;
		const cleaned = style.replace(CSS_URL, (whole, _q, raw) => {
			const url = parseUrl(raw);
			const v = url && matchVendor(OPEN_TRACKERS, url);
			if (!v) return whole;
			vendor = v;
			return 'none';
		});
		if (!vendor) continue;
		el.setAttribute('data-psg-tracker-style', style);
		el.setAttribute('style', cleaned);
		el.setAttribute('data-psg-tracker', vendor);
		found.push(vendor);
	}
}

function markClickTrackers(document) {
	let count = 0;
	for (const a of document.querySelectorAll('a[href]')) {
		const url = parseUrl(a.getAttribute('href'));
		const vendor = url && matchVendor(CLICK_TRACKERS, url);
		if (!vendor) continue;
		a.setAttribute('data-psg-click-tracker', vendor);
		count++;
	}
	return count;
}

function parseAiVerdicts(result) {
	const content = aiProviderService.text(result) || (typeof result === 'object' ? result : '');
	let json = content;
	if (typeof content === 'string') {
		const match = content.match(/\{[\s\S]*\}/);
		if (!match) return [];
		json = JSON.parse(match[0]);
	}
	return Array.isArray(json?.items) ? json.items : [];
}

const trackerService = {

	AI_THRESHOLD,

	enabled(setting) {
		return Number(setting?.aiTrackerBlock) === settingConst.aiTrackerBlock.OPEN;
	},

	// Asks Workers AI which candidate images are beacons. Returns the set of
	// candidate indexes judged trackers with enough confidence.
	async classify(c, userId, candidates) {
		const lines = candidates.map(({ img, url }, i) => {
			const { width, height } = imageSize(img);
			const alt = (img.getAttribute('alt') || '').slice(0, 60);
			const style = (img.getAttribute('style') || '').slice(0, 120);
			return `${i}. url=${url.href.slice(0, 300)} width=${width ?? '?'} height=${height ?? '?'} alt="${alt}" style="${style}"`;
		});
		const result = await withTimeout(aiProviderService.run(c, userId, 'tracker_detection', {
			messages: [
				{ role: 'system', content: SYSTEM_PROMPT },
				{ role: 'user', content: lines.join('\n') },
			],
			temperature: 0,
			max_tokens: 40 + candidates.length * 30,
		}, { perTask: true, defaultQuota: DEFAULT_DAILY_CHECKS }), AI_TIMEOUT_MS);
		const blocked = new Set();
		for (const item of parseAiVerdicts(result)) {
			const i = Number(item?.i);
			if (item?.tracker === true && Number(item.confidence) >= AI_THRESHOLD && i >= 0 && i < candidates.length) {
				blocked.add(i);
			}
		}
		return blocked;
	},

	// Neutralizes trackers in one received message's HTML. Returns the
	// rewritten html plus what was found; never throws — on any failure the
	// rule-based result (or the original html) is returned.
	// recipient: the address this copy was delivered to; sender and headers
	// come from the parsed message (postal-mime) and only feed the score.
	async scrub(c, html, { userId, recipient, sender, headers, useAi = true } = {}) {
		const none = { html, blocked: 0, vendors: [], clickTrackers: 0, ai: false };
		if (!html || !/<img|<a\s|background|url\(/i.test(html)) return none;
		let document;
		try {
			({ document } = parseHTML(html));
		} catch {
			return none;
		}
		try {
			const found = [];
			const candidates = [];
			const remote = [];
			for (const img of document.querySelectorAll('img')) {
				const url = parseUrl(img.getAttribute('src'));
				if (url) remote.push({ img, url });
			}
			const hostCount = new Map();
			for (const { url } of remote) hostCount.set(url.hostname, (hostCount.get(url.hostname) || 0) + 1);
			const senderDomain = String(sender || '').split('@')[1] || '';
			const judgeCtx = {
				recipient: await recipientForms(recipient),
				senderSite: senderDomain ? siteOf(senderDomain) : '',
				hostCount,
				lastImage: remote.at(-1)?.img,
				bulk: isBulkSender(headers),
			};
			for (const { img, url } of remote) {
				const verdict = judgeImage(img, url, judgeCtx);
				if (!verdict) continue;
				if (verdict.candidate) {
					if (candidates.length < MAX_AI_CANDIDATES) candidates.push({ img, url });
					continue;
				}
				blockImage(img, verdict.vendor);
				blockPictureSources(img);
				found.push(verdict.vendor);
			}
			blockBackgrounds(document, found);
			const clickTrackers = markClickTrackers(document);

			let ai = false;
			if (useAi && userId && candidates.length && c.env.ai) {
				try {
					const blocked = await this.classify(c, userId, candidates);
					for (const i of blocked) {
						blockImage(candidates[i].img, '');
						blockPictureSources(candidates[i].img);
						found.push('');
						ai = true;
					}
				} catch (e) {
					console.error('AI tracker detection failed', e?.message || e);
				}
			}

			if (!found.length && !clickTrackers) return none;
			return {
				html: document.toString(),
				blocked: found.length,
				vendors: [...new Set(found.filter(Boolean))],
				clickTrackers,
				ai,
			};
		} catch (e) {
			console.error('Tracker blocking failed', e?.message || e);
			return none;
		}
	},
};

export default trackerService;
