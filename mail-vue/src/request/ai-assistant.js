import http from '@/axios/index.js';

export function aiAssistantChat(messages) {
    return http.post('/ai-assistant/chat', { messages }, { timeout: 60 * 1000 })
}

export function aiAssistantConfirm(confirmId, approve) {
    return http.post('/ai-assistant/confirm', { confirmId, approve }, { timeout: 60 * 1000 })
}
