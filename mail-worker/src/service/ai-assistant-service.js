import emailService from './email-service';
import attService from './att-service';
import accountService from './account-service';
import r2Service from './r2-service';
import settingService from './setting-service';
import BizError from '../error/biz-error';
import { t } from '../i18n/i18n';
import { emailConst, settingConst } from '../const/entity-const';

const MAX_STEPS = 8;
const CONFIRM_TTL = 300; // seconds
const CONFIRM_TOOLS = new Set(['sendEmail', 'deleteEmail']);
const TEXT_ATTACHMENT_TYPES = ['text/plain', 'text/csv', 'application/json'];
const MAX_ATTACHMENT_TEXT_SIZE = 50 * 1024;

const SYSTEM_PROMPT = `You are the mail assistant built into a webmail app. You can read, search and summarize the
current user's own email, and — only after the user explicitly confirms — send a new email or delete one.
Never invent email content you have not actually read via a tool call. Keep replies concise. Always respond
in the same language the user is writing in.`;

const TOOLS = [
	{
		type: 'function',
		function: {
			name: 'listEmails',
			description: 'List the most recent emails in the inbox or sent folder.',
			parameters: {
				type: 'object',
				properties: {
					folder: { type: 'string', enum: ['inbox', 'sent'], description: 'Which folder to list' },
					limit: { type: 'number', description: 'Max emails to return (default 10, max 30)' }
				},
				required: ['folder']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'searchEmails',
			description: 'Search the current user\'s own emails by subject or sender address.',
			parameters: {
				type: 'object',
				properties: {
					query: { type: 'string', description: 'Text to search for in the subject or sender address' },
					limit: { type: 'number', description: 'Max results (default 10, max 30)' }
				},
				required: ['query']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'getEmail',
			description: 'Read the full content of one email, including its attachment list, by emailId.',
			parameters: {
				type: 'object',
				properties: {
					emailId: { type: 'number', description: 'The emailId to read' }
				},
				required: ['emailId']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'getAttachmentText',
			description: 'Read the text content of a plain-text/CSV/JSON attachment (max 50KB) on a given email.',
			parameters: {
				type: 'object',
				properties: {
					emailId: { type: 'number', description: 'The emailId the attachment belongs to' },
					attId: { type: 'number', description: 'The attId returned by getEmail' }
				},
				required: ['emailId', 'attId']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'sendEmail',
			description: 'Send an email from one of the user\'s own mailboxes. Requires explicit user confirmation before it actually sends.',
			parameters: {
				type: 'object',
				properties: {
					from: { type: 'string', description: 'The user\'s own mailbox address to send from' },
					to: { type: 'string', description: 'Recipient address(es), comma-separated' },
					cc: { type: 'string', description: 'CC address(es), comma-separated' },
					subject: { type: 'string' },
					content: { type: 'string', description: 'The email body (plain text or simple HTML)' }
				},
				required: ['from', 'to', 'subject', 'content']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'deleteEmail',
			description: 'Move an email to trash (soft delete). Requires explicit user confirmation before it actually deletes.',
			parameters: {
				type: 'object',
				properties: {
					emailId: { type: 'number' }
				},
				required: ['emailId']
			}
		}
	}
];

function toArray(v) {
	if (!v) return [];
	if (Array.isArray(v)) return v;
	return String(v).split(',').map(s => s.trim()).filter(Boolean);
}

function trimText(str, max = 4000) {
	if (!str) return '';
	return str.length > max ? str.slice(0, max) + '…' : str;
}

const TOOL_IMPL = {

	async listEmails(c, userId, args) {
		const folder = args.folder === 'sent' ? emailConst.type.SEND : emailConst.type.RECEIVE;
		const { list } = await emailService.list(c, {
			emailId: 0, accountId: 0, allReceive: 1, timeSort: 0,
			size: Math.min(Number(args.limit) || 10, 30),
			type: folder
		}, userId);
		return list.map(e => ({
			emailId: e.emailId, subject: e.subject, from: e.sendEmail, to: e.toEmail,
			createTime: e.createTime, unread: e.unread
		}));
	},

	async searchEmails(c, userId, args) {
		const rows = await emailService.searchOwned(c, userId, { query: args.query, limit: args.limit });
		return rows.map(r => ({
			emailId: r.email_id, subject: r.subject, from: r.send_email,
			to: r.to_email, createTime: r.create_time, isDeleted: !!r.is_del
		}));
	},

	async getEmail(c, userId, args) {
		const row = await emailService.getOwned(c, args.emailId, userId);
		if (!row) throw new BizError(t('emailNotExist'), 404);
		const attachments = await attService.list(c, { emailId: row.email_id }, userId);
		return {
			emailId: row.email_id,
			subject: row.subject,
			from: row.send_email,
			to: row.to_email,
			createTime: row.create_time,
			text: trimText(row.text || ''),
			attachments: attachments.map(a => ({ attId: a.attId, filename: a.filename, mimeType: a.mimeType, size: a.size }))
		};
	},

	async getAttachmentText(c, userId, args) {
		const attachments = await attService.list(c, { emailId: args.emailId }, userId);
		const att = attachments.find(a => a.attId === Number(args.attId));
		if (!att) throw new BizError(t('emailNotExist'), 404);
		if (!TEXT_ATTACHMENT_TYPES.includes(att.mimeType)) {
			return { error: 'Unsupported attachment type for text extraction: ' + att.mimeType };
		}
		if (att.size > MAX_ATTACHMENT_TEXT_SIZE) {
			return { error: 'Attachment too large to read (max 50KB)' };
		}
		const obj = await r2Service.getObj(c, att.key);
		if (!obj) return { error: 'Attachment content not found' };
		const text = await obj.text();
		return { filename: att.filename, text: trimText(text, 8000) };
	},

	// Confirmation-gated — only ever invoked from confirm(), never from the
	// autonomous tool-call loop in chat().
	async sendEmail(c, userId, args) {
		const accountRow = await accountService.selectByEmailIncludeDel(c, args.from);
		if (!accountRow) throw new BizError(t('senderAccountNotExist'), 404);
		const emailResult = await emailService.send(c, {
			accountId: accountRow.accountId,
			receiveEmail: toArray(args.to),
			cc: toArray(args.cc),
			bcc: [],
			subject: args.subject || '',
			text: args.content || '',
			content: args.content || '',
			attachments: []
		}, userId);
		return { sent: true, emailId: emailResult[0]?.emailId };
	},

	// Confirmation-gated — see note above.
	async deleteEmail(c, userId, args) {
		const row = await emailService.getOwned(c, args.emailId, userId);
		if (!row) throw new BizError(t('emailNotExist'), 404);
		await emailService.delete(c, { emailIds: String(args.emailId) }, userId);
		return { deleted: true, emailId: args.emailId };
	}
};

function parseToolCalls(resp) {
	const calls = resp?.tool_calls || resp?.response?.tool_calls || [];
	return calls.map(call => {
		const name = call.name || call.function?.name;
		let args = call.arguments ?? call.function?.arguments ?? {};
		if (typeof args === 'string') {
			try { args = JSON.parse(args); } catch { args = {}; }
		}
		return { name, args };
	}).filter(c => !!c.name);
}

function replyText(resp) {
	return resp?.response || resp?.result?.response || '';
}

const aiAssistantService = {

	async assertEnabled(c) {
		const { aiAssistantStatus } = await settingService.query(c);
		if (Number(aiAssistantStatus) !== settingConst.aiAssistantStatus.OPEN) {
			throw new BizError(t('aiAssistantDisabled'), 403);
		}
		if (!c.env.ai) {
			throw new BizError('AI binding not configured', 503);
		}
	},

	async chat(c, userId, history) {
		await this.assertEnabled(c);
		const convo = [{ role: 'system', content: SYSTEM_PROMPT }, ...history];
		return await this._runLoop(c, userId, convo, 0);
	},

	async confirm(c, userId, confirmId, approve) {
		await this.assertEnabled(c);
		const key = 'pending_action:' + confirmId;
		const pending = await c.env.kv.get(key, { type: 'json' });
		if (!pending || pending.userId !== userId) {
			throw new BizError(t('aiAssistantConfirmExpired'), 404);
		}
		await c.env.kv.delete(key);

		if (!approve) {
			const convo = pending.convo.concat([
				{ role: 'tool', name: pending.name, content: JSON.stringify({ cancelled: true }) }
			]);
			return await this._runLoop(c, userId, convo, pending.stepsUsed);
		}

		const toolResult = await TOOL_IMPL[pending.name](c, userId, pending.args);
		const convo = pending.convo.concat([
			{ role: 'tool', name: pending.name, content: JSON.stringify(toolResult) }
		]);
		return await this._runLoop(c, userId, convo, pending.stepsUsed);
	},

	async _runLoop(c, userId, convo, stepsUsed) {
		const model = c.env.ai_assistant_model || c.env.ai_model || '@cf/meta/llama-3.1-8b-instruct';
		const ai = c.env.ai;

		for (let step = stepsUsed; step < MAX_STEPS; step++) {
			const resp = await ai.run(model, { messages: convo, tools: TOOLS });
			const toolCalls = parseToolCalls(resp);

			if (toolCalls.length === 0) {
				return { reply: replyText(resp) };
			}

			convo.push({ role: 'assistant', content: replyText(resp), tool_calls: toolCalls });

			for (const call of toolCalls) {
				if (CONFIRM_TOOLS.has(call.name)) {
					const confirmId = crypto.randomUUID();
					await c.env.kv.put('pending_action:' + confirmId, JSON.stringify({
						userId, name: call.name, args: call.args, convo, stepsUsed: step + 1
					}), { expirationTtl: CONFIRM_TTL });
					return { pendingConfirmation: { confirmId, tool: call.name, args: call.args } };
				}

				let toolResult;
				try {
					toolResult = await TOOL_IMPL[call.name](c, userId, call.args);
				} catch (e) {
					toolResult = { error: e.message || String(e) };
				}
				convo.push({ role: 'tool', name: call.name, content: JSON.stringify(toolResult) });
			}
		}

		throw new BizError(t('aiAssistantTooManySteps'), 400);
	}
};

export default aiAssistantService;
