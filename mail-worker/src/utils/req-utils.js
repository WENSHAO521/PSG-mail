import { UAParser } from 'ua-parser-js';
const reqUtils = {
	getIp(c) {
		return  c.req.header('CF-Connecting-IP') ||
			c.req.header('X-Forwarded-For') ||
			'Unknown';
	},

	getUserAgent(c) {
		const ua = c.req.header('user-agent') || '';

		const parser = new UAParser(ua);
		const { browser, device, os } = parser.getResult();

		let browserInfo = null;
		let osInfo = null;

		// Not every browser/OS reports a version ("Linux" has none) — joining
		// blindly produced "Linuxundefined" in the device list.
		if (browser.name) {
			browserInfo = [browser.name, browser.version].filter(Boolean).join(' ');
		}

		if (os.name) {
			osInfo = [os.name, os.version].filter(Boolean).join(' ');
		}

		let deviceInfo = 'Desktop';

		const hasVendor = !!device?.vendor;
		const hasModel = !!device?.model;

		if (hasVendor || hasModel) {
			const vendor = device.vendor || '';
			const model = device.model || '';
			const type = device.type || '';

			const namePart = [vendor, model].filter(Boolean).join(' ');
			const typePart = type ? ` (${type})` : '';
			deviceInfo = (namePart + typePart).trim();
		}

		return {browser: browserInfo || '', device: deviceInfo || '', os: osInfo || ''}
	}
}

export default reqUtils
