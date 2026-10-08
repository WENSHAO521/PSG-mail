import { describe, it, expect } from 'vitest';
import { isSafeOutboundUrl } from '../src/utils/url-guard';

describe('isSafeOutboundUrl', () => {
	it('accepts real push services and public https hosts', () => {
		for (const u of ['https://fcm.googleapis.com/fcm/send/abc', 'https://updates.push.services.mozilla.com/wpush/v2/x', 'https://web.push.apple.com/Qx']) {
			expect(isSafeOutboundUrl(u)).toBe(true);
		}
	});

	it('rejects loopback, private, metadata, literal and credentialed targets', () => {
		for (const u of ['http://example.com/x', 'https://localhost/x', 'https://127.0.0.1/x', 'https://169.254.169.254/latest', 'https://[::1]/x',
			'https://2130706433/x', 'https://0x7f000001/x', 'https://user:pw@example.com/x', 'https://db.internal/x', 'https://intranet/x',
			'https://example.com:8443/x', 'javascript:alert(1)', 'not a url', 'https://printer.local/x']) {
			expect(isSafeOutboundUrl(u), u).toBe(false);
		}
	});

	it('allows http and custom ports for admin webhooks only when asked', () => {
		expect(isSafeOutboundUrl('http://hooks.example.com:8080/in', { allowHttp: true })).toBe(true);
		expect(isSafeOutboundUrl('http://127.0.0.1:8080/in', { allowHttp: true })).toBe(false);
	});
});
