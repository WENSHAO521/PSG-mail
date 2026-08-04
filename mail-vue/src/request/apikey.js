import http from '@/axios/index.js';

export function apikeyList() {
    return http.get('/apikey/list')
}

export function apikeyCreate(name) {
    return http.post('/apikey/create', { name })
}

export function apikeyRevoke(id) {
    return http.delete('/apikey/' + id)
}
