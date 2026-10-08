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

export function aiAgentGetSettings(accountId) {
    return http.get('/ai-assistant/v2/settings', { params: { accountId: accountId || 0 } })
}

export function aiAgentPutSettings(settings) {
    return http.put('/ai-assistant/v2/settings', settings)
}

export function aiAgentDrafts() {
    return http.get('/ai-assistant/v2/drafts')
}

export function aiAgentDiscardDraft(id) {
    return http.delete(`/ai-assistant/v2/drafts/${encodeURIComponent(id)}`)
}

export function aiAgentClearHistory() {
    return http.delete('/ai-assistant/v2/conversations')
}
