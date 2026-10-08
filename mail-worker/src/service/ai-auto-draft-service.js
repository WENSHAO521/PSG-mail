import aiProviderService from './ai-provider-service';
import aiConversationService from './ai-conversation-service';
import receiveGuardService from './receive-guard-service';
import { buildSystemPrompt, logTask } from './ai-agent-service';
import { makeToolContext, runTool } from './mail-tools';
import { wrapUntrusted, detectLanguage, detectInjection } from './ai-safety';
import { normalizeSubject } from './thread-service';

// New-mail auto-draft. Opt-in per user/mailbox (ai_agent_setting
// .auto_draft_enabled) and behind AI_AGENT_V2. It ONLY writes a draft the
// user can review — there is no code path from here to sending — and it
// skips automated mail (RFC 3834 headers, lists, bounces, no-reply senders)
// so it never drafts answers to machines. Academic/editorial replies are
// drafted in neutral wording; the system prompt forbids committing the user
// to decisions, fees or deadlines.

const PER_USER_DAILY_DEFAULT = 50;

function clean(body) {
	return String(body || '')
		.replace(/^\s*```[a-z]*\s*|\s*```\s*$/gi, '')
		.replace(/^\s*(subject|主题|主題|제목|betreff)\s*[:：].*\n+/i, '')
		.trim();
}

const aiAutoDraftService = {

	async maybeDraft(env, account, emailRow, parsed, recipient) {
		const c = { env, get: () => undefined, set: () => {} };
		try {
			if (String(env.AI_AGENT_V2) !== 'true' || !env.ai) return { skipped: 'disabled' };
			const userId = account.userId;
			const settings = await aiConversationService.getSettings(c, userId, account.accountId);
			if (!settings.autoDraftEnabled) return { skipped: 'user_opt_out' };

			const block = receiveGuardService.autoReplyBlockReason(parsed, recipient);
			if (block) return { skipped: block };

			const senderDomain = String(parsed.from?.address || '').split('@')[1]?.toLowerCase() || '';
			if (settings.autoDraftDomains.length && !settings.autoDraftDomains.includes(senderDomain)) return { skipped: 'sender_not_allowed' };

			const existing = await env.db.prepare(`SELECT 1 AS ok FROM mail_draft WHERE reply_to_email_id = ? AND source = 'ai_auto'`).bind(emailRow.emailId).first();
			if (existing) return { skipped: 'already_drafted' };

			const ctx = makeToolContext(c, userId, { scopeAccountIds: [account.accountId], source: 'agent' });
			ctx.signature = settings.signature;
			ctx.draftSource = 'ai_auto';

			const thread = await runTool(ctx, 'getThread', { emailId: emailRow.emailId });
			const latestIncoming = [...thread.messages].reverse().find(m => !m.isSent) || thread.messages.at(-1);
			const language = settings.language !== 'auto' ? settings.language : detectLanguage(latestIncoming?.text || parsed.text || '');

			const transcript = thread.messages.map(m =>
				`From: ${m.from}${m.fromName ? ` (${m.fromName})` : ''}\nDate: ${m.createTime}\nSubject: ${m.subject}\n\n${m.text}`).join('\n\n----\n\n');

			const meta = {};
			const started = Date.now();
			const resp = await aiProviderService.run(c, userId, 'auto_draft', {
				messages: [
					{ role: 'system', content: buildSystemPrompt(settings, { detectedLanguage: language }) + '\n\nTask: write ONLY the body of a reply draft to the most recent incoming message. No subject line, no commentary, no markdown fences. Do not call tools.' },
					{ role: 'user', content: `Conversation (oldest first):\n${wrapUntrusted('thread', transcript, { max: 14000, meta: { matchedBy: thread.matchedBy } })}` },
				],
				temperature: 0.4, max_tokens: 700,
			}, { perTask: true, defaultQuota: Number(env.AI_AUTO_DRAFT_DAILY) || PER_USER_DAILY_DEFAULT, meta });

			const body = clean(aiProviderService.text(resp));
			await logTask(c, { userId, kind: 'auto_draft', name: meta.model, status: body ? 'ok' : 'error', fallbackUsed: meta.fallbackUsed, outputChars: body.length, latencyMs: Date.now() - started, flags: detectInjection(parsed.text || '') });
			if (!body) return { skipped: 'empty_output' };

			const subject = 'Re: ' + (normalizeSubject(emailRow.subject) ? String(emailRow.subject).replace(/^\s*(re|aw|回复|答复)\s*[:：]\s*/i, '') : '');
			const draft = await runTool(ctx, 'createDraft', {
				accountId: account.accountId, replyToEmailId: emailRow.emailId, subject, body,
			});
			return { drafted: true, draftId: draft.draftId, language };
		} catch (e) {
			// Auto-draft must never affect mail delivery.
			console.warn('auto-draft skipped:', e?.message);
			return { skipped: 'error' };
		}
	}
};

export default aiAutoDraftService;
