import http from '@/axios/index.js';

export function retentionGet() {
    return http.get('/admin/retention/policy')
}

export function retentionPreview() {
    return http.get('/admin/retention/preview')
}

export function retentionSave(policy) {
    return http.put('/admin/retention/policy', policy)
}

export function retentionApprove() {
    return http.post('/admin/retention/approve')
}

export function storageAudit(params) {
    return http.get('/admin/storage/audit', { params, timeout: 60 * 1000 })
}
