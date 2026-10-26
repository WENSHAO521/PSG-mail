import http from '@/axios/index.js';

export function draftList() {
    return http.get('/draft/list', {noMsg: true})
}

export function draftSave(draft) {
    return http.post('/draft/save', draft, {noMsg: true})
}

export function draftDelete(draftIds) {
    return http.delete('/draft/delete', {params: {draftIds: draftIds.join(',')}, noMsg: true})
}
