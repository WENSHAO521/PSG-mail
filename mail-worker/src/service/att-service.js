import orm from '../entity/orm';
import { att } from '../entity/att';
import { and, eq, isNull, inArray, desc } from 'drizzle-orm';
import r2Service from './r2-service';
import constant from '../const/constant';
import fileUtils from '../utils/file-utils';
import { attConst } from '../const/entity-const';
import { parseHTML } from 'linkedom';
import { v4 as uuidv4 } from 'uuid';
import domainUtils from '../utils/domain-uitls';
import settingService from "./setting-service";
import attachmentAccess from '../security/attachment-access';
import storageConsistencyService from './storage-consistency-service';

function requestOrigin(c) {
	try { return new URL(c.req.url).origin; } catch { return ''; }
}

// Map an <img src> that points at one of OUR stored objects back to its
// storage key: public bucket domain, bare "attachments/<key>", or this
// Worker's own /attachments/ or /api/oss/attachments/ paths (optionally with
// a signed ?exp=&sig= query). Anything else — notably external images that
// merely have "/attachments/" in their path — returns null.
// (3.x tested src.startsWith(toOssDomain(r2Domain)), which is startsWith('')
// — always true — when no bucket domain is set, so every external image in
// an outgoing mail was rewritten to a dangling cid: reference.)
export function siteObjectKey(src, ossPrefix, origin) {
	const KEY_RE = /^attachments\/[A-Za-z0-9._-]+$/;
	const clean = (k) => {
		const key = String(k).split('?')[0].split('#')[0];
		return KEY_RE.test(key) ? key : null;
	};
	if (ossPrefix && src.startsWith(ossPrefix + '/')) return clean(src.slice(ossPrefix.length + 1));
	if (src.startsWith(constant.ATTACHMENT_PREFIX)) return clean(src);
	let url;
	try { url = new URL(src, origin || 'http://invalid.local'); } catch { return null; }
	const sameSite = src.startsWith('/') || (origin && url.origin === origin);
	if (!sameSite) return null;
	const m = url.pathname.match(/^(?:\/api)?(?:\/oss)?\/(attachments\/[^/]+)$/);
	return m ? clean(m[1]) : null;
}

const attService = {

	async addAtt(c, attachments) {

		// Upload all attachments in parallel instead of sequentially
		await Promise.all(attachments.map(attachment => {
			const metadate = { contentType: attachment.mimeType }
			if (!attachment.contentId) {
				metadate.contentDisposition = `attachment;filename=${attachment.filename}`
			} else {
				metadate.contentDisposition = `inline;filename=${attachment.filename}`
				metadate.cacheControl = `max-age=259200`
			}
			return r2Service.putObj(c, attachment.key, attachment.content, metadate)
		}))

		await orm(c).insert(att).values(attachments).run();
	},

	list(c, params, userId) {
		const { emailId } = params;

		return orm(c).select().from(att).where(
			and(
				eq(att.emailId, emailId),
				eq(att.userId, userId),
				eq(att.type, attConst.type.ATT),
				isNull(att.contentId)
			)
		).all();
	},

	async toImageUrlHtml(c, content, user = null) {

		const { r2Domain } = await settingService.query(c);

		const { document } = parseHTML(content);

		const images = Array.from(document.querySelectorAll('img'));

		let imageDataList = [];

		for (const img of images) {

			//邮件正文base64图片转cid附件
			const src = img.getAttribute('src');
			if (src && src.startsWith('data:image')) {
				const file = fileUtils.base64ToFile(src);
				const buff = await file.arrayBuffer();
				const cid = uuidv4().replace(/-/g, '');
				const key = constant.ATTACHMENT_PREFIX + await fileUtils.getBuffHash(buff) + fileUtils.getExtFileName(file.name);

				img.setAttribute('src', 'cid:' + cid);

				const attData = {};
				attData.key = key;
				attData.filename = file.name;
				attData.mimeType = file.type;
				attData.size = file.size;
				attData.buff = buff;
				attData.content = fileUtils.base64ToDataStr(src);
				attData.contentId = cid;

				imageDataList.push(attData);
			}

			//邮件正文站内图片转cid附件
			const siteKey = src ? siteObjectKey(src, domainUtils.toOssDomain(r2Domain), requestOrigin(c)) : null;
			if (siteKey) {
				const cid = uuidv4().replace(/-/g, '')
				const attData = {};
				attData.key = siteKey;
				attData.contentId = cid;
				attData.type = attConst.type.EMBED;
				// src is only swapped to cid: once the key is confirmed
				// readable by the sender (below); otherwise it stays as is.
				attData.img = img;
				imageDataList.push(attData);
			}

			const hasInlineWidth = img.hasAttribute('width');
			const style = img.getAttribute('style') || '';
			const hasStyleWidth = /(^|\s)width\s*:\s*[^;]+/.test(style);

			if (!hasInlineWidth && !hasStyleWidth) {
				const newStyle = (style ? style.trim().replace(/;$/, '') + '; ' : '') + 'max-width: 100%;';
				img.setAttribute('style', newStyle);
			}
		}

		//查询已有内嵌url图片信息
		let keys = [...new Set(imageDataList.filter(item => !item.content).map(item => item.key))];
		// Only objects the sender can already read may be embedded — 3.x
		// accepted any existing key, so a known key of someone else's
		// attachment could be mailed out as a cid attachment.
		if (user) {
			keys = await attachmentAccess.filterAccessible(c, user, keys);
		} else {
			keys = [];
		}
		const dbImageList  = await this.selectOneByKeys(c, keys);

		//设置给当前附件
		await Promise.all(imageDataList.map(async image => {
			if (image.content) {
				return;
			}

			const dbImage = dbImageList.find(dbImage => image.key === dbImage.key);
			if (!dbImage) {
				return;
			}

			image.size = dbImage.size;
			image.filename = dbImage.filename;
			image.mimeType = dbImage.mimeType;
			image.contentType = dbImage.mimeType;

			const obj = await r2Service.getObj(c, image.key);
			if (!obj) {
				return;
			}

			image.content = obj instanceof ArrayBuffer ? obj : await obj.arrayBuffer();
		}))

		imageDataList = imageDataList.filter(image => image.content);
		for (const image of imageDataList) {
			if (image.img) {
				image.img.setAttribute('src', 'cid:' + image.contentId);
				delete image.img;
			}
		}

		return { imageDataList, html: document.toString() };
	},

	async saveSendAtt(c, attList, userId, accountId, emailId) {

		const attDataList = [];

		for (let att of attList) {
			att.buff = fileUtils.base64ToUint8Array(att.content);
			att.key = constant.ATTACHMENT_PREFIX + await fileUtils.getBuffHash(att.buff) + fileUtils.getExtFileName(att.filename);
			const attData = { userId, accountId, emailId };
			attData.key = att.key;
			attData.size = att.buff.length;
			attData.filename = att.filename;
			attData.mimeType = att.type;
			attData.type = attConst.type.ATT;
			attDataList.push(attData);
		}

		await orm(c).insert(att).values(attDataList).run();

		for (let att of attList) {
			await r2Service.putObj(c, att.key, att.buff, {
				contentType: att.type,
				contentDisposition: `attachment;filename=${att.filename}`
			});
		}

	},

	async saveArticleAtt(c, attDataList, userId, accountId, emailId) {

		for (let attData of attDataList) {
			attData.userId = userId;
			attData.emailId = emailId;
			attData.accountId = accountId;
			attData.type = attConst.type.EMBED;
			if (!attData.buff) {
				continue;
			}
			await r2Service.putObj(c, attData.key, attData.buff, {
				contentType: attData.mimeType,
				cacheControl: `max-age=259200`,
				contentDisposition: `inline;filename=${attData.filename}`
			});
			delete attData.buff;
		}

		await orm(c).insert(att).values(attDataList).run();

	},

	async removeByUserIds(c, userIds) {
		await this.removeAttByField(c, 'user_id', userIds);
	},

	async removeByEmailIds(c, emailIds) {
		await this.removeAttByField(c, 'email_id', emailIds);
	},

	selectByEmailIds(c, emailIds) {
		return orm(c).select().from(att).where(
			and(
				inArray(att.emailId, emailIds),
				eq(att.type, attConst.type.ATT)
			))
			.all();
	},

	async removeAttByField(c, fieldName, fieldValues) {

		const sqlList = [];

		fieldValues.forEach(value => {

			sqlList.push(

				c.env.db.prepare(
					`SELECT a.key, a.att_id
						FROM attachments a
							   JOIN (SELECT key
									 FROM attachments
									 GROUP BY key
									 HAVING COUNT (*) = 1) t
									ON a.key = t.key
						WHERE a.${fieldName} = ?;`
					).bind(value)
			)

			sqlList.push(c.env.db.prepare(`DELETE FROM attachments WHERE ${fieldName} = ?`).bind(value))

		});

		const attListResult = await c.env.db.batch(sqlList);

		const delKeyList = attListResult.flatMap(r => r.results ? r.results.map(row => row.key) : []);

		if (delKeyList.length > 0) {
			await this.batchDelete(c, delKeyList);
		}

	},

	// Deletes objects whose attachment rows are already gone. A failing chunk
	// no longer just logs and orphans the objects: its keys are queued in
	// attachment_cleanup_job and retried by the cron (which re-checks that
	// nothing references them first). Never throws — the DB rows are already
	// deleted at this point, so the caller's operation has succeeded.
	async batchDelete(c, keys) {
		if (!keys.length) return;

		// R2 and S3 DeleteObjects accept up to 1000 keys per call; KV deletes
		// are one subrequest each, so keep KV chunks small enough to stay
		// under the per-invocation subrequest limit.
		const storageType = await r2Service.storageType(c).catch(() => 'KV');
		const BATCH_SIZE = storageType === 'KV' ? 40 : 1000;

		for (let i = 0; i < keys.length; i += BATCH_SIZE) {
			const batch = keys.slice(i, i + BATCH_SIZE);
			try {
				await r2Service.delete(c, batch);
			} catch (e) {
				console.error('删除附件文件失败，已加入重试队列：', e?.message);
				await storageConsistencyService.enqueue(c, batch, e);
			}
		}

	},

	async removeByAccountId(c, accountId) {
		await this.removeAttByField(c, "account_id", [accountId])
	},

	selectOneByKeys(c, keys) {
		if (!keys || keys.length === 0) {
			return []
		}
		return orm(c).select().from(att).where(inArray(att.key, keys)).orderBy(desc(att.attId)).groupBy(att.key).all();
	}
};

export default attService;
