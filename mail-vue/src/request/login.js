import http from '@/axios/index.js';

export function login(email, password) {
    return http.post('/login', {email: email, password: password})
}

export function changePassword(email, currentPassword, newPassword) {
    return http.post('/login/changePassword', { email, currentPassword, newPassword })
}

export function logout() {
    return http.delete('/logout')
}

export function register(form) {
    return http.post('/register', form)
}
