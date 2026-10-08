import BizError from '../error/biz-error';
import { t } from '../i18n/i18n';

// Policy for NEW passwords only (register, change, admin set, reset). Existing
// passwords are never re-validated or reset — users with an older, weaker
// password keep logging in and are only held to this when they next change it.
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
// A long passphrase is strong regardless of character classes.
const PASSPHRASE_LENGTH = 16;

function classCount(pwd) {
	let n = 0;
	if (/[a-z]/.test(pwd)) n++;
	if (/[A-Z]/.test(pwd)) n++;
	if (/[0-9]/.test(pwd)) n++;
	if (/[^A-Za-z0-9]/.test(pwd)) n++;
	return n;
}

export function checkPassword(password, { email } = {}) {
	if (typeof password !== 'string' || password.length < PASSWORD_MIN_LENGTH) {
		return 'pwdMinLength';
	}
	if (password.length > PASSWORD_MAX_LENGTH) {
		return 'pwdLengthLimit';
	}
	if (password.length < PASSPHRASE_LENGTH && classCount(password) < 3) {
		return 'pwdTooWeak';
	}
	if (email) {
		const local = String(email).split('@')[0].toLowerCase();
		if (local.length >= 4 && password.toLowerCase().includes(local)) {
			return 'pwdContainsEmail';
		}
	}
	return null;
}

export function assertPassword(password, opts) {
	const err = checkPassword(password, opts);
	if (err) throw new BizError(t(err, { min: PASSWORD_MIN_LENGTH, max: PASSWORD_MAX_LENGTH }), 400);
}

export default { checkPassword, assertPassword, PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH };
