import app from '../hono/hono';
import result from '../model/result';
import userContext from '../security/user-context';
import aiAgentService from '../service/ai-agent-service';
import aiApprovalService from '../service/ai-approval-service';
import aiConversationService from '../service/ai-conversation-service';
import settingService from '../service/setting-service';
import { makeToolContext, runTool } from '../service/mail-tools';

// AI Agent 2.0 — everything here is behind AI_AGENT_V2=true (404 otherwise)
// and uses the normal JWT chain; the user id always comes from the session.

const uid = (c) => userContext.getUserId(c);

app.get('/ai-assistant/v2/status', async (c) => {
	return c.json(result.ok({ enabled: aiAgentService.enabled(c) }));
});

app.post('/ai-assistant/v2/chat', async (c) => {
	const body = await c.req.json();
	const data = await aiAgentService.chat(c, uid(c), body || {});
	return c.json(result.ok(data));
});

// Server-Sent Events: progress / tool / approval / delta / done / error.
// Tool steps are not token-streamed; the final answer is emitted as deltas.
app.post('/ai-assistant/v2/chat/stream', async (c) => {
	await aiAgentService.assertEnabled(c);
	const body = (await c.req.json()) || {};
	const userId = uid(c);
	const { readable, writable } = new TransformStream();
	const writer = writable.getWriter();
	const enc = new TextEncoder();
	let chain = Promise.resolve();
	const emit = (ev) => { chain = chain.then(() => writer.write(enc.encode(`event: ${ev.type}\ndata: ${JSON.stringify(ev)}\n\n`))).catch(() => {}); };

	c.executionCtx.waitUntil((async () => {
		try {
			await aiAgentService.chat(c, userId, { ...body, emit });
		} catch (e) {
			emit({ type: 'error', message: e?.name === 'BizError' ? e.message : 'AI request failed', code: e?.code });
		} finally {
			await chain;
			await writer.close().catch(() => {});
		}
	})());

	return new Response(readable, {
		headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' }
	});
});

app.get('/ai-assistant/v2/approvals', async (c) => {
	aiAgentService.assertFlag(c);
	return c.json(result.ok(await aiApprovalService.list(c, uid(c))));
});

app.post('/ai-assistant/v2/approvals/:id/approve', async (c) => {
	return c.json(result.ok(await aiAgentService.decide(c, uid(c), c.req.param('id'), true)));
});

app.post('/ai-assistant/v2/approvals/:id/reject', async (c) => {
	return c.json(result.ok(await aiAgentService.decide(c, uid(c), c.req.param('id'), false)));
});

app.get('/ai-assistant/v2/conversations', async (c) => {
	aiAgentService.assertFlag(c);
	return c.json(result.ok(await aiConversationService.list(c, uid(c), c.req.query('limit'))));
});

app.get('/ai-assistant/v2/conversations/:id/messages', async (c) => {
	aiAgentService.assertFlag(c);
	return c.json(result.ok(await aiConversationService.messages(c, uid(c), c.req.param('id'))));
});

app.delete('/ai-assistant/v2/conversations/:id', async (c) => {
	aiAgentService.assertFlag(c);
	await aiConversationService.remove(c, uid(c), c.req.param('id'));
	return c.json(result.ok());
});

app.delete('/ai-assistant/v2/conversations', async (c) => {
	aiAgentService.assertFlag(c);
	await aiConversationService.removeAll(c, uid(c));
	return c.json(result.ok());
});

app.get('/ai-assistant/v2/settings', async (c) => {
	aiAgentService.assertFlag(c);
	return c.json(result.ok(await aiConversationService.getRaw(c, uid(c), c.req.query('accountId'))));
});

app.put('/ai-assistant/v2/settings', async (c) => {
	aiAgentService.assertFlag(c);
	const body = (await c.req.json()) || {};
	return c.json(result.ok(await aiConversationService.putSettings(c, uid(c), body.accountId, body)));
});

app.get('/ai-assistant/v2/drafts', async (c) => {
	aiAgentService.assertFlag(c);
	const ctx = makeToolContext(c, uid(c));
	return c.json(result.ok(await runTool(ctx, 'listDrafts', { limit: c.req.query('limit') })));
});

app.delete('/ai-assistant/v2/drafts/:id', async (c) => {
	aiAgentService.assertFlag(c);
	const ctx = makeToolContext(c, uid(c));
	return c.json(result.ok(await runTool(ctx, 'discardDraft', { draftId: c.req.param('id') })));
});

// Usage / quota / cost visibility. Cost is reported as provider-neutral
// "units" (request count and ~1k-character input units) — no currency is
// invented; map units to money with your own Workers AI pricing.
app.get('/ai-assistant/v2/usage', async (c) => {
	aiAgentService.assertFlag(c);
	const userId = uid(c);
	const { aiDailyQuota } = await settingService.query(c);
	const db = c.env.db;
	const today = await db.prepare(`SELECT task, request_count, input_units FROM ai_usage WHERE user_id = ? AND usage_date = date('now')`).bind(userId).all();
	const month = await db.prepare(`SELECT COALESCE(SUM(request_count),0) AS requests, COALESCE(SUM(input_units),0) AS units FROM ai_usage WHERE user_id = ? AND usage_date >= date('now','-30 days')`).bind(userId).first();
	const log = await db.prepare(
		`SELECT kind, status, COUNT(*) AS n, COALESCE(SUM(fallback_used),0) AS fallbacks FROM ai_task_log WHERE user_id = ? AND create_time >= datetime('now','-30 days') GROUP BY kind, status`
	).bind(userId).all();
	return c.json(result.ok({
		dailyQuota: Number(aiDailyQuota) || 0,
		today: today.results,
		last30Days: month,
		tasks: log.results,
	}));
});
