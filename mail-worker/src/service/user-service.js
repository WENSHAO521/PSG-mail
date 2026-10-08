import { ensureUserAvatar, ensureUserSignature } from '../utils/schema-guard';
import BizError from '../error/biz-error';
import accountService from './account-service';
import orm from '../entity/orm';
import user from '../entity/user';
import { and, asc, count, desc, eq, inArray, sql } from 'drizzle-orm';
import { emailConst, isDel, roleConst, settingConst, userConst } from '../const/entity-const';
import kvConst from '../const/kv-const';
import KvConst from '../const/kv-const';
import kvCache from '../cache/kv-cache';
import cryptoUtils from '../utils/crypto-utils';
import emailService from './email-service';
import dayjs from 'dayjs';
import permService from './perm-service';
import roleService from './role-service';
import emailUtils from '../utils/email-utils';
import saltHashUtils from '../utils/crypto-utils';
import constant from '../const/constant';
import { t } from '../i18n/i18n'
import reqUtils from '../utils/req-utils';
import {oauth} from "../entity/oauth";
import oauthService from "./oauth-service";
import {account} from "../entity/account";
import settingService from './setting-service';
import starService from './star-service';

const AVATAR_DATA_URL_PATTERN = /^data:image\/(?:jpeg|jpg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/i;
const MAX_AVATAR_DATA_URL_LENGTH = 256 * 1024;
const UNDO_SEND_SECONDS_OPTIONS = [0, 5, 10, 20, 30];
const DEFAULT_UNDO_SEND_SECONDS = 10;
const MAX_SIGNATURES = 20;
const MAX_SIGNATURE_NAME = 60;
const MAX_SIGNATURE_HTML = 20000;
const MAX_SENDER_BINDINGS = 200;
const SIGNATURE_ID_PATTERN = /^[A-Za-z0-9_-]{1,40}$/;

// Signatures as stored in psg_user_signature (migrations/0012). A user who
// only has the legacy single `user.signature` gets it back as one entry used
// for both new mail and replies, so nothing changes until they edit.
function normalizeSignatures(raw, legacy) {
	let data = null;
	try { data = raw ? JSON.parse(raw) : null; } catch {}
	if (!data || !Array.isArray(data.items)) {
		if (!legacy) return { items: [], newId: null, replyId: null, bySender: {} };
		return { items: [{ id: 'default', name: '', html: legacy }], newId: 'default', replyId: 'default', bySender: {} };
	}
	const ids = new Set(data.items.map(i => i.id));
	// bySender: sender address -> signature id (or '' for "no signature"),
	// overriding the new/reply defaults when composing from that address.
	const bySender = {};
	for (const [addr, id] of Object.entries(data.bySender || {})) {
		if (id === '' || ids.has(id)) bySender[addr] = id;
	}
	return {
		items: data.items,
		newId: ids.has(data.newId) ? data.newId : null,
		replyId: ids.has(data.replyId) ? data.replyId : null,
		bySender,
	};
}

async function ensureAvatarColumn(c) {
	await ensureUserAvatar(c);
}

const userService = {

	async loginUserInfo(c, userId) {

		const userRow = await userService.selectById(c, userId);

		if (!userRow) {
			throw new BizError(t('authExpired'), 401);
		}

		let [accountRow, roleRow, permKeys] = await Promise.all([
			accountService.selectByEmailIncludeDel(c, userRow.email),
			roleService.selectById(c, userRow.type),
			userRow.email === c.env.admin ? Promise.resolve(['*']) : permService.userPermKeys(c, userId)
		]);

		if (!accountRow) {
			accountRow = await accountService.insert(c, {
				userId,
				email: userRow.email,
				name: emailUtils.getName(userRow.email)
			});
		}

		const user = {};
		user.userId = userRow.userId;
		user.sendCount = userRow.sendCount;
		user.email = userRow.email;
		user.account = accountRow;
		user.name = accountRow.name;
		user.permKeys = permKeys;
		user.role = roleRow;
		user.type = userRow.type;

		try {
			const row = await c.env.db
				.prepare('SELECT signature, avatar FROM user WHERE user_id = ?')
				.bind(userId).first();
			user.signature = row?.signature || '';
			user.avatar    = row?.avatar    || '';
		} catch {
			user.signature = '';
			user.avatar    = '';
		}

		let sigRow = null;
		try {
			sigRow = await c.env.db
				.prepare('SELECT data FROM psg_user_signature WHERE user_id = ?')
				.bind(userId).first();
		} catch {}
		user.signatures = normalizeSignatures(sigRow?.data, user.signature);

		// psg_user_pref (migrations/0009): no row yet means defaults.
		let pref = null;
		try {
			pref = await c.env.db
				.prepare('SELECT undo_send_seconds, reply_from_received FROM psg_user_pref WHERE user_id = ?')
				.bind(userId).first();
		} catch {}
		user.undoSendSeconds = pref?.undo_send_seconds ?? DEFAULT_UNDO_SEND_SECONDS;
		user.replyFromReceived = (pref?.reply_from_received ?? 1) === 1;
		// Separate query: migration 0015 may not be applied yet.
		let translatePref = null;
		try {
			translatePref = await c.env.db
				.prepare('SELECT translate_provider, google_translate_key FROM psg_user_pref WHERE user_id = ?')
				.bind(userId).first();
		} catch {}
		user.translateProvider = translatePref?.translate_provider || '';
		// Never send the key back, not even a prefix, only that one is set.
		const ownKey = translatePref?.google_translate_key || '';
		user.googleTranslateKey = ownKey ? '******' : '';

		if (c.env.admin === userRow.email) {
			user.role = constant.ADMIN_ROLE;
			user.type = 0;
		}

		return user;
	},

	async saveAvatar(c, base64, userId) {
		if (typeof base64 !== 'string'
			|| base64.length > MAX_AVATAR_DATA_URL_LENGTH
			|| !AVATAR_DATA_URL_PATTERN.test(base64)) {
			throw new BizError(t('invalidAvatar'));
		}

		await ensureAvatarColumn(c);
		await c.env.db
			.prepare('UPDATE user SET avatar = ? WHERE user_id = ?')
			.bind(base64 ?? '', userId).run();
	},

	async clearAvatar(c, userId) {
		await ensureAvatarColumn(c);
		await c.env.db
			.prepare('UPDATE user SET avatar = ? WHERE user_id = ?')
			.bind('', userId).run();
	},

	// Returns the server avatar for a registered primary or linked mailbox.
	// The lookup is case-insensitive and does not rely on the recipient's
	// localStorage, so it works across devices and browser profiles.
	async getAvatarByEmail(c, email) {
		const normalizedEmail = String(email || '').trim().toLowerCase();
		if (!normalizedEmail) return '';
		try {
			const primaryRow = await c.env.db
				.prepare('SELECT avatar FROM user WHERE LOWER(TRIM(email)) = ? AND is_del = 0 LIMIT 1')
				.bind(normalizedEmail).first();
			if (primaryRow?.avatar) return primaryRow.avatar;

			const linkedRow = await c.env.db
				.prepare(`
					SELECT u.avatar
					FROM account a
					INNER JOIN user u ON u.user_id = a.user_id
					WHERE LOWER(TRIM(a.email)) = ?
					  AND a.is_del = 0
					  AND u.is_del = 0
					LIMIT 1
				`)
				.bind(normalizedEmail).first();
			return linkedRow?.avatar || '';
		} catch {
			return '';
		}
	},


	async updateSignature(c, params, userId) {
		const { signature } = params;
		// ensure column exists (idempotent — silently skips if already added)
		await ensureUserSignature(c);
		await c.env.db
			.prepare('UPDATE user SET signature = ? WHERE user_id = ?')
			.bind(signature ?? '', userId).run();
	},

	async updateSignatures(c, params, userId) {
		const items = params?.items;
		if (!Array.isArray(items) || items.length > MAX_SIGNATURES) {
			throw new BizError(t('invalidSignatures'));
		}
		const seen = new Set();
		const clean = items.map(item => {
			const id = item?.id;
			const name = typeof item?.name === 'string' ? item.name.trim() : '';
			const html = typeof item?.html === 'string' ? item.html : '';
			if (typeof id !== 'string' || !SIGNATURE_ID_PATTERN.test(id) || seen.has(id)
				|| name.length > MAX_SIGNATURE_NAME || html.length > MAX_SIGNATURE_HTML) {
				throw new BizError(t('invalidSignatures'));
			}
			seen.add(id);
			return { id, name, html };
		});
		const pick = id => (id == null || id === '' ? null : id);
		const newId = pick(params.newId);
		const replyId = pick(params.replyId);
		if ((newId !== null && !seen.has(newId)) || (replyId !== null && !seen.has(replyId))) {
			throw new BizError(t('invalidSignatures'));
		}
		const rawBy = params.bySender ?? {};
		if (typeof rawBy !== 'object' || Array.isArray(rawBy) || Object.keys(rawBy).length > MAX_SENDER_BINDINGS) {
			throw new BizError(t('invalidSignatures'));
		}
		const bySender = {};
		for (const [addr, id] of Object.entries(rawBy)) {
			const key = String(addr).trim().toLowerCase();
			if (!key.includes('@') || key.length > 254 || (id !== '' && !seen.has(id))) {
				throw new BizError(t('invalidSignatures'));
			}
			bySender[key] = id;
		}
		const data = { items: clean, newId, replyId, bySender };
		await c.env.db
			.prepare(`INSERT INTO psg_user_signature (user_id, data) VALUES (?, ?)
				ON CONFLICT(user_id) DO UPDATE SET data = excluded.data`)
			.bind(userId, JSON.stringify(data)).run();
		// Keep the legacy column on the new-mail default.
		const legacy = clean.find(i => i.id === newId)?.html || '';
		try {
			await userService.updateSignature(c, { signature: legacy }, userId);
		} catch {}
		return data;
	},

	async updateUndoSendSeconds(c, params, userId) {
		const seconds = params?.seconds;
		if (!Number.isInteger(seconds) || !UNDO_SEND_SECONDS_OPTIONS.includes(seconds)) {
			throw new BizError(t('invalidUndoSendSeconds'));
		}
		await c.env.db
			.prepare(`INSERT INTO psg_user_pref (user_id, undo_send_seconds) VALUES (?, ?)
				ON CONFLICT(user_id) DO UPDATE SET undo_send_seconds = excluded.undo_send_seconds`)
			.bind(userId, seconds).run();
	},

	async updateReplyFromReceived(c, params, userId) {
		if (typeof params?.enabled !== 'boolean') {
			throw new BizError(t('invalidReplyFromReceived'));
		}
		await c.env.db
			.prepare(`INSERT INTO psg_user_pref (user_id, reply_from_received) VALUES (?, ?)
				ON CONFLICT(user_id) DO UPDATE SET reply_from_received = excluded.reply_from_received`)
			.bind(userId, params.enabled ? 1 : 0).run();
	},

	// provider: '' (system default) | 'google' | 'ai'. key: omitted keeps
	// the stored key, '' removes it.
	async updateTranslatePref(c, params, userId) {
		const provider = params?.provider ?? '';
		if (!['', 'google', 'ai'].includes(provider)) {
			throw new BizError(t('invalidTranslateProvider'));
		}
		const key = params?.key;
		if (key !== undefined && (typeof key !== 'string' || key.length > 200 || /\s/.test(key.trim()))) {
			throw new BizError(t('invalidTranslateKey'));
		}
		try {
			if (key === undefined) {
				await c.env.db
					.prepare(`INSERT INTO psg_user_pref (user_id, translate_provider) VALUES (?, ?)
						ON CONFLICT(user_id) DO UPDATE SET translate_provider = excluded.translate_provider`)
					.bind(userId, provider).run();
			} else {
				await c.env.db
					.prepare(`INSERT INTO psg_user_pref (user_id, translate_provider, google_translate_key) VALUES (?, ?, ?)
						ON CONFLICT(user_id) DO UPDATE SET translate_provider = excluded.translate_provider,
						google_translate_key = excluded.google_translate_key`)
					.bind(userId, provider, key.trim()).run();
			}
		} catch (e) {
			// Migration 0015 not applied yet: say so instead of a bare 500.
			console.error('updateTranslatePref failed', e?.message || e);
			throw new BizError(t('translatePrefUnavailable'), 503);
		}
	},

	async directory(c) {
		const { results } = await c.env.db.prepare(`
			SELECT u.email, COALESCE(a.name, '') AS name
			FROM user u
			LEFT JOIN account a ON LOWER(u.email) = LOWER(a.email) AND a.is_del = 0
			WHERE u.status = 0 AND u.is_del = 0
			ORDER BY COALESCE(NULLIF(a.name,''), u.email) ASC
		`).all();
		return results;
	},

	async resetPassword(c, params, userId) {

		const { password } = params;

		if (typeof password !== 'string' || password.length < 8) {
			throw new BizError(t('pwdMinLength'));
		}
		if (password.length > 128) {
			throw new BizError(t('pwdLengthLimit'));
		}
		const { salt, hash } = await cryptoUtils.hashPassword(password);
		await orm(c).update(user).set({ password: hash, salt: salt }).where(eq(user.userId, userId)).run();
	},

	// Progressive migration: re-hash a legacy password after a verified login.
	// Compare-and-set on the old hash so a concurrent password change is never overwritten.
	async upgradePasswordHash(c, userRow, password) {
		const { salt, hash } = await cryptoUtils.hashPassword(password);
		await orm(c).update(user).set({ password: hash, salt })
			.where(and(eq(user.userId, userRow.userId), eq(user.password, userRow.password))).run();
		userRow.password = hash;
		userRow.salt = salt;
	},

	selectByEmail(c, email) {
		return orm(c).select().from(user).where(
			and(
				eq(user.email, email),
				eq(user.isDel, isDel.NORMAL)))
			.get();
	},

	async insert(c, params) {
		const { userId } = await orm(c).insert(user).values({ ...params }).returning().get();
		return userId;
	},

	selectByEmailIncludeDel(c, email) {
		return orm(c).select().from(user).where(sql`${user.email} COLLATE NOCASE = ${email}`).get();
	},

	selectByIdIncludeDel(c, userId) {
		return orm(c).select().from(user).where(eq(user.userId, userId)).get();
	},

	selectById(c, userId) {
		return orm(c).select().from(user).where(
			and(
				eq(user.userId, userId),
				eq(user.isDel, isDel.NORMAL)))
			.get();
	},

	async delete(c, userId) {
		const { syncDelete } = await settingService.query(c);
		if (syncDelete === settingConst.syncDelete.OPEN) {
			await this.physicsDelete(c, { userIds: String(userId) });
			await c.env.kv.delete(kvConst.AUTH_INFO + userId);
			kvCache.del(kvConst.AUTH_INFO + userId);
			return;
		}
		await orm(c).update(user).set({ isDel: isDel.DELETE }).where(eq(user.userId, userId)).run();
		await c.env.kv.delete(kvConst.AUTH_INFO + userId);
		kvCache.del(kvConst.AUTH_INFO + userId);
	},

	async physicsDelete(c, params) {
		let { userIds } = params;
		userIds = userIds.split(',').map(Number);
		await starService.removeByUserIds(c, userIds);
		await accountService.physicsDeleteByUserIds(c, userIds);
		await oauthService.deleteByUserIds(c, userIds);
		await orm(c).delete(user).where(inArray(user.userId, userIds)).run();
		try {
			await c.env.db
				.prepare(`DELETE FROM psg_user_pref WHERE user_id IN (${userIds.map(() => '?').join(',')})`)
				.bind(...userIds).run();
		} catch {}
	},

	async list(c, params) {

		let { num, size, email, timeSort, status } = params;

		size = Number(size);
		num = Number(num);
		timeSort = Number(timeSort);
		params.isDel = Number(params.isDel);
		if (size > 50) {
			size = 50;
		}

		num = (num - 1) * size;

		const conditions = [];

		if (status > -1) {
			conditions.push(eq(user.status, status));
			conditions.push(eq(user.isDel, isDel.NORMAL));
		}


		if (email) {
			conditions.push(sql`${user.email} COLLATE NOCASE LIKE ${'%'+ email + '%'}`);
		}


		if (params.isDel) {
			conditions.push(eq(user.isDel, params.isDel));
		}


		const query = orm(c).select({
			...user,
			username: oauth.username,
			trustLevel: oauth.trustLevel,
			avatar: oauth.avatar,
			oauthName: oauth.name,
			accountName: account.name
		}).from(user)
			.leftJoin(oauth, eq(oauth.userId, user.userId))
			.leftJoin(account, and(
				sql`LOWER(${account.email}) = LOWER(${user.email})`,
				eq(account.isDel, 0)
			))
			.where(and(...conditions));


		if (timeSort) {
			query.orderBy(asc(user.userId));
		} else {
			query.orderBy(desc(user.userId));
		}

		const list = await query.limit(size).offset(num);

		const { total } = await orm(c)
			.select({ total: count() })
			.from(user)
			.where(and(...conditions)).get();
		const userIds = list.map(user => user.userId);

		const types = [...new Set(list.map(user => user.type))];

		const [emailCounts, delEmailCounts, sendCounts, delSendCounts, accountCounts, delAccountCounts, roleList] = await Promise.all([
			emailService.selectUserEmailCountList(c, userIds, emailConst.type.RECEIVE),
			emailService.selectUserEmailCountList(c, userIds, emailConst.type.RECEIVE, isDel.DELETE),
			emailService.selectUserEmailCountList(c, userIds, emailConst.type.SEND),
			emailService.selectUserEmailCountList(c, userIds, emailConst.type.SEND, isDel.DELETE),
			accountService.selectUserAccountCountList(c, userIds),
			accountService.selectUserAccountCountList(c, userIds, isDel.DELETE),
			roleService.selectByIdsHasPermKey(c, types,'email:send')
		]);

		const receiveMap = Object.fromEntries(emailCounts.map(item => [item.userId, item.count]));
		const sendMap = Object.fromEntries(sendCounts.map(item => [item.userId, item.count]));
		const accountMap = Object.fromEntries(accountCounts.map(item => [item.userId, item.count]));

		const delReceiveMap = Object.fromEntries(delEmailCounts.map(item => [item.userId, item.count]));
		const delSendMap = Object.fromEntries(delSendCounts.map(item => [item.userId, item.count]));
		const delAccountMap = Object.fromEntries(delAccountCounts.map(item => [item.userId, item.count]));

		for (const user of list) {

			const userId = user.userId;

			user.receiveEmailCount = receiveMap[userId] || 0;
			user.sendEmailCount = sendMap[userId] || 0;
			user.accountCount = accountMap[userId] || 0;

			user.delReceiveEmailCount = delReceiveMap[userId] || 0;
			user.delSendEmailCount = delSendMap[userId] || 0;
			user.delAccountCount = delAccountMap[userId] || 0;

			const roleIndex = roleList.findIndex(roleRow => user.type === roleRow.roleId);
			let sendAction = {};

			if (roleIndex > -1) {
				sendAction.sendType = roleList[roleIndex].sendType;
				sendAction.sendCount = roleList[roleIndex].sendCount;
				sendAction.hasPerm = true;
			} else {
				sendAction.hasPerm = false;
			}

			if (user.email === c.env.admin) {
				sendAction.sendType = constant.ADMIN_ROLE.sendType;
				sendAction.sendCount = constant.ADMIN_ROLE.sendCount;
				sendAction.hasPerm = true;
				user.type = 0
			}

			user.sendAction = sendAction;
		}

		return { list, total };
	},

	async updateUserInfo(c, userId, recordCreateIp = false) {



		const activeIp = reqUtils.getIp(c);

		const {os, browser, device} = reqUtils.getUserAgent(c);

		const params = {
			os,
			browser,
			device,
			activeIp,
			activeTime: dayjs().format('YYYY-MM-DD HH:mm:ss')
		};

		if (recordCreateIp) {
			params.createIp = activeIp;
		}

		await orm(c)
			.update(user)
			.set(params)
			.where(eq(user.userId, userId))
			.run();
	},

	async setPwd(c, params) {

		const { password, userId } = params;
		await this.resetPassword(c, { password }, userId);
		await c.env.kv.delete(KvConst.AUTH_INFO + userId);
		kvCache.del(KvConst.AUTH_INFO + userId);
	},

	async setStatus(c, params) {

		const { status, userId } = params;

		await orm(c)
			.update(user)
			.set({ status })
			.where(eq(user.userId, userId))
			.run();

		if (status === userConst.status.BAN) {
			await c.env.kv.delete(KvConst.AUTH_INFO + userId);
			kvCache.del(KvConst.AUTH_INFO + userId);
		}
	},

	async setType(c, params) {

		const { type, userId } = params;

		const roleRow = await roleService.selectById(c, type);

		if (!roleRow) {
			throw new BizError(t('roleNotExist'));
		}

		await orm(c)
			.update(user)
			.set({ type })
			.where(eq(user.userId, userId))
			.run();

		kvCache.del('perm:' + userId);  // force fresh perm check on next request

	},

	async incrUserSendCount(c, quantity, userId) {
		await orm(c).update(user).set({
			sendCount: sql`${user.sendCount}
	  +
	  ${quantity}`
		}).where(eq(user.userId, userId)).run();
	},

	async updateAllUserType(c, type, curType) {
		await orm(c)
			.update(user)
			.set({ type })
			.where(eq(user.type, curType))
			.run();
	},

	async add(c, params) {

		const { email, type, password } = params;

		if (!c.env.domain.includes(emailUtils.getDomain(email))) {
			throw new BizError(t('notEmailDomain'));
		}

		if (password.length < 6) {
			throw new BizError(t('pwdMinLength'));
		}

		const accountRow = await accountService.selectByEmailIncludeDel(c, email);

		if (accountRow && accountRow.isDel === isDel.DELETE) {
			throw new BizError(t('isDelUser'));
		}

		if (accountRow) {
			throw new BizError(t('isRegAccount'));
		}

		const role = roleService.selectById(c, type);

		if (!role) {
			throw new BizError(t('roleNotExist'));
		}

		const { salt, hash } = await saltHashUtils.hashPassword(password);

		const userId = await userService.insert(c, { email, password: hash, salt, type });

		await userService.updateUserInfo(c, userId, true);

		await accountService.insert(c, { userId: userId, email, type, name: emailUtils.getName(email) });
	},

	async resetDaySendCount(c) {
		const roleList = await roleService.selectByIdsAndSendType(c, 'email:send', roleConst.sendType.DAY);
		const roleIds = roleList.map(action => action.roleId);
		await orm(c).update(user).set({ sendCount: 0 }).where(inArray(user.type, roleIds)).run();
	},

	async resetSendCount(c, params) {
		await orm(c).update(user).set({ sendCount: 0 }).where(eq(user.userId, params.userId)).run();
	},

	async restore(c, params) {
		const { userId, type } = params
		await orm(c)
			.update(user)
			.set({ isDel: isDel.NORMAL })
			.where(eq(user.userId, userId))
			.run();
		const userRow = await this.selectById(c, userId);
		await accountService.restoreByEmail(c, userRow.email);

		if (type) {
			await emailService.restoreByUserId(c, userId);
			await accountService.restoreByUserId(c, userId);
		}

	},

	listByRegKeyId(c, regKeyId) {
		return orm(c)
			.select({email: user.email,createTime: user.createTime})
			.from(user)
			.where(eq(user.regKeyId, regKeyId))
			.orderBy(desc(user.userId))
			.all();
	}
};

export default userService;
