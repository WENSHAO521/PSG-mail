import emailService from './email-service';
import attService from './att-service';
import labelService from './label-service';
import r2Service from './r2-service';
import threadService from './thread-service';
import BizError from '../error/biz-error';
import verifyUtils from '../utils/verify-utils';
import emailUtils from '../utils/email-utils';
import { detectInjection } from './ai-safety';

// The single implementation of "what a mail agent may do", shared by the
// built-in assistant and (P2) the MCP server so the two can never drift into
// different read/write rules.
//
// Every tool runs as { userId, scope } where userId is the AUTHENTICATED user
// (never a model- or client-supplied value) and scope optionally narrows the
// mailboxes further (MCP client grants, a conversation pinned to one
// mailbox). Authorization is enforced here, per call, on the server:
//   - mail is reachable only through the same own/shared-mailbox rule as the
//     normal mail APIs, intersected with the scope;
//   - ids the caller cannot reach are silently dropped from batches and
//     reported as `skipped`, or rejected for single-id tools;
//   - tools marked risk 'sensitive' (or whose needsApproval(args) is true)
//     refuse to run unless the caller passes { approved: true }, which only
//     ai-approval-service sets after a stored, single-use user approval.

const MAX_IDS = 50;
const MAX_RECIPIENTS = 20;
const TEXT_ATTACHMENT_TYPES = ['text/plain', 'text/csv', 'application/json'];
const MAX_ATTACHMENT_TEXT = 50 * 1024;

const FOLDERS = {
	inbox: 'type = 0 AND is_del = 0 AND is_archive = 0 AND is_spam = 0 AND status != 6',
	sent: 'type = 1 AND is_del = 0',
	archive: 'is_archive = 1 AND is_del = 0 AND status != 6',
	spam: 'is_spam = 1 AND is_del = 0 AND status != 6',
	trash: 'is_del = 1 AND status != 6',
	all: 'is_del = 0 AND status != 6',
};

export function makeToolContext(c, userId, { scopeAccountIds = null, source = 'agent', conversationId = '' } = {}) {
	return { c, userId: Number(userId), scopeAccountIds: scopeAccountIds ? new Set(scopeAccountIds.map(Number)) : null, source, conversationId, tainted: false };
}

// ── authorization helpers ──────────────────────────────────────────────
async function access(ctx) {
	if (ctx._access) return ctx._access;
	const { c, userId } = ctx;
	const { results } = await c.env.db.prepare('SELECT account_id FROM account_share WHERE user_id = ?').bind(userId).all();
	const shared = results.map(r => r.account_id);
	let sql = shared.length ? `(user_id = ? OR account_id IN (${shared.map(() => '?').join(',')}))` : 'user_id = ?';
	let binds = [userId, ...shared];
	if (ctx.scopeAccountIds) {
		const ids = [...ctx.scopeAccountIds];
		sql = ids.length ? `${sql} AND account_id IN (${ids.map(() => '?').join(',')})` : '0 = 1';
		binds = ids.length ? [...binds, ...ids] : [];
	}
	ctx._access = { sql, binds };
	return ctx._access;
}

async function ownedEmail(ctx, emailId) {
	const { sql, binds } = await access(ctx);
	const row = await ctx.c.env.db.prepare(`SELECT * FROM email WHERE email_id = ? AND ${sql}`).bind(Number(emailId), ...binds).first();
	if (!row) throw new BizError('Email not found or not accessible', 404);
	return row;
}

async function accessibleIds(ctx, ids) {
	ids = [...new Set((Array.isArray(ids) ? ids : String(ids ?? '').split(',')).map(Number).filter(n => Number.isInteger(n) && n > 0))];
	if (ids.length > MAX_IDS) throw new BizError(`At most ${MAX_IDS} emails per call`, 400);
	if (!ids.length) throw new BizError('emailIds required', 400);
	const { sql, binds } = await access(ctx);
	const { results } = await ctx.c.env.db.prepare(
		`SELECT email_id FROM email WHERE email_id IN (${ids.map(() => '?').join(',')}) AND ${sql}`
	).bind(...ids, ...binds).all();
	const ok = new Set(results.map(r => r.email_id));
	return { ids: ids.filter(i => ok.has(i)), skipped: ids.filter(i => !ok.has(i)) };
}

// Mailbox the caller may act from: own or shared, inside the scope.
async function accountFor(ctx, { accountId, from }) {
	const { c, userId } = ctx;
	let row;
	if (accountId) {
		row = await c.env.db.prepare('SELECT account_id, email, user_id FROM account WHERE account_id = ? AND is_del = 0').bind(Number(accountId)).first();
	} else if (from) {
		row = await c.env.db.prepare('SELECT account_id, email, user_id FROM account WHERE email = ? COLLATE NOCASE AND is_del = 0').bind(String(from)).first();
	}
	if (!row) throw new BizError('Mailbox not found', 404);
	if (ctx.scopeAccountIds && !ctx.scopeAccountIds.has(row.account_id)) throw new BizError('Mailbox is outside the granted scope', 403);
	if (row.user_id !== userId) {
		const shared = await c.env.db.prepare('SELECT 1 AS ok FROM account_share WHERE account_id = ? AND user_id = ?').bind(row.account_id, userId).first();
		if (!shared) throw new BizError('Mailbox not found', 404);
	}
	return row;
}

function addrList(v, label) {
	const list = (Array.isArray(v) ? v : String(v ?? '').split(/[,;]/)).map(s => String(s).trim()).filter(Boolean);
	if (list.length > MAX_RECIPIENTS) throw new BizError(`Too many ${label} recipients (max ${MAX_RECIPIENTS})`, 400);
	for (const a of list) if (!verifyUtils.isEmail(a)) throw new BizError(`Invalid address: ${a}`, 400);
	return list;
}

const clip = (s, n) => (s && s.length > n ? s.slice(0, n) + '…' : s || '');

function summarize(row) {
	return {
		emailId: row.email_id, accountId: row.account_id, subject: row.subject || '',
		from: row.send_email, fromName: row.name || '', to: row.to_email,
		createTime: row.create_time, unread: !!row.unread && row.type === 0, isSent: row.type === 1,
		messageId: row.message_id || undefined,
	};
}

// ── tool table ──────────────────────────────────────────────────────────
const num = (description) => ({ type: 'number', description });
const str = (description) => ({ type: 'string', description });
const ids = { type: 'array', items: { type: 'number' }, description: `emailIds (max ${MAX_IDS})` };

export const TOOLS = {

	listEmails: {
		risk: 'read', untrusted: true,
		description: 'List recent emails in a folder (inbox, sent, archive, spam, trash).',
		parameters: { type: 'object', properties: { folder: { type: 'string', enum: Object.keys(FOLDERS) }, accountId: num('Limit to one mailbox'), unreadOnly: { type: 'boolean' }, limit: num('default 10, max 30'), beforeEmailId: num('Pagination cursor') }, required: [] },
		async run(ctx, a) {
			const { sql, binds } = await access(ctx);
			const folder = FOLDERS[a.folder] ? a.folder : 'inbox';
			const extra = [];
			const eb = [];
			if (a.accountId) { extra.push('account_id = ?'); eb.push(Number(a.accountId)); }
			if (a.unreadOnly) extra.push('unread = 0 AND type = 0');
			if (a.beforeEmailId) { extra.push('email_id < ?'); eb.push(Number(a.beforeEmailId)); }
			const limit = Math.min(Math.max(Number(a.limit) || 10, 1), 30);
			const { results } = await ctx.c.env.db.prepare(
				`SELECT email_id, account_id, subject, send_email, name, to_email, create_time, unread, type, message_id FROM email
				 WHERE ${sql} AND ${FOLDERS[folder]} ${extra.length ? 'AND ' + extra.join(' AND ') : ''} ORDER BY email_id DESC LIMIT ?`
			).bind(...binds, ...eb, limit).all();
			return { folder, emails: results.map(summarize) };
		}
	},

	searchEmails: {
		risk: 'read', untrusted: true,
		description: 'Full-text search over subject, sender and body across folders.',
		parameters: { type: 'object', properties: { query: str('Text to find'), folder: { type: 'string', enum: Object.keys(FOLDERS) }, limit: num('default 10, max 30') }, required: ['query'] },
		async run(ctx, a) {
			const q = String(a.query || '').trim().slice(0, 100);
			if (q.length < 2) throw new BizError('query too short', 400);
			const { sql, binds } = await access(ctx);
			const like = `%${q.replace(/[%_\\]/g, m => '\\' + m)}%`;
			const folder = FOLDERS[a.folder] ? a.folder : 'all';
			const { results } = await ctx.c.env.db.prepare(
				`SELECT email_id, account_id, subject, send_email, name, to_email, create_time, unread, type, message_id FROM email
				 WHERE ${sql} AND ${FOLDERS[folder]}
				   AND (subject LIKE ? ESCAPE '\\' OR send_email LIKE ? ESCAPE '\\' OR to_email LIKE ? ESCAPE '\\' OR text LIKE ? ESCAPE '\\')
				 ORDER BY email_id DESC LIMIT ?`
			).bind(...binds, like, like, like, like, Math.min(Math.max(Number(a.limit) || 10, 1), 30)).all();
			return { emails: results.map(summarize) };
		}
	},

	getEmail: {
		risk: 'read', untrusted: true,
		description: 'Read one email (plain text body, headers, attachment list).',
		parameters: { type: 'object', properties: { emailId: num('emailId') }, required: ['emailId'] },
		async run(ctx, a) {
			const row = await ownedEmail(ctx, a.emailId);
			const text = row.text || emailUtils.htmlToText(row.content || '');
			const atts = await attService.list(ctx.c, { emailId: row.email_id }, row.user_id);
			const flags = detectInjection(row.subject, text, row.name);
			if (flags.length) ctx.injectionFlags = [...new Set([...(ctx.injectionFlags || []), ...flags])];
			return {
				...summarize(row), cc: row.cc, inReplyTo: row.in_reply_to || undefined, references: row.relation || undefined,
				text: clip(text, 6000),
				attachments: atts.map(x => ({ attId: x.attId, filename: x.filename, mimeType: x.mimeType, size: x.size })),
				injectionSuspected: flags.length ? flags : undefined,
			};
		}
	},

	getThread: {
		risk: 'read', untrusted: true,
		description: 'Read the whole conversation an email belongs to (Message-ID / In-Reply-To / References, subject only as a guarded fallback).',
		parameters: { type: 'object', properties: { emailId: num('Any email in the thread') }, required: ['emailId'] },
		async run(ctx, a) {
			const seed = await ownedEmail(ctx, a.emailId);
			const { sql, binds } = await access(ctx);
			const thread = await threadService.load(ctx.c, seed, { accessSql: sql, accessBinds: binds });
			const flags = detectInjection(...thread.messages.map(m => m.text));
			if (flags.length) ctx.injectionFlags = [...new Set([...(ctx.injectionFlags || []), ...flags])];
			return {
				matchedBy: thread.matchedBy, truncated: thread.truncated,
				messages: thread.messages.map(m => ({ ...summarize(m), text: clip(m.text || '', 2500) })),
				injectionSuspected: flags.length ? flags : undefined,
			};
		}
	},

	getAttachmentText: {
		risk: 'read', untrusted: true,
		description: 'Read a text/CSV/JSON attachment (max 50KB).',
		parameters: { type: 'object', properties: { emailId: num('emailId'), attId: num('attId from getEmail') }, required: ['emailId', 'attId'] },
		async run(ctx, a) {
			const row = await ownedEmail(ctx, a.emailId);
			const atts = await attService.list(ctx.c, { emailId: row.email_id }, row.user_id);
			const att = atts.find(x => x.attId === Number(a.attId));
			if (!att) throw new BizError('Attachment not found', 404);
			if (!TEXT_ATTACHMENT_TYPES.includes(att.mimeType)) return { error: 'Unsupported attachment type: ' + att.mimeType };
			if (att.size > MAX_ATTACHMENT_TEXT) return { error: 'Attachment too large (max 50KB)' };
			const obj = await r2Service.getObj(ctx.c, att.key);
			if (!obj) return { error: 'Attachment content not found' };
			const text = await obj.text();
			const flags = detectInjection(text);
			if (flags.length) ctx.injectionFlags = [...new Set([...(ctx.injectionFlags || []), ...flags])];
			return { filename: att.filename, text: clip(text, 8000), injectionSuspected: flags.length ? flags : undefined };
		}
	},

	listDrafts: {
		risk: 'read', untrusted: false,
		description: 'List the user\'s open drafts.',
		parameters: { type: 'object', properties: { limit: num('default 20') }, required: [] },
		async run(ctx, a) {
			const { results } = await ctx.c.env.db.prepare(
				`SELECT id, account_id, to_addrs, subject, body, source, reply_to_email_id, update_time FROM mail_draft
				 WHERE user_id = ? AND status = 'draft' ORDER BY id DESC LIMIT ?`
			).bind(ctx.userId, Math.min(Number(a.limit) || 20, 50)).all();
			return { drafts: results.filter(d => !ctx.scopeAccountIds || ctx.scopeAccountIds.has(d.account_id)).map(d => ({ draftId: d.id, accountId: d.account_id, to: JSON.parse(d.to_addrs), subject: d.subject, body: clip(d.body, 4000), source: d.source, replyToEmailId: d.reply_to_email_id, updateTime: d.update_time })) };
		}
	},

	createDraft: {
		risk: 'write', untrusted: false,
		description: 'Save a draft email. Drafts are never sent automatically.',
		parameters: { type: 'object', properties: { accountId: num('Mailbox to send from'), from: str('Or the mailbox address'), to: str('comma-separated'), cc: str('comma-separated'), subject: str(''), body: str('Plain text body'), replyToEmailId: num('If replying to an email') }, required: ['subject', 'body'] },
		async run(ctx, a) {
			let replyTo = null;
			if (a.replyToEmailId) replyTo = await ownedEmail(ctx, a.replyToEmailId);
			const account = await accountFor(ctx, { accountId: a.accountId || replyTo?.account_id, from: a.from });
			const to = a.to ? addrList(a.to, 'to') : (replyTo ? [replyTo.send_email] : []);
			const cc = addrList(a.cc, 'cc');
			const row = await ctx.c.env.db.prepare(
				`INSERT INTO mail_draft (user_id, account_id, to_addrs, cc_addrs, subject, body, reply_to_email_id, source)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`
			).bind(ctx.userId, account.account_id, JSON.stringify(to), JSON.stringify(cc), clip(String(a.subject || ''), 300), clip(withSignature(String(a.body || ''), ctx.signature), 20000), replyTo?.email_id || 0, ctx.draftSource || 'ai').first();
			return { draftId: row.id, accountId: account.account_id, to, status: 'draft' };
		}
	},

	updateDraft: {
		risk: 'write', untrusted: false,
		description: 'Edit an existing draft.',
		parameters: { type: 'object', properties: { draftId: num(''), to: str(''), cc: str(''), subject: str(''), body: str('') }, required: ['draftId'] },
		async run(ctx, a) {
			const d = await ctx.c.env.db.prepare(`SELECT * FROM mail_draft WHERE id = ? AND user_id = ? AND status = 'draft'`).bind(Number(a.draftId), ctx.userId).first();
			if (!d || (ctx.scopeAccountIds && !ctx.scopeAccountIds.has(d.account_id))) throw new BizError('Draft not found', 404);
			await ctx.c.env.db.prepare(
				`UPDATE mail_draft SET to_addrs = ?, cc_addrs = ?, subject = ?, body = ?, update_time = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?`
			).bind(
				a.to !== undefined ? JSON.stringify(addrList(a.to, 'to')) : d.to_addrs,
				a.cc !== undefined ? JSON.stringify(addrList(a.cc, 'cc')) : d.cc_addrs,
				a.subject !== undefined ? clip(String(a.subject), 300) : d.subject,
				a.body !== undefined ? clip(String(a.body), 20000) : d.body,
				d.id, ctx.userId
			).run();
			return { draftId: d.id, status: 'draft' };
		}
	},

	discardDraft: {
		risk: 'write', untrusted: false,
		description: 'Discard a draft.',
		parameters: { type: 'object', properties: { draftId: num('') }, required: ['draftId'] },
		async run(ctx, a) {
			const r = await ctx.c.env.db.prepare(`UPDATE mail_draft SET status = 'discarded', update_time = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND status = 'draft'`).bind(Number(a.draftId), ctx.userId).run();
			if (!r.meta?.changes) throw new BizError('Draft not found', 404);
			return { draftId: Number(a.draftId), status: 'discarded' };
		}
	},

	markRead: {
		risk: 'write', untrusted: false,
		description: 'Mark emails as read or unread.',
		parameters: { type: 'object', properties: { emailIds: ids, read: { type: 'boolean', description: 'default true' } }, required: ['emailIds'] },
		async run(ctx, a) {
			const { ids: ok, skipped } = await accessibleIds(ctx, a.emailIds);
			if (ok.length) {
				await ctx.c.env.db.prepare(`UPDATE email SET unread = ? WHERE email_id IN (${ok.map(() => '?').join(',')})`).bind(a.read === false ? 0 : 1, ...ok).run();
			}
			return { updated: ok, skipped };
		}
	},

	archiveEmail: {
		risk: 'write', untrusted: false,
		needsApproval: (a) => idCount(a.emailIds) > 1,
		description: 'Archive emails. More than one email requires user approval.',
		parameters: { type: 'object', properties: { emailIds: ids }, required: ['emailIds'] },
		async run(ctx, a) {
			const { ids: ok, skipped } = await accessibleIds(ctx, a.emailIds);
			if (ok.length) await emailService.archiveEmail(ctx.c, { emailIds: ok.join(',') }, ctx.userId);
			return { archived: ok, skipped };
		}
	},

	moveEmail: {
		risk: 'write', untrusted: false,
		needsApproval: (a) => idCount(a.emailIds) > 1 || a.to === 'trash',
		description: 'Move emails to inbox, archive, spam or trash. Batches and trash require user approval.',
		parameters: { type: 'object', properties: { emailIds: ids, to: { type: 'string', enum: ['inbox', 'archive', 'spam', 'trash'] } }, required: ['emailIds', 'to'] },
		async run(ctx, a) {
			if (!['inbox', 'archive', 'spam', 'trash'].includes(a.to)) throw new BizError('Invalid destination', 400);
			const { ids: ok, skipped } = await accessibleIds(ctx, a.emailIds);
			if (ok.length) {
				const p = { emailIds: ok.join(',') };
				if (a.to === 'archive') await emailService.archiveEmail(ctx.c, p, ctx.userId);
				else if (a.to === 'spam') await emailService.markSpam(ctx.c, p, ctx.userId);
				else if (a.to === 'trash') await emailService.delete(ctx.c, p, ctx.userId);
				else {
					await emailService.unarchiveEmail(ctx.c, p, ctx.userId);
					await emailService.unmarkSpam(ctx.c, p, ctx.userId);
					await emailService.restore(ctx.c, p, ctx.userId);
				}
			}
			return { moved: ok, to: a.to, skipped };
		}
	},

	manageLabels: {
		risk: 'write', untrusted: false,
		description: 'List, create, apply or remove the user\'s labels.',
		parameters: { type: 'object', properties: { action: { type: 'string', enum: ['list', 'create', 'apply', 'remove'] }, labelId: num(''), name: str('for create'), emailIds: ids }, required: ['action'] },
		async run(ctx, a) {
			if (a.action === 'list') return { labels: (await labelService.list(ctx.c, ctx.userId)).map(l => ({ labelId: l.labelId, name: l.name, emailCount: l.emailCount })) };
			if (a.action === 'create') { const l = await labelService.create(ctx.c, { name: a.name }, ctx.userId); return { labelId: l.labelId, name: l.name }; }
			const { ids: ok, skipped } = await accessibleIds(ctx, a.emailIds);
			if (a.action === 'apply') await labelService.apply(ctx.c, { labelId: a.labelId, emailIds: ok }, ctx.userId);
			else if (a.action === 'remove') await labelService.removeFromEmails(ctx.c, { labelId: a.labelId, emailIds: ok }, ctx.userId);
			else throw new BizError('Invalid action', 400);
			return { action: a.action, emailIds: ok, skipped };
		}
	},

	sendEmail: {
		risk: 'sensitive', untrusted: false,
		needsApproval: () => true,
		description: 'Send an email from one of the user\'s mailboxes. ALWAYS requires explicit user approval of the exact message.',
		parameters: { type: 'object', properties: { accountId: num(''), from: str('mailbox address'), to: str('comma-separated'), cc: str(''), subject: str(''), content: str('body'), draftId: num('draft being sent'), replyToEmailId: num('') }, required: ['to', 'subject', 'content'] },
		async run(ctx, a) {
			const replyTo = a.replyToEmailId ? await ownedEmail(ctx, a.replyToEmailId) : null;
			const account = await accountFor(ctx, { accountId: a.accountId || replyTo?.account_id, from: a.from });
			const to = addrList(a.to, 'to');
			if (!to.length) throw new BizError('Recipient required', 400);
			const cc = addrList(a.cc, 'cc');
			const body = String(a.content ?? '');
			const out = await emailService.send(ctx.c, {
				accountId: account.account_id, receiveEmail: to, cc, bcc: [],
				subject: String(a.subject || ''), text: body,
				content: body.includes('<') && /<\/?[a-z][\s\S]*>/i.test(body) ? body : body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>'),
				attachments: [],
				...(replyTo ? { sendType: 'reply', emailId: replyTo.email_id } : {}),
			}, ctx.userId);
			if (a.draftId) {
				await ctx.c.env.db.prepare(`UPDATE mail_draft SET status = 'sent', update_time = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?`).bind(Number(a.draftId), ctx.userId).run();
			}
			return { sent: true, emailId: out[0]?.emailId };
		}
	},

	deleteEmail: {
		risk: 'sensitive', untrusted: false,
		needsApproval: () => true,
		description: 'Move emails to trash. ALWAYS requires explicit user approval.',
		parameters: { type: 'object', properties: { emailIds: ids }, required: ['emailIds'] },
		async run(ctx, a) {
			const { ids: ok, skipped } = await accessibleIds(ctx, a.emailIds);
			if (ok.length) await emailService.delete(ctx.c, { emailIds: ok.join(',') }, ctx.userId);
			return { deleted: ok, skipped };
		}
	},
};

// The user's configured signature is appended by the server, not left to the
// model, so it is always exact and never duplicated.
function withSignature(body, signature) {
	if (!signature || body.includes(signature)) return body;
	return body.replace(/\s+$/, '') + '\n\n' + signature;
}

function idCount(v) {
	return (Array.isArray(v) ? v : String(v ?? '').split(',')).filter(x => String(x).trim() !== '').length;
}

export function toolNames() {
	return Object.keys(TOOLS);
}

export function toolSchemas(allowed = null) {
	return Object.entries(TOOLS)
		.filter(([name]) => !allowed || allowed.includes(name))
		.map(([name, t]) => ({ type: 'function', function: { name, description: t.description, parameters: t.parameters } }));
}

export function requiresApproval(name, args) {
	const t = TOOLS[name];
	if (!t) return false;
	return t.risk === 'sensitive' || !!t.needsApproval?.(args || {});
}

// Risk hints shown next to an approval request. Computed server-side from
// stored data, never from model output.
export async function riskFlags(ctx, name, args) {
	const flags = [];
	if (ctx.tainted) flags.push('requested_after_reading_untrusted_content');
	if (ctx.injectionFlags?.length) flags.push('injection_suspected');
	if (name === 'sendEmail') {
		const { sql, binds } = await access(ctx);
		for (const addr of [...addrList(args.to, 'to'), ...addrList(args.cc, 'cc')]) {
			const seen = await ctx.c.env.db.prepare(
				`SELECT 1 AS ok FROM email WHERE ${sql} AND (send_email = ? COLLATE NOCASE OR to_email = ? COLLATE NOCASE) LIMIT 1`
			).bind(...binds, addr, addr).first();
			if (!seen) flags.push('new_recipient:' + addr);
		}
	}
	if (name === 'deleteEmail' || (name === 'moveEmail' && args.to === 'trash')) flags.push('deletes_mail');
	return flags;
}

// Executes one tool. `approved` is only ever true when called from
// ai-approval-service after consuming a valid approval.
export async function runTool(ctx, name, args, { approved = false } = {}) {
	const tool = TOOLS[name];
	if (!tool) throw new BizError('Unknown tool: ' + name, 400);
	if (args === null || typeof args !== 'object' || Array.isArray(args)) args = {};
	if (requiresApproval(name, args) && !approved) {
		throw new BizError(`${name} requires user approval`, 403);
	}
	const result = await tool.run(ctx, args);
	if (tool.untrusted) ctx.tainted = true;
	return result;
}

export default { TOOLS, runTool, toolSchemas, toolNames, requiresApproval, riskFlags, makeToolContext };
