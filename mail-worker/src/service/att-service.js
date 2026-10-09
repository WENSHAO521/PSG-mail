import { bump } from './ops-metrics';
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

const attService = {

	// ── Object upload with content-hash de-duplication (R2 only) ─────────────────────────────
	// Keys are content hashes, so a key that is already referenced by an attachment row normally
	// has its object stored. In R2 mode we then HEAD it (Class B, ~12x cheaper than a Class A PUT)
	// and skip the PUT when type/disposition/cache headers are identical, so downloads behave
	// exactly as if the object had been re-uploaded. Unreferenced (new) content costs no extra
	// operation. KV/S3 modes always upload.
	async dedupeSkipSet(c, items) {
		const skip = new Set();
		if (!c.env.r2 || (await r2Service.storageType(c)) !== 'R2') return skip;
		const keys = [...new Set(items.map(item => item.key))];
		const referenced = new Set();
		for (let i = 0; i < keys.length; i += 90) {
			const chunk = keys.slice(i, i + 90);
			const { results } = await c.env.db.prepare(
				`SELECT DISTINCT key FROM attachments WHERE key IN (${chunk.map(() => '?').join(',')})`
			).bind(...chunk).all();
			results.forEach(row => referenced.add(row.key));
		}
		const norm = v => v || '';
		await Promise.all(items.filter(item => referenced.has(item.key)).map(async item => {
			const head = await c.env.r2.head(item.key);
			const meta = head?.httpMetadata || {};
			if (head
				&& norm(meta.contentType) === norm(item.metadata.contentType)
				&& norm(meta.contentDisposition) === norm(item.metadata.contentDisposition)
				&& norm(meta.cacheControl) === norm(item.metadata.cacheControl)) {
				skip.add(item.key);
			}
		}));
		return skip;
	},

	// Order: upload (new content) -> insert rows -> verify skipped objects still exist. A delete
	// that removed the last other reference between the dedupe check and the row insert is caught by
	// the verify step (its own re-check sees our row once inserted), so a row never points at
	// a missing object and no object is removed under a live row.
	async storeObjectsAndRows(c, items, insertRows) {
		const skip = await this.dedupeSkipSet(c, items);
		const done = new Set();
		await Promise.all(items.filter(item => !skip.has(item.key) && !done.has(item.key) && done.add(item.key))
			.map(item => r2Service.putObj(c, item.key, item.content, item.metadata)));
		await insertRows();
		for (const item of items) {
			if (!skip.has(item.key) || done.has(item.key)) continue;
			done.add(item.key);
			if (!(await c.env.r2.head(item.key))) {
				await r2Service.putObj(c, item.key, item.content, item.metadata);
			}
		}
	},

	async addAtt(c, attachments) {

		const items = attachments.map(attachment => {
			// The name comes from the sender; keep it out of the header syntax.
			const fileName = String(attachment.filename || '').replace(/[\r\n"\\;]/g, '_')
			const metadate = { contentType: attachment.mimeType }
			if (!attachment.contentId) {
				metadate.contentDisposition = `attachment;filename="${fileName}"`
			} else {
				metadate.contentDisposition = `inline;filename="${fileName}"`
				metadate.cacheControl = `max-age=259200`
			}
			return { key: attachment.key, content: attachment.content, metadata: metadate };
		});

		await this.storeObjectsAndRows(c, items, () => orm(c).insert(att).values(attachments).run());
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

	async toImageUrlHtml(c, content) {

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
			if (src && (src.startsWith(domainUtils.toOssDomain(r2Domain)) || src.startsWith('attachments/'))) {

				const cid = uuidv4().replace(/-/g, '')
				img.setAttribute('src', 'cid:' + cid);

				const attData = {};

				if (src.startsWith(domainUtils.toOssDomain(r2Domain))) {
					attData.key = src.replace(domainUtils.toOssDomain(r2Domain) + '/','');
				}

				if (src.startsWith('attachments/')) {
					attData.key = src;
				}

				attData.contentId = cid;
				attData.type = attConst.type.EMBED;
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
		const keys = [...new Set(imageDataList.filter(item => !item.content).map(item => item.key))];
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

		const items = attList.map(a => ({
			key: a.key,
			content: a.buff,
			metadata: { contentType: a.type, contentDisposition: `attachment;filename=${a.filename}` }
		}));

		await this.storeObjectsAndRows(c, items, () => orm(c).insert(att).values(attDataList).run());

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

	// Deletes the attachment rows matching `fieldName IN fieldValues` and removes a stored object
	// only when no row anywhere still references its key. Objects are content-addressed and shared
	// between mails, so a wrong "unreferenced" verdict would break other users' attachments.
	async removeAttByField(c, fieldName, fieldValues) {

		if (!['email_id', 'user_id', 'account_id'].includes(fieldName)) {
			throw new Error('unsupported attachment field: ' + fieldName);
		}

		const candidateKeys = new Set();

		// Sequential per value inside one batch: a key shared by two rows that are both being
		// deleted is only seen as unreferenced once the second value's rows are gone.
		const sqlList = [];
		fieldValues.forEach(value => {
			sqlList.push(c.env.db.prepare(`SELECT DISTINCT key FROM attachments WHERE ${fieldName} = ?`).bind(value));
			sqlList.push(c.env.db.prepare(`DELETE FROM attachments WHERE ${fieldName} = ?`).bind(value));
		});

		const results = await c.env.db.batch(sqlList);
		results.forEach(r => (r.results || []).forEach(row => candidateKeys.add(row.key)));

		if (candidateKeys.size === 0) return;

		// Re-check right before touching storage (indexed lookup, idx_attachments_key): a new mail
		// may have started referencing the same content since the rows above were deleted.
		const delKeyList = [];
		const keys = [...candidateKeys];
		for (let i = 0; i < keys.length; i += 90) {
			const chunk = keys.slice(i, i + 90);
			const { results: stillUsed } = await c.env.db.prepare(
				`SELECT DISTINCT key FROM attachments WHERE key IN (${chunk.map(() => '?').join(',')})`
			).bind(...chunk).all();
			const used = new Set(stillUsed.map(r => r.key));
			chunk.forEach(key => { if (!used.has(key)) delKeyList.push(key); });
		}

		if (delKeyList.length > 0) {
			try {
				await this.batchDelete(c, delKeyList);
			} catch (e) {
				console.error('删除附件文件失败：', e);
				bump('storage.object_delete_failed');
			}
		}

	},

	// Read-only storage audit for admins: lists one page of stored attachment objects and reports
	// those no attachment row references (orphans). It never deletes anything — removing an object
	// is irreversible on R2/KV, so a person reviews the list first. One page per call (Class A
	// list operation + a few indexed D1 reads); follow `cursor` to continue.
	async auditOrphans(c, { cursor, limit } = {}) {
		const pageSize = Math.min(Math.max(Number(limit) || 200, 1), 500);
		const storage = await r2Service.storageType(c);
		let entries = [];
		let nextCursor = null;

		if (storage === 'R2') {
			const page = await c.env.r2.list({ prefix: constant.ATTACHMENT_PREFIX, limit: pageSize, cursor: cursor || undefined });
			entries = page.objects.map(o => ({ key: o.key, size: o.size, uploaded: o.uploaded?.toISOString?.() || null }));
			nextCursor = page.truncated ? page.cursor : null;
		} else if (storage === 'KV') {
			const page = await c.env.kv.list({ prefix: constant.ATTACHMENT_PREFIX, limit: pageSize, cursor: cursor || undefined });
			entries = page.keys.map(k => ({ key: k.name, size: null, uploaded: null }));
			nextCursor = page.list_complete ? null : page.cursor;
		} else {
			return { storage, supported: false, scanned: 0, orphans: [], cursor: null };
		}

		const referenced = new Set();
		for (let i = 0; i < entries.length; i += 90) {
			const chunk = entries.slice(i, i + 90).map(e => e.key);
			const { results } = await c.env.db.prepare(
				`SELECT DISTINCT key FROM attachments WHERE key IN (${chunk.map(() => '?').join(',')})`
			).bind(...chunk).all();
			results.forEach(row => referenced.add(row.key));
		}

		const orphans = entries.filter(e => !referenced.has(e.key));
		return { storage, supported: true, scanned: entries.length, orphanCount: orphans.length, orphans, cursor: nextCursor };
	},

	async batchDelete(c, keys) {
		if (!keys.length) return;

		const BATCH_SIZE = 1000;

		for (let i = 0; i < keys.length; i += BATCH_SIZE) {
			const batch = keys.slice(i, i + BATCH_SIZE);
			await r2Service.delete(c, batch);
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
