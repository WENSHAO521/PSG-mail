import http from '@/axios/index.js';

export function aiAssistantChat(messages) {
    return http.post('/ai-assistant/chat', { messages }, { timeout: 60 * 1000 })
}

export function aiAssistantConfirm(confirmId, approve) {
    return http.post('/ai-assistant/confirm', { confirmId, approve }, { timeout: 60 * 1000 })
}

// ── AI Agent 2.0 (server-side history + approvals; needs AI_AGENT_V2) ──
export function aiAgentStatus() {
    return http.get('/ai-assistant/v2/status', { noMsg: true })
}

export function aiAgentChat(message, conversationId) {
    return http.post('/ai-assistant/v2/chat', { message, conversationId }, { timeout: 90 * 1000 })
}

export function aiAgentDecide(approvalId, approve) {
    return http.post(`/ai-assistant/v2/approvals/${encodeURIComponent(approvalId)}/${approve ? 'approve' : 'reject'}`, {}, { timeout: 60 * 1000 })
}
