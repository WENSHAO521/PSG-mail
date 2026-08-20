import http from '@/axios/index.js';

export function labelCreate(name, color) {
    return http.post('/label/create', { name, color })
}

export function labelUpdate(labelId, data) {
    return http.put(`/label/${labelId}`, data)
}

export function labelDelete(labelId) {
    return http.delete(`/label/${labelId}`)
}

export function labelList() {
    return http.get('/label/list')
}

export function labelApply(labelId, emailIds) {
    return http.post('/label/apply', { labelId, emailIds })
}

export function labelRemove(labelId, emailIds) {
    return http.post('/label/remove', { labelId, emailIds })
}

export function labelEmails(labelId, emailId, size) {
    return http.get(`/label/${labelId}/emails`, { params: { emailId, size } })
}
