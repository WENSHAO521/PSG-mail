import BizError from '../error/biz-error';
import { runTool, riskFlags, makeToolContext, requiresApproval } from './mail-tools';
import securityAuditService from './security-audit-service';

// Server-side confirmation for sensitive tool calls (send, delete, batch
// moves, anything a future MCP/external writer asks for).
//
//  - The arguments to be executed are stored HERE when the request is made;
//    the client approves an opaque id and can no longer substitute different
//    arguments than the ones it was shown.
//  - Only the authenticated user who the request belongs to can decide it.
//  - A request is decided exactly once: pending -> executing is a conditional
//    UPDATE, so two concurrent "approve" calls (double click, replay) have
//    exactly one winner. Expired, rejected or already-executed ids are inert.
//  - Execution re-runs the tool's own authorization (mailbox access, scope),
//    so approving cannot widen what the user is allowed to do.

const TTL_SECONDS = 5 * 60;

async function sha256Hex(s) {
	const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
	return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function canonical(v) {
	if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
	if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
	return JSON.stringify(v);
}

const aiApprovalService = {

	TTL_SECONDS,

	async request(ctx, tool, args) {
		if (!requiresApproval(tool, args)) throw new BizError('Tool does not need approval', 400);
		const { c, userId } = ctx;
		const flags = await riskFlags(ctx, tool, args);
		const id = crypto.randomUUID();
		const argsJson = JSON.stringify(args);
		const hash = await sha256Hex(canonical(args));
		await c.env.db.prepare(
			`INSERT INTO ai_action_approval (id, user_id, conversation_id, tool, args_json, args_hash, risk_flags, source, expires_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', ?))`
		).bind(id, userId, ctx.conversationId || '', tool, argsJson, hash, JSON.stringify(flags), ctx.source || 'agent', `+${TTL_SECONDS} seconds`).run();
		return { approvalId: id, tool, args, riskFlags: flags, expiresInSeconds: TTL_SECONDS };
	},

	async list(c, userId) {
		const { results } = await c.env.db.prepare(
			`SELECT id, tool, args_json, risk_flags, create_time, expires_at FROM ai_action_approval
			 WHERE user_id = ? AND status = 'pending' AND expires_at > datetime('now') ORDER BY create_time DESC LIMIT 20`
		).bind(userId).all();
		return results.map(r => ({ approvalId: r.id, tool: r.tool, args: JSON.parse(r.args_json), riskFlags: JSON.parse(r.risk_flags), expiresAt: r.expires_at }));
	},

	async reject(c, userId, approvalId) {
		const r = await c.env.db.prepare(
			`UPDATE ai_action_approval SET status = 'rejected', decided_at = CURRENT_TIMESTAMP
			 WHERE id = ? AND user_id = ? AND status = 'pending'`
		).bind(String(approvalId), userId).run();
		if (!r.meta?.changes) throw new BizError('Approval not found, expired, or already decided', 404);
		return { status: 'rejected' };
	},

	async approve(c, userId, approvalId, { scopeAccountIds = null } = {}) {
		const claim = await c.env.db.prepare(
			`UPDATE ai_action_approval SET status = 'executing', decided_at = CURRENT_TIMESTAMP
			 WHERE id = ? AND user_id = ? AND status = 'pending' AND expires_at > datetime('now')`
		).bind(String(approvalId), userId).run();
		if (!claim.meta?.changes) {
			throw new BizError('Approval not found, expired, or already decided', 404);
		}

		const row = await c.env.db.prepare('SELECT * FROM ai_action_approval WHERE id = ? AND user_id = ?').bind(String(approvalId), userId).first();
		const args = JSON.parse(row.args_json);
		// Tamper check: what we execute is what was hashed when requested.
		if (await sha256Hex(canonical(args)) !== row.args_hash) {
			await c.env.db.prepare(`UPDATE ai_action_approval SET status = 'failed', result = 'hash mismatch' WHERE id = ?`).bind(row.id).run();
			throw new BizError('Approval integrity check failed', 409);
		}

		const ctx = makeToolContext(c, userId, { scopeAccountIds, source: row.source, conversationId: row.conversation_id });
		try {
			const result = await runTool(ctx, row.tool, args, { approved: true });
			await c.env.db.prepare(`UPDATE ai_action_approval SET status = 'executed', result = ? WHERE id = ?`).bind(JSON.stringify(result).slice(0, 2000), row.id).run();
			await securityAuditService.log(c, 'ai.action.executed', { userId, detail: { tool: row.tool, approval: row.id.slice(0, 8), source: row.source } });
			return { status: 'executed', tool: row.tool, result, conversationId: row.conversation_id };
		} catch (e) {
			await c.env.db.prepare(`UPDATE ai_action_approval SET status = 'failed', result = ? WHERE id = ?`).bind(String(e?.message || e).slice(0, 500), row.id).run();
			throw e;
		}
	},

	async prune(c) {
		try {
			await c.env.db.prepare(`DELETE FROM ai_action_approval WHERE create_time < datetime('now', '-30 days')`).run();
		} catch (e) { console.warn('approval prune skipped:', e?.message); }
	}
};

export default aiApprovalService;
