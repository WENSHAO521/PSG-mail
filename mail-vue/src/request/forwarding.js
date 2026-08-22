import http from '@/axios/index.js'

export function forwardingQuery() {
  return http.get('/forwarding/query', { noMsg: true })
}

export function forwardingAdd(targetEmail) {
  return http.post('/forwarding/add', { targetEmail }, { noMsg: true })
}

export function forwardingResend(id) {
  return http.post(`/forwarding/${id}/resend`, null, { noMsg: true })
}

export function forwardingVerify(id, code) {
  return http.post(`/forwarding/${id}/verify`, { code }, { noMsg: true })
}

export function forwardingUpdate(id, payload) {
  return http.put(`/forwarding/${id}`, payload, { noMsg: true })
}

export function forwardingRemove(id) {
  return http.delete(`/forwarding/${id}`, { noMsg: true })
}

export function forwardingAdminQuery() {
  return http.get('/forwarding/admin/query', { noMsg: true })
}

export function forwardingAdminSetStatus(id, enabled = false) {
  return http.put(`/forwarding/admin/${id}/status`, { enabled }, { noMsg: true })
}
