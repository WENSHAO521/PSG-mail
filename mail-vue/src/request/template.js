import http from '@/axios/index.js'

export function templateList() {
    return http.get('/template/list')
}

export function templateAdd(name, subject, content, category = '') {
    return http.post('/template/add', { name, subject, content, category })
}

export function templateUpdate(templateId, name, subject, content) {
    return http.put('/template/update', { templateId, name, subject, content })
}

export function templateDelete(templateId) {
    return http.delete('/template/delete', { params: { templateId } })
}

export function templateMeta(templateId, meta) {
    return http.put('/template/meta', { templateId, ...meta })
}
