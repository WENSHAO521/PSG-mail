import http from '@/axios/index.js'

export function aiEmailSummary(emailId) {
  return http.post('/ai/email/summary', { emailId }, { noMsg: true })
}

export function aiReplySuggestion(emailId) {
  return http.post('/ai/email/reply-suggestion', { emailId }, { noMsg: true })
}

export function aiComposeTransform(payload) {
  return http.post('/ai/compose/transform', payload, { noMsg: true })
}

export function aiDraftTranslate(payload) {
  return http.post('/ai/draft-translate', payload, { noMsg: true })
}
