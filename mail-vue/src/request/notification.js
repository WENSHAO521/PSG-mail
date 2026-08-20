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

// noMsg: the caller shows its own diagnostic message based on the reason
// code (NO_REGISTERED_DEVICE / FIREBASE_NOT_CONFIGURED / ...) instead of the
// generic axios interceptor toast.
export function sendTestNotification() {
    return http.post('/notification/test', null, { noMsg: true })
}
