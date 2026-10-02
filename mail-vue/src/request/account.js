import http from '@/axios/index.js'

export function accountList(accountId, size, lastSort) {
    return http.get('/account/list', {params: {accountId, size, lastSort}});
}

// Every address the user can read or send from. The list endpoint caps a
// page at 30, so follow its (accountId, sort) cursor until it runs out.
export async function accountListAll() {
    const PAGE = 30
    const all = []
    for (let guard = 0; guard < 50; guard++) {
        const last = all.at(-1)
        const page = await accountList(last ? last.accountId : 0, PAGE, last ? last.sort : null)
        if (!Array.isArray(page) || !page.length) break
        all.push(...page)
        if (page.length < PAGE) break
    }
    return all
}

export function accountAdd(email,token) {
    return http.post('/account/add', {email,token})
}

export function accountSetName(accountId,name) {
    return http.put('/account/setName', {name,accountId})
}

export function accountDelete(accountId) {
    return http.delete('/account/delete', {params: {accountId}})
}

export function accountSetAllReceive(accountId) {
    return http.put('/account/setAllReceive', {accountId})
}

export function accountSetAsTop(accountId) {
    return http.put('/account/setAsTop', {accountId})
}

export function accountBind(email, password) {
    return http.post('/account/bind', {email, password})
}