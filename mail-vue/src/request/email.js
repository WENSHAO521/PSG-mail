import http from '@/axios/index.js';

export function emailList(accountId, allReceive, emailId, timeSort, size, type) {
    return http.get('/email/list', {params: {accountId, allReceive, emailId, timeSort, size, type}})
}

export function emailDelete(emailIds) {
    return http.delete('/email/delete?emailIds=' + emailIds)
}

export function emailLatest(emailId, accountId, allReceive) {
    return http.get('/email/latest', {params: {emailId, accountId, allReceive}, noMsg: true, timeout: 35 * 1000})
}

// Single-email fetch used by the new-mail sync path — Firebase/native push
// payloads only carry { emailId, accountId }, so the client fetches the full
// row here before inserting it into the Inbox.
export function emailDetail(emailId) {
    return http.get('/email/detail', {params: {emailId}, noMsg: true})
}

export function emailSearch(query, accountId, allReceive, cursor, size) {
    return http.post('/email/search', {query, accountId, allReceive, cursor, size}, {noMsg: true})
}

export function emailRead(emailIds) {
    return http.put('/email/read', {emailIds})
}

export function emailMarkSpam(emailIds) {
    return http.put('/email/spam', {emailIds: emailIds.join(',')})
}

export function emailUnmarkSpam(emailIds) {
    return http.put('/email/unspam', {emailIds: emailIds.join(',')})
}

export function emailSpamList(accountId, allReceive, emailId, size) {
    return http.get('/email/spam/list', {params: {accountId, allReceive, emailId, size}})
}

export function emailArchive(emailIds) {
    return http.put('/email/archive', {emailIds: emailIds.join(',')})
}

export function emailUnarchive(emailIds) {
    return http.put('/email/unarchive', {emailIds: emailIds.join(',')})
}

export function emailArchiveList(accountId, allReceive, emailId, size) {
    return http.get('/email/archive/list', {params: {accountId, allReceive, emailId, size}})
}

export function emailUnread(emailIds) {
    return http.put('/email/unread', {emailIds})
}

export function emailRestore(emailIds) {
    return http.put('/email/restore', {emailIds: emailIds.join(',')})
}

export function emailTrashList(accountId, allReceive, emailId, size) {
    return http.get('/email/trash/list', {params: {accountId, allReceive, emailId, size}})
}

export function emailPermanentDelete(emailIds) {
    return http.delete('/email/permanent-delete?emailIds=' + emailIds)
}

export function emailSend(form,progress) {
    return http.post('/email/send', form,{
        onUploadProgress: (e) => {
            progress(e)
        },
        noMsg: true
    })
}

export function emailSchedule(form) {
    return http.post('/email/schedule', form, { noMsg: true })
}

export function emailScheduleList() {
    return http.get('/email/schedule/list')
}

export function emailScheduleCancel(id) {
    return http.put(`/email/schedule/${id}/cancel`)
}

export function emailScheduleReschedule(id, scheduledAt, timezone) {
    return http.put(`/email/schedule/${id}/reschedule`, { scheduledAt, timezone })
}

export function emailScheduleSendNow(id) {
    return http.post(`/email/schedule/${id}/send-now`, null, { noMsg: true })
}

export function emailScheduleEdit(id) {
    return http.post(`/email/schedule/${id}/edit`, null, { noMsg: true })
}