import http from '@/axios/index.js'

// Auto contacts: everyone the user has exchanged mail with, frequent ones flagged.
export function contactList() {
    return http.get('/contact/list')
}

export function contactHide(email) {
    return http.delete('/contact/hide', { params: { email } })
}
