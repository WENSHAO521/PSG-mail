import http from '@/axios/index.js';

export function ruleList() {
    return http.get('/rule/list')
}

export function ruleAdd(rule) {
    return http.post('/rule/add', rule)
}

export function ruleUpdate(rule) {
    return http.put('/rule/update', rule)
}

export function ruleDelete(id) {
    return http.delete('/rule/delete', { params: { id } })
}

export function ruleImport(rules) {
    return http.post('/rule/import', { rules })
}
