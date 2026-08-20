import http from "@/axios/index.js";

export function registerDevice(device) {
    return http.post('/notification/device', device)
}

export function listDevices() {
    return http.get('/notification/devices')
}

export function removeDevice(id) {
    return http.delete(`/notification/device/${id}`)
}

export function sendTestNotification() {
    return http.post('/notification/test')
}
