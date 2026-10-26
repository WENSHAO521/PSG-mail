import BizError from '../error/biz-error';
import fileUtils from '../utils/file-utils';
import r2Service from './r2-service';

// Server-side drafts (Drafts folder). A draft is the compose form as JSON;
// its attachments are stored once as objects under draft-att/<userId>/ and
// referenced by key, so saving the same draft again uploads nothing new.

const ENSURE = `CREATE TABLE IF NOT EXISTS psg_draft (
  draft_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  data TEXT NOT NULL DEFAULT '{}',
  create_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`;
let ensured = null;
function ensureTable(c) {
	if (!ensured) ensured = c.env.db.prepare(ENSURE).run().catch(e => { ensured = null; throw e; });
	return ensured;
}

// D1 rows top out at 2 MB; leave room for the rest of the row.
const MAX_DATA_BYTES = 1_500_000;
const MAX_ATTACHMENTS = 10;
const MAX_DRAFTS = 500;

export function draftAttPrefix(userId) {
	return `draft-att/${userId}/`;
}

function toClient(row) {
	let data = {};
	try { data = JSON.parse(row.data || '{}'); } catch {}
	return { ...data, draftId: row.draft_id, createTime: row.create_time, updateTime: row.update_time };
}

const draftService = {

	async list(c, userId) {
		await ensureTable(c);
		const { results } = await c.env.db.prepare(
			'SELECT * FROM psg_draft WHERE user_id = ? ORDER BY draft_id DESC LIMIT ?'
		).bind(userId, MAX_DRAFTS).all();
		return (results || []).map(toClient);
	},

	// Creates (no draftId) or replaces a draft. New attachments arrive with
	// base64 `content`; they are stored and come back as references.
	async save(c, userId, params) {
		await ensureTable(c);
		const { draftId, attachments = [], ...form } = params || {};
		delete form.createTime;
		delete form.updateTime;
		if (!Array.isArray(attachments) || attachments.length > MAX_ATTACHMENTS) {
			throw new BizError('Too many attachments', 400);
		}

		const refs = [];
		for (const att of attachments) {
			if (!att) continue;
			if (att.content) {
				const buff = fileUtils.base64ToUint8Array(String(att.content).replace(/^data:[^,]*,/, '').replace(/\s+/g, ''));
				const key = draftAttPrefix(userId) + await fileUtils.getBuffHash(buff) + fileUtils.getExtFileName(att.filename || '');
				const type = att.contentType || att.type || 'application/octet-stream';
				await r2Service.putObj(c, key, buff, { contentType: type });
				refs.push({ draftAttKey: key, filename: att.filename || 'attachment', size: buff.length, contentType: type });
			} else if (att.draftAttKey && String(att.draftAttKey).startsWith(draftAttPrefix(userId))) {
				refs.push({ draftAttKey: att.draftAttKey, filename: att.filename, size: att.size, contentType: att.contentType });
			} else if (att.attId) {
				refs.push({ attId: att.attId, filename: att.filename, size: att.size, contentType: att.contentType });
			}
		}

		const data = JSON.stringify({ ...form, attachments: refs });
		if (data.length > MAX_DATA_BYTES) throw new BizError('Draft is too large to save', 400);

		let row;
		if (draftId) {
			row = await c.env.db.prepare(
				'UPDATE psg_draft SET data = ?, update_time = CURRENT_TIMESTAMP WHERE draft_id = ? AND user_id = ? RETURNING *'
			).bind(data, Number(draftId), userId).first();
		}
		// A draft deleted elsewhere meanwhile is saved again as a new one.
		if (!row) {
			row = await c.env.db.prepare(
				'INSERT INTO psg_draft (user_id, data) VALUES (?, ?) RETURNING *'
			).bind(userId, data).first();
		}
		return toClient(row);
	},

	async remove(c, userId, draftIds) {
		await ensureTable(c);
		const ids = (Array.isArray(draftIds) ? draftIds : String(draftIds || '').split(','))
			.map(Number).filter(Boolean).slice(0, 90);
		if (!ids.length) return;
		const placeholders = ids.map(() => '?').join(',');
		const { results } = await c.env.db.prepare(
			`SELECT data FROM psg_draft WHERE user_id = ? AND draft_id IN (${placeholders})`
		).bind(userId, ...ids).all();
		await c.env.db.prepare(
			`DELETE FROM psg_draft WHERE user_id = ? AND draft_id IN (${placeholders})`
		).bind(userId, ...ids).run();
		const keys = [];
		for (const row of results || []) {
			try {
				for (const att of JSON.parse(row.data || '{}').attachments || []) {
					if (att?.draftAttKey) keys.push(att.draftAttKey);
				}
			} catch {}
		}
		await this.releaseAttachments(c, userId, keys);
	},

	// Attachment objects of a draft that was sent are no longer needed once
	// no other draft of the user refers to them.
	async releaseAttachments(c, userId, keys) {
		const prefix = draftAttPrefix(userId);
		for (const key of new Set(keys)) {
			if (!String(key).startsWith(prefix)) continue;
			try {
				const used = await c.env.db.prepare(
					'SELECT 1 FROM psg_draft WHERE user_id = ? AND instr(data, ?) > 0 LIMIT 1'
				).bind(userId, key).first();
				if (!used) await r2Service.delete(c, key);
			} catch (e) {
				console.error('release draft attachment failed', key, e);
			}
		}
	},
};

export default draftService;
