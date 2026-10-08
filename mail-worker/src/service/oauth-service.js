import BizError from "../error/biz-error";
import orm from "../entity/orm";
import {oauth} from "../entity/oauth";
import { eq, inArray } from 'drizzle-orm';
import userService from "./user-service";
import loginService from "./login-service";
import cryptoUtils from "../utils/crypto-utils";
import { t } from '../i18n/i18n';
import securityAuditService, { SecurityEvent } from './security-audit-service';

const BIND_TICKET_PREFIX = 'oauth_bind_ticket:';
const BIND_TICKET_TTL = 10 * 60;

const oauthService = {

	// PUT /oauth/bindUser is unauthenticated by necessity (the user has no
	// account yet). 3.x trusted a client-supplied oauthUserId — which is a
	// public LinuxDo user id — so anyone could pre-bind a mailbox to someone
	// else's LinuxDo identity and keep a valid session for it. Now the only
	// accepted input is the one-time ticket handed out by linuxDoLogin() to
	// whoever actually completed the OAuth code exchange.
	async bindUser(c, params) {

		const { email, code, bindTicket } = params || {};

		const ticketKey = BIND_TICKET_PREFIX + String(bindTicket || '');
		const oauthUserId = bindTicket ? await c.env.kv.get(ticketKey) : null;
		if (!oauthUserId) {
			throw new BizError(t('oauthBindTicketInvalid'), 401);
		}
		await c.env.kv.delete(ticketKey);

		const oauthRow = await this.getById(c, oauthUserId);
		if (!oauthRow) {
			throw new BizError(t('oauthBindTicketInvalid'), 401);
		}

		let userRow = await userService.selectByIdIncludeDel(c, oauthRow.userId);

		if (userRow) {
			throw new BizError('用户已绑定有邮箱')
		}

		await loginService.register(c, { email, password: cryptoUtils.genRandomPwd(), code }, true);

		userRow = await userService.selectByEmail(c, email);

		await orm(c).update(oauth).set({ userId: userRow.userId }).where(eq(oauth.oauthUserId, oauthUserId)).run();
		await securityAuditService.log(c, SecurityEvent.OAUTH_BIND, { userId: userRow.userId, detail: { provider: 'linuxdo' } });
		const jwtToken = await loginService.login(c, { email, password: null }, true);

		return { userInfo: oauthRow, token: jwtToken}
	},

	async linuxDoLogin(c, params) {

		const { code } = params;

		let token = '';
		let userInfo = {}

		const reqParams = new URLSearchParams()
		reqParams.append('client_id', c.env.linuxdo_client_id)
		reqParams.append('client_secret', c.env.linuxdo_client_secret)
		reqParams.append('code', code)
		reqParams.append('redirect_uri', c.env.linuxdo_callback_url)
		reqParams.append('grant_type', 'authorization_code')

		const tokenRes = await fetch("https://connect.linux.do/oauth2/token", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: reqParams.toString()
		})

		if (!tokenRes.ok) {
			throw new BizError(tokenRes.statusText)
		}

		token = await tokenRes.json()

		const userRes = await fetch('https://connect.linux.do/api/user', {
			headers: {
				Authorization: 'Bearer ' + token.access_token
			}
		});

		if (!userRes.ok) {
			throw new BizError(userRes.statusText)
		}

		userInfo = await userRes.json();

		userInfo.oauthUserId = String(userInfo.id);
		userInfo.active = userInfo.active ? 0 : 1;
		userInfo.silenced = userInfo.active ? 0 : 1;
		userInfo.trustLevel = userInfo.trust_level;
		userInfo.avatar = userInfo.avatar_url;

		const  oauthRow = await this.saveUser(c, userInfo);
		const userRow = await userService.selectByIdIncludeDel(c, oauthRow.userId);

		if (!userRow) {
			const bindTicket = crypto.randomUUID();
			await c.env.kv.put(BIND_TICKET_PREFIX + bindTicket, oauthRow.oauthUserId, { expirationTtl: BIND_TICKET_TTL });
			return { userInfo: { ...oauthRow, bindTicket }, token: null }
		}

		const JwtToken = await loginService.login(c, { email: userRow.email, password: null }, true);
		return { userInfo: oauthRow, token: JwtToken }
	},

	async saveUser(c, userInfo) {

		const userInfoRow = await this.getById(c, userInfo.oauthUserId);

		if (!userInfoRow) {
			return await orm(c).insert(oauth).values(userInfo).returning().get();
		} else {
			return await orm(c).update(oauth).set(userInfo).where(eq(oauth.oauthUserId, userInfo.oauthUserId)).returning().get();
		}

	},

	async getById(c, oauthUserId) {
		return await orm(c).select().from(oauth).where(eq(oauth.oauthUserId, oauthUserId)).get();
	},

	async deleteByUserId(c, userId) {
		await this.deleteByUserIds(c, [userId]);
	},

	async deleteByUserIds(c, userIds) {
		await orm(c).delete(oauth).where(inArray(oauth.userId, userIds)).run();
	},

	//定时任务凌晨清除未绑定邮箱的oauth用户
	async clearNoBindOathUser(c) {
		await orm(c).delete(oauth).where(eq(oauth.userId, 0)).run();
	},

}

export default  oauthService
