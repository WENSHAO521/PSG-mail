import http from '@/axios/index.js'

// Senders whose mail skips tracker blocking.
export function trackerAllowList() {
    return http.get('/tracker/allow')
}

export function trackerAllow(email) {
    return http.post('/tracker/allow', { email })
}

export function trackerDisallow(email) {
    return http.delete('/tracker/allow', { params: { email } })
}
