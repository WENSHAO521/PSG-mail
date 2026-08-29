import http from '@/axios/index.js';

export function settingSet(setting) {
    return http.put('/setting/set', setting)
}

export function settingQuery() {
    return http.get('/setting/query')
}

export function websiteConfig(forRegister) {
    return http.get('/setting/websiteConfig', forRegister ? {params: {forRegister: 1}} : undefined)
}

export function providerUsage() {
    return http.get('/setting/providerUsage')
}

export function setBackground(background) {
    return http.put('/setting/setBackground',{background})
}

export function deleteBackground() {
    return http.delete('/setting/deleteBackground')
}

export function setBlackList(params) {
    return http.put('/setting/setBlacklist', params)
}

export function alibabaTestConnection() {
    return http.post('/setting/alibaba/testConnection')
}

export function alibabaTestNotification(targetEmail) {
    return http.post('/setting/alibaba/testNotification', {targetEmail})
}