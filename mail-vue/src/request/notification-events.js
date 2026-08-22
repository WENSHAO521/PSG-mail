import http from '@/axios/index.js'

export function notificationEvents(params = {}) {
  return http.get('/notification/events', { params, noMsg: true })
}

export function notificationEventsRead(ids) {
  return http.post('/notification/events/read', { ids }, { noMsg: true })
}

export function notificationEventsReadAll() {
  return http.post('/notification/events/read-all', null, { noMsg: true })
}
