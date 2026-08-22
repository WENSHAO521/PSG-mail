import http from '@/axios/index.js';

export function loginUserInfo() {
    return http.get('/my/loginUserInfo')
}

export function resetPassword(password) {
    return http.put('/my/resetPassword', {password})
}

export function userDelete() {
    return http.delete('/my/delete')
}

export function updateSignature(signature) {
    return http.put('/my/signature', { signature })
}

export function getDirectory() {
    return http.get('/my/directory')
}

export function saveAvatar(avatar) {
    return http.put('/my/avatar', { avatar }, { noMsg: true })
}

export function clearAvatar() {
    return http.delete('/my/avatar', { noMsg: true })
}

export function getAvatarByEmail(email) {
    return http.get('/my/avatar', { params: { email } })
}
