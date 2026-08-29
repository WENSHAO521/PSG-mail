import KvConst from '../const/kv-const';
import kvCache, { TTL } from '../cache/kv-cache';
import setting from '../entity/setting';
import orm from '../entity/orm';
import {verifyRecordType} from '../const/entity-const';
import fileUtils from '../utils/file-utils';
import r2Service from './r2-service';
import constant from '../const/constant';
import BizError from '../error/biz-error';
import {t} from '../i18n/i18n'
import verifyRecordService from './verify-record-service';
import userContext from '../security/user-context';
import alibabaDirectmailService from './alibaba-directmail-service';
import verifyUtils from '../utils/verify-utils';

const FEATURE_DEFAULTS = {
	allowPersonalForward: 1,
	allowForwardNotification: 1,
	allowForwardFullCopy: 0,
	allowForwardAttachments: 0,
	forwardMaxAddresses: 3,
	forwardAllowedDomains: '',
	publicAppUrl: '',
	aiDefaultModel: '',
	aiFallbackModel: '',
	aiDailyQuota: 0,
	// Resend/Mailjet observation quotas — app-layer usage ceilings PSG Mail
	// tracks for its own progress bars/warnings, NOT the provider's real
	// account plan (see the sys-setting UI copy shown alongside these). 0
	// means "no quota set," matching aiDailyQuota's convention above.
	resendDailyQuota: 0,
	resendMonthlyQuota: 0,
	mailjetApiKey: '',
	mailjetSecretKey: '',
	mailjetDailyQuota: 0,
	mailjetMonthlyQuota: 0,
	// Alibaba Cloud DirectMail (阿里云邮件推送) — a separate SMTP channel used
	// only for external-email notifications/verification codes (see
	// forwarding-service.js's sendNotificationExternal), never for normal
	// user mail. Host/port/region are fixed constants in
	// alibaba-directmail-service.js, not settings, so an admin can't
	// misconfigure the endpoint for a different Alibaba region. Non-zero
	// quota defaults (unlike Resend/Mailjet's 0) match the spec's example
	// admin-facing defaults; 0 still means "no quota observed" if cleared.
	alibabaSmtpUser: '',
	alibabaSmtpPassword: '',
	alibabaSenderName: 'PSG Mail Notifications',
	alibabaDailyQuota: 2000,
	alibabaMonthlyQuota: 60000,
	// Ported from maillab/cloud-mail v3.1.0. CLOSE (1) preserves the existing
	// isDel soft-delete behavior everywhere unless an admin opts in.
	syncDelete: 1,
};

const FEATURE_COLUMNS = {
	allowPersonalForward: 'allow_personal_forward',
	allowForwardNotification: 'allow_forward_notification',
	allowForwardFullCopy: 'allow_forward_full_copy',
	allowForwardAttachments: 'allow_forward_attachments',
	forwardMaxAddresses: 'forward_max_addresses',
	forwardAllowedDomains: 'forward_allowed_domains',
	publicAppUrl: 'public_app_url',
	aiDefaultModel: 'ai_default_model',
	aiFallbackModel: 'ai_fallback_model',
	aiDailyQuota: 'ai_daily_quota',
	resendDailyQuota: 'resend_daily_quota',
	resendMonthlyQuota: 'resend_monthly_quota',
	mailjetApiKey: 'mailjet_api_key',
	mailjetSecretKey: 'mailjet_secret_key',
	mailjetDailyQuota: 'mailjet_daily_quota',
	mailjetMonthlyQuota: 'mailjet_monthly_quota',
	alibabaSmtpUser: 'alibaba_smtp_user',
	alibabaSmtpPassword: 'alibaba_smtp_password',
	alibabaSenderName: 'alibaba_sender_name',
	alibabaDailyQuota: 'alibaba_daily_quota',
	alibabaMonthlyQuota: 'alibaba_monthly_quota',
	syncDelete: 'sync_delete',
};

// Polling is a recovery path for missed push signals and for Electron. A
// value below this floor creates a request burst without improving delivery
// reliability, so old values (including the legacy 0/1 disabled values) are
// migrated to one safe interval at the settings boundary.
const SAFE_AUTO_REFRESH_SECONDS = 30;

function normalizeAutoRefresh(value) {
	const seconds = Number(value);
	if (!Number.isFinite(seconds) || seconds <= 0) return SAFE_AUTO_REFRESH_SECONDS;
	return Math.max(SAFE_AUTO_REFRESH_SECONDS, Math.round(seconds));
}

function normalizeSettingRow(row) {
	if (!row) return row;
	return { ...row, autoRefresh: normalizeAutoRefresh(row.autoRefresh) };
}

async function readFeatureSetting(c) {
	try {
		const row = await c.env.db.prepare('SELECT * FROM psg_feature_setting WHERE id = 1').first();
		if (!row) return { ...FEATURE_DEFAULTS };
		return {
			allowPersonalForward: Number(row.allow_personal_forward ?? FEATURE_DEFAULTS.allowPersonalForward),
			allowForwardNotification: Number(row.allow_forward_notification ?? FEATURE_DEFAULTS.allowForwardNotification),
			allowForwardFullCopy: Number(row.allow_forward_full_copy ?? FEATURE_DEFAULTS.allowForwardFullCopy),
			allowForwardAttachments: Number(row.allow_forward_attachments ?? FEATURE_DEFAULTS.allowForwardAttachments),
			forwardMaxAddresses: Math.max(1, Number(row.forward_max_addresses ?? FEATURE_DEFAULTS.forwardMaxAddresses)),
			forwardAllowedDomains: row.forward_allowed_domains || '',
			publicAppUrl: row.public_app_url || '',
			aiDefaultModel: row.ai_default_model || '',
			aiFallbackModel: row.ai_fallback_model || '',
			aiDailyQuota: Math.max(0, Number(row.ai_daily_quota ?? FEATURE_DEFAULTS.aiDailyQuota)),
			resendDailyQuota: Math.max(0, Number(row.resend_daily_quota ?? FEATURE_DEFAULTS.resendDailyQuota)),
			resendMonthlyQuota: Math.max(0, Number(row.resend_monthly_quota ?? FEATURE_DEFAULTS.resendMonthlyQuota)),
			mailjetApiKey: row.mailjet_api_key || '',
			mailjetSecretKey: row.mailjet_secret_key || '',
			mailjetDailyQuota: Math.max(0, Number(row.mailjet_daily_quota ?? FEATURE_DEFAULTS.mailjetDailyQuota)),
			mailjetMonthlyQuota: Math.max(0, Number(row.mailjet_monthly_quota ?? FEATURE_DEFAULTS.mailjetMonthlyQuota)),
			alibabaSmtpUser: row.alibaba_smtp_user || '',
			alibabaSmtpPassword: row.alibaba_smtp_password || '',
			alibabaSenderName: row.alibaba_sender_name || FEATURE_DEFAULTS.alibabaSenderName,
			alibabaDailyQuota: Math.max(0, Number(row.alibaba_daily_quota ?? FEATURE_DEFAULTS.alibabaDailyQuota)),
			alibabaMonthlyQuota: Math.max(0, Number(row.alibaba_monthly_quota ?? FEATURE_DEFAULTS.alibabaMonthlyQuota)),
			syncDelete: Number(row.sync_delete ?? FEATURE_DEFAULTS.syncDelete),
		};
	} catch {
		// A deployment can briefly run before the new migration is applied. Keep
		// old settings and old routes usable during that compatibility window.
		return { ...FEATURE_DEFAULTS };
	}
}

const settingService = {

	async refresh(c) {
		const settingRow = await orm(c).select().from(setting).get();
		settingRow.resendTokens = JSON.parse(settingRow.resendTokens);
		settingRow.autoRefresh = normalizeAutoRefresh(settingRow.autoRefresh);
		Object.assign(settingRow, await readFeatureSetting(c));
		c.set('setting', settingRow);
		await c.env.kv.put(KvConst.SETTING, JSON.stringify(settingRow));
		kvCache.del(KvConst.SETTING);  // bust in-memory cache after update
	},

	async query(c) {

		if (c.get?.('setting')) {
			return normalizeSettingRow(c.get('setting'))
		}

		let setting = kvCache.get(KvConst.SETTING);
		if (!setting) {
			setting = await c.env.kv.get(KvConst.SETTING, { type: 'json' });
			if (setting) kvCache.set(KvConst.SETTING, setting, TTL.SETTING);
		}

		// Shallow-clone so mutations below don't corrupt the cached reference
		setting = { ...setting };

		if (!setting) {
			throw new BizError('数据库未初始化 Database not initialized.');
		}

		setting.autoRefresh = normalizeAutoRefresh(setting.autoRefresh);

		// Feature policy lives in its own singleton table so migrations can run
		// before the legacy setting table exists on a brand-new D1 database.
		Object.assign(setting, await readFeatureSetting(c));

		let domainList = c.env.domain;

		if (typeof domainList === 'string') {
			try {
				domainList = JSON.parse(domainList)
			} catch (error) {
				throw new BizError(t('notJsonDomain'));
			}
		}

		if (!c.env.domain) {
			throw new BizError(t('noDomainVariable'));
		}

		domainList = domainList.map(item => '@' + item);
		setting.domainList = domainList;


		let linuxdoSwitch = c.env.linuxdo_switch;
		let projectLink = c.env.project_link;

		if (typeof linuxdoSwitch === 'string' && linuxdoSwitch === 'true') {
			linuxdoSwitch = true
		} else if (linuxdoSwitch === true) {
			linuxdoSwitch = true
		} else {
			linuxdoSwitch = false
		}

		if (typeof projectLink === 'string' && projectLink === 'false') {
			projectLink = false
		} else if (projectLink === false) {
			projectLink = false
		} else {
			projectLink = true
		}

		setting.projectLink = projectLink;

		setting.linuxdoClientId = c.env.linuxdo_client_id;
		setting.linuxdoCallbackUrl = c.env.linuxdo_callback_url;
		setting.linuxdoSwitch = linuxdoSwitch;

		const rawFilter = setting.emailPrefixFilter
		setting.emailPrefixFilter = Array.isArray(rawFilter)
			? rawFilter
			: (rawFilter || '').split(',').filter(Boolean);

		c.set?.('setting', setting);
		return setting;
	},

	async get(c, showSiteKey = false) {

		const [settingRow, recordList] = await Promise.all([
			await this.query(c),
			verifyRecordService.selectListByIP(c)
		]);


		if (!showSiteKey) {
			settingRow.siteKey = settingRow.siteKey ? `${settingRow.siteKey.slice(0, 6)}******` : null;
		}

		settingRow.secretKey = settingRow.secretKey ? `${settingRow.secretKey.slice(0, 6)}******` : null;

		settingRow.resendTokens = { ...settingRow.resendTokens };
		Object.keys(settingRow.resendTokens).forEach(key => {
			settingRow.resendTokens[key] = `${settingRow.resendTokens[key].slice(0, 12)}******`;
		});

		settingRow.s3AccessKey = settingRow.s3AccessKey ? `${settingRow.s3AccessKey.slice(0, 12)}******` : null;
		settingRow.s3SecretKey = settingRow.s3SecretKey ? `${settingRow.s3SecretKey.slice(0, 12)}******` : null;
		settingRow.tgBotToken = settingRow.tgBotToken ? `${settingRow.tgBotToken.slice(0, 20)}******` : null;
		settingRow.mailjetApiKey = settingRow.mailjetApiKey ? `${settingRow.mailjetApiKey.slice(0, 12)}******` : null;
		settingRow.mailjetSecretKey = settingRow.mailjetSecretKey ? `${settingRow.mailjetSecretKey.slice(0, 12)}******` : null;
		// SMTP password for a real mailbox — unlike the API-key-shaped secrets
		// above, no partial reveal at all. The frontend only ever learns
		// whether a password is set, never any part of its value.
		settingRow.alibabaSmtpConfigured = !!(settingRow.alibabaSmtpUser && settingRow.alibabaSmtpPassword);
		delete settingRow.alibabaSmtpPassword;
		settingRow.alibabaConnection = {
			host: alibabaDirectmailService.ALIBABA_SMTP_HOST,
			port: alibabaDirectmailService.ALIBABA_SMTP_PORT,
			regionId: alibabaDirectmailService.ALIBABA_REGION_ID,
			regionLabel: alibabaDirectmailService.ALIBABA_REGION_LABEL,
			encryption: 'SSL/TLS',
		};
		settingRow.hasR2 = !!c.env.r2
		settingRow.hasCfEmail = !!c.env.email
		settingRow.hasAi = !!c.env.ai

		let regVerifyOpen = false
		let addVerifyOpen = false

		recordList.forEach(row => {
			if (row.type === verifyRecordType.REG) {
				regVerifyOpen = row.count >= settingRow.regVerifyCount
			}
			if (row.type === verifyRecordType.ADD) {
				addVerifyOpen = row.count >= settingRow.addVerifyCount
			}
		})

		settingRow.regVerifyOpen = regVerifyOpen
		settingRow.addVerifyOpen = addVerifyOpen

		settingRow.storageType = await r2Service.storageType(c);

		return settingRow;
	},

	async set(c, params) {
		const settingData = await this.query(c);
		const featureParams = {};
		for (const key of Object.keys(FEATURE_COLUMNS)) {
			if (Object.prototype.hasOwnProperty.call(params, key)) {
				featureParams[key] = params[key];
				delete params[key];
			}
		}
		let resendTokens = { ...settingData.resendTokens, ...params.resendTokens };
		Object.keys(resendTokens).forEach(domain => {
			if (resendTokens[domain]) resendTokens[domain] = resendTokens[domain].trim();
			if (!resendTokens[domain]) delete resendTokens[domain];
		});

		if (Array.isArray(params.emailPrefixFilter)) {
			params.emailPrefixFilter = params.emailPrefixFilter + '';
		}

		if (Array.isArray(params.aiCodeFilter)) {
			params.aiCodeFilter = params.aiCodeFilter + '';
		}

		if (params.loginDarkenFactor !== undefined) {
			const factor = Number(params.loginDarkenFactor);
			params.loginDarkenFactor = Number.isNaN(factor) ? 0 : Math.min(1, Math.max(0, factor));
		}

		if (Object.prototype.hasOwnProperty.call(params, 'autoRefresh')) {
			params.autoRefresh = normalizeAutoRefresh(params.autoRefresh);
		}

		params.resendTokens = JSON.stringify(resendTokens);
		if (Object.keys(params).length > 0) {
			await orm(c).update(setting).set({ ...params }).returning().get();
		}

		const featureUpdate = {};
		for (const [key, column] of Object.entries(FEATURE_COLUMNS)) {
			if (!Object.prototype.hasOwnProperty.call(featureParams, key)) continue;
			let value = featureParams[key];
			if (['forwardAllowedDomains', 'publicAppUrl', 'aiDefaultModel', 'aiFallbackModel', 'mailjetApiKey', 'mailjetSecretKey', 'alibabaSmtpUser', 'alibabaSmtpPassword', 'alibabaSenderName'].includes(key)) {
				value = Array.isArray(value) ? value.join(',') : String(value ?? '').trim();
				// alibabaSmtpUser (发信地址) ends up interpolated into raw SMTP
				// command lines (MAIL FROM:<...>) and MIME headers in
				// alibaba-directmail-service.js — reject anything that isn't a
				// plain email address here, at the point it's saved, rather than
				// trusting it downstream.
				if (key === 'alibabaSmtpUser' && value && !verifyUtils.isEmail(value)) {
					throw new BizError('请输入有效的阿里云邮件推送发信地址', 400);
				}
			} else {
				value = Math.max(0, Number(value));
				if (key === 'forwardMaxAddresses') value = Math.min(20, Math.max(1, value || 3));
			}
			featureUpdate[column] = value;
		}
		if (Object.keys(featureUpdate).length > 0) {
			try {
				const assignments = Object.keys(featureUpdate).map(key => `${key} = ?`).join(', ');
				await c.env.db.prepare(
					`UPDATE psg_feature_setting SET ${assignments}, updated_at = CURRENT_TIMESTAMP WHERE id = 1`
				).bind(...Object.values(featureUpdate)).run();
			} catch (error) {
				if (!/no such table/i.test(error?.message || '')) throw error;
			}
		}
		await this.refresh(c);
	},

	async deleteBackground(c) {

		const { background } = await this.query(c);
		if (!background) return

		if (background.startsWith('http')) {
			await orm(c).update(setting).set({ background: '' }).run();
			await this.refresh(c)
			return;
		}

		if (background) {
			await r2Service.delete(c,background)
			await orm(c).update(setting).set({ background: '' }).run();
			await this.refresh(c)
		}
	},

	async setBackground(c, params) {

		let { background } = params

		await this.deleteBackground(c);

		if (background && !background.startsWith('http')) {

			const file = fileUtils.base64ToFile(background)

			const arrayBuffer = await file.arrayBuffer();
			background = constant.BACKGROUND_PREFIX + await fileUtils.getBuffHash(arrayBuffer) + fileUtils.getExtFileName(file.name);


			await r2Service.putObj(c, background, arrayBuffer, {
				contentType: file.type,
				cacheControl: `public, max-age=31536000, immutable`,
				contentDisposition: `inline; filename="${file.name}"`
			});

		}

		await orm(c).update(setting).set({ background }).run();
		await this.refresh(c);
		return background;
	},


	async setBlacklist(c, params) {
		const { blackSubject, blackContent, blackFrom  } = params
		await orm(c).update(setting).set({ blackSubject, blackContent, blackFrom }).run();
		await this.refresh(c);
		return this.get(c);
	},

	async websiteConfig(c) {

		const settingRow = await this.get(c, true);
		const token = await userContext.getToken(c);
		// loginDomain hides the domain suffix from the *login* page to stop
		// domain enumeration by anyone just visiting it. Registration can't
		// honor that hiding, though — a registrant must be told which of
		// domainList's suffixes their new address will get, since they can't
		// pick an arbitrary one. The frontend marks that intent with
		// ?forRegister=1 (only sent once the user actually switches to the
		// register tab); only bypass the hide when registration is open, so
		// a closed registration form can't be used to probe domains.
		const forRegister = c.req.query('forRegister') === '1' && settingRow.register === 0;

		return {
			register: settingRow.register,
			title: settingRow.title,
			manyEmail: settingRow.manyEmail,
			addEmail: settingRow.addEmail,
			autoRefresh: settingRow.autoRefresh,
			// VAPID public keys are safe to expose and are needed by the browser
			// to subscribe. Keeping this in the existing config response prevents
			// a second client request and avoids build-time key drift.
			webPushVapidPublicKey: c.env.VAPID_PUBLIC_KEY || '',
			addEmailVerify: settingRow.addEmailVerify,
			registerVerify: settingRow.registerVerify,
			send: settingRow.send,
			r2Domain: settingRow.r2Domain,
			siteKey: settingRow.siteKey,
			background: settingRow.background,
			loginOpacity: settingRow.loginOpacity,
			loginDarkenFactor: settingRow.loginDarkenFactor,
			domainList: settingRow.loginDomain === 1 && !token && !forRegister ? [] : settingRow.domainList,
			regKey: settingRow.regKey,
			regVerifyOpen: settingRow.regVerifyOpen,
			addVerifyOpen: settingRow.addVerifyOpen,
			noticeTitle: settingRow.noticeTitle,
			noticeContent: settingRow.noticeContent,
			noticeType: settingRow.noticeType,
			noticeDuration: settingRow.noticeDuration,
			noticePosition: settingRow.noticePosition,
			noticeWidth: settingRow.noticeWidth,
			noticeOffset: settingRow.noticeOffset,
			notice: settingRow.notice,
			loginDomain: settingRow.loginDomain,
			linuxdoClientId: settingRow.linuxdoClientId,
			linuxdoCallbackUrl: settingRow.linuxdoCallbackUrl,
			linuxdoSwitch: settingRow.linuxdoSwitch,
			minEmailPrefix: settingRow.minEmailPrefix,
			projectLink: settingRow.projectLink,
			autoDeleteDays: settingRow.autoDeleteDays
		};
	},

};

export default settingService;
