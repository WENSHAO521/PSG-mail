import BizError from '../error/biz-error';
import userService from './user-service';
import emailUtils from '../utils/email-utils';
import { isDel, settingConst, userConst } from '../const/entity-const';
import JwtUtils from '../utils/jwt-utils';
import { v4 as uuidv4 } from 'uuid';
import KvConst from '../const/kv-const';
import constant from '../const/constant';
import userContext from '../security/user-context';
import verifyUtils from '../utils/verify-utils';
import accountService from './account-service';
import settingService from './setting-service';
import saltHashUtils from '../utils/crypto-utils';
import cryptoUtils, { passwordIterations } from '../utils/crypto-utils';
import turnstileService from './turnstile-service';
import roleService from './role-service';
import regKeyService from './reg-key-service';
import dayjs from 'dayjs';
import { toUtc } from '../utils/date-uitil';
import { t } from '../i18n/i18n.js';
import verifyRecordService from './verify-record-service';
import telegramService from './telegram-service';
import reqUtils from '../utils/req-utils';
import rateLimit from '../security/rate-limit';
import sessionService from '../security/session-service';
import securityAuditService, { SecurityEvent } from './security-audit-service';
import { assertPassword } from '../utils/password-policy';

const PASSWORD_CHANGE_LIMIT = 8;
const PASSWORD_CHANGE_WINDOW_SECONDS = 15 * 60;
const LOGIN_FAIL_LIMIT_PER_EMAIL = 10;
const LOGIN_FAIL_LIMIT_PER_IP = 50;
const LOGIN_FAIL_WINDOW_SECONDS = 15 * 60;

const loginService = {

	async register(c, params, oauth = false) {

		const { email, password, token, code, name } = params;

		let { regKey, register, registerVerify, regVerifyCount, minEmailPrefix, emailPrefixFilter } = await settingService.query(c)

		if (oauth) {
			registerVerify = settingConst.registerVerify.CLOSE;
			register = settingConst.register.OPEN;
		}

		if (register === settingConst.register.CLOSE) {
			throw new BizError(t('regDisabled'));
		}

		if (!verifyUtils.isEmail(email)) {
			throw new BizError(t('notEmail'));
		}

		if (emailUtils.getName(email).length < minEmailPrefix) {
			throw new BizError(t('minEmailPrefix', { msg: minEmailPrefix } ));
		}

		if (emailPrefixFilter.some(content => emailUtils.getName(email).includes(content)))  {
			throw new BizError(t('banEmailPrefix'));
		}

		if (emailUtils.getName(email).length > 64) {
			throw new BizError(t('emailLengthLimit'));
		}

		// OAuth sign-up generates its own random password.
		if (!oauth) {
			assertPassword(password, { email });
		}

		if (!c.env.domain.includes(emailUtils.getDomain(email))) {
			throw new BizError(t('notEmailDomain'));
		}

		let type = null;
		let regKeyId = 0

		if (regKey === settingConst.regKey.OPEN) {
			const result = await this.handleOpenRegKey(c, regKey, code)
			type = result?.type
			regKeyId = result?.regKeyId
		}

		if (regKey === settingConst.regKey.OPTIONAL) {
			const result = await this.handleOpenOptional(c, regKey, code)
			type = result?.type
			regKeyId = result?.regKeyId
		}

		const accountRow = await accountService.selectByEmailIncludeDel(c, email);

		if (accountRow && accountRow.isDel === isDel.DELETE) {
			throw new BizError(t('isDelUser'));
		}

		if (accountRow) {
			throw new BizError(t('isRegAccount'));
		}

		let defType = null

		if (!type) {
			const roleRow = await roleService.selectDefaultRole(c);
			defType = roleRow.roleId
		}


		const roleRow = await roleService.selectById(c, type || defType);

		if(!roleService.hasAvailDomainPerm(roleRow.availDomain, email)) {

			if (type) {
				throw new BizError(t('noDomainPermRegKey'),403)
			}

			if (defType) {
				throw new BizError(t('noDomainPermReg'),403)
			}

		}

		let regVerifyOpen = false

		if (registerVerify === settingConst.registerVerify.OPEN) {
			regVerifyOpen = true
			await turnstileService.verify(c,token)
		}

		if (registerVerify === settingConst.registerVerify.COUNT) {
			regVerifyOpen = await verifyRecordService.isOpenRegVerify(c, regVerifyCount);
			if (regVerifyOpen) {
				await turnstileService.verify(c,token)
			}
		}

		const { salt, hash } = await saltHashUtils.hashPassword(password, passwordIterations(c));

		const userId = await userService.insert(c, { email, regKeyId,password: hash, salt, type: type || defType });

		await accountService.insert(c, { userId: userId, email, name: (name && name.trim()) || emailUtils.getName(email) });

		await userService.updateUserInfo(c, userId, true);

		telegramService.sendUserRegisteredToBot(c, { email, userId }).catch(() => {});

		if (regKey !== settingConst.regKey.CLOSE && type) {
			await regKeyService.reduceCount(c, code, 1);
		}

		if (registerVerify === settingConst.registerVerify.COUNT && !regVerifyOpen) {
			const row = await verifyRecordService.increaseRegCount(c);
			return {regVerifyOpen: row.count >= regVerifyCount}
		}

		return {regVerifyOpen}

	},

	async registerVerify() {

	},

	async handleOpenRegKey(c, regKey, code) {

		if (!code) {
			throw new BizError(t('emptyRegKey'));
		}

		const regKeyRow = await regKeyService.selectByCode(c, code);

		if (!regKeyRow) {
			throw new BizError(t('notExistRegKey'));
		}

		if (regKeyRow.count <= 0) {
			throw new BizError(t('noRegKeyCount'));
		}

		const today = toUtc().tz('Asia/Shanghai').startOf('day')
		const expireTime = toUtc(regKeyRow.expireTime).tz('Asia/Shanghai').startOf('day');

		if (expireTime.isBefore(today)) {
			throw new BizError(t('regKeyExpire'));
		}

		return { type: regKeyRow.roleId, regKeyId: regKeyRow.regKeyId };
	},

	async handleOpenOptional(c, regKey, code) {

		if (!code) {
			return null
		}

		const regKeyRow = await regKeyService.selectByCode(c, code);

		if (!regKeyRow) {
			return null
		}

		const today = toUtc().tz('Asia/Shanghai').startOf('day')
		const expireTime = toUtc(regKeyRow.expireTime).tz('Asia/Shanghai').startOf('day');

		if (regKeyRow.count <= 0 || expireTime.isBefore(today)) {
			return null
		}

		return { type: regKeyRow.roleId, regKeyId: regKeyRow.regKeyId };
	},

	async login(c, params, noVerifyPwd = false) {

		const email = typeof params?.email === 'string' ? params.email.trim() : '';
		const password = typeof params?.password === 'string' ? params.password : '';

		if ((!email || !password) && !noVerifyPwd) {
			throw new BizError(t('emailAndPwdEmpty'));
		}

		const ip = reqUtils.getIp(c);
		const emailKey = `login:e:${email.toLowerCase()}`;
		const ipKey = `login:ip:${ip}`;

		if (!noVerifyPwd) {
			if (await rateLimit.isLimited(c, emailKey, LOGIN_FAIL_LIMIT_PER_EMAIL)
				|| await rateLimit.isLimited(c, ipKey, LOGIN_FAIL_LIMIT_PER_IP)) {
				await securityAuditService.log(c, SecurityEvent.LOGIN_RATE_LIMITED, { detail: { email } });
				throw new BizError(t('loginRateLimit'), 429);
			}
		}

		const userRow = await userService.selectByEmailIncludeDel(c, email);

		if (!noVerifyPwd) {
			// Verify the password BEFORE revealing whether the account exists,
			// is deleted or banned — otherwise the distinct error messages
			// let anyone enumerate mailboxes without knowing a password.
			const ok = userRow && await cryptoUtils.verifyPassword(password, userRow.salt, userRow.password);
			if (!ok) {
				await Promise.all([
					rateLimit.fail(c, emailKey, LOGIN_FAIL_WINDOW_SECONDS),
					rateLimit.fail(c, ipKey, LOGIN_FAIL_WINDOW_SECONDS)
				]);
				await securityAuditService.log(c, SecurityEvent.LOGIN_FAIL, { userId: userRow?.userId, detail: { email } });
				throw new BizError(t('loginFailed'));
			}
		} else if (!userRow) {
			throw new BizError(t('notExistUser'));
		}

		if (userRow.isDel === isDel.DELETE) {
			throw new BizError(t('isDelUser'));
		}

		if (userRow.status === userConst.status.BAN) {
			throw new BizError(t('isBanUser'));
		}

		if (!noVerifyPwd) {
			await rateLimit.reset(c, emailKey);
			// Transparent upgrade of legacy single-round SHA-256 hashes. Done
			// only here, where we hold the verified plaintext — never by
			// resetting anyone's password.
			if (cryptoUtils.needsRehash(userRow.password, passwordIterations(c))) {
				try {
					const { salt, hash } = await cryptoUtils.hashPassword(password, passwordIterations(c));
					await c.env.db.prepare('UPDATE user SET password = ?, salt = ? WHERE user_id = ? AND password = ?')
						.bind(hash, salt, userRow.userId, userRow.password).run();
					userRow.password = hash;
					userRow.salt = salt;
					await securityAuditService.log(c, SecurityEvent.PASSWORD_REHASH, { userId: userRow.userId });
				} catch (e) {
					console.warn('password rehash skipped:', e?.message);
				}
			}
		}

		const sessionId = uuidv4();
		const jwt = await JwtUtils.generateToken(c, { userId: userRow.userId, token: sessionId }, constant.TOKEN_EXPIRE);

		await userService.updateUserInfo(c, userRow.userId);
		await sessionService.create(c, userRow, sessionId);
		await securityAuditService.log(c, SecurityEvent.LOGIN_SUCCESS, { userId: userRow.userId, detail: { session: sessionId.slice(0, 8), sso: !!noVerifyPwd } });
		return jwt;
	},

	async changePassword(c, params = {}) {
		const email = typeof params.email === 'string' ? params.email.trim().toLowerCase() : '';
		const currentPassword = typeof params.currentPassword === 'string' ? params.currentPassword : '';
		const newPassword = typeof params.newPassword === 'string' ? params.newPassword : '';

		if (!verifyUtils.isEmail(email) || !currentPassword || !newPassword) {
			throw new BizError(t('passwordChangeInvalid'), 400);
		}

		assertPassword(newPassword, { email });

		if (newPassword === currentPassword) {
			throw new BizError(t('passwordChangeSame'), 400);
		}

		const attemptKey = `${KvConst.PASSWORD_CHANGE_ATTEMPT}${reqUtils.getIp(c)}:${email}`;
		const attempts = Number(await c.env.kv.get(attemptKey) || 0);
		if (attempts >= PASSWORD_CHANGE_LIMIT) {
			throw new BizError(t('passwordChangeRateLimit'), 429);
		}

		const userRow = await userService.selectByEmailIncludeDel(c, email);
		const validUser = userRow
			&& userRow.isDel !== isDel.DELETE
			&& userRow.status !== userConst.status.BAN
			&& await cryptoUtils.verifyPassword(currentPassword, userRow.salt, userRow.password);

		if (!validUser) {
			await c.env.kv.put(attemptKey, String(attempts + 1), { expirationTtl: PASSWORD_CHANGE_WINDOW_SECONDS });
			throw new BizError(t('passwordChangeInvalid'), 400);
		}

		// setPwd revokes every session — this flow runs logged-out.
		await userService.setPwd(c, { password: newPassword, userId: userRow.userId }, { skipPolicy: true });
		await securityAuditService.log(c, SecurityEvent.PASSWORD_CHANGE, { userId: userRow.userId, detail: { via: 'login' } });
		await c.env.kv.delete(attemptKey);
	},

	async logout(c, userId) {
		// 3.x forgot to await getToken() here, so findIndex() returned -1 and
		// splice(-1, 1) logged out the user's MOST RECENT OTHER device while
		// leaving the caller's own token valid.
		const sessionId = await userContext.getToken(c);
		if (sessionId) {
			await sessionService.revoke(c, userId, sessionId);
		}
		await securityAuditService.log(c, SecurityEvent.LOGOUT, { userId, detail: { session: sessionId?.slice(0, 8) } });
	}

};

export default loginService;
