import http from "@/axios/index.js";

export function subscribeWebPush(subscription) {
    return http.post('/web-push/subscription', subscription)
}

export function listWebPushSubscriptions() {
    return http.get('/web-push/subscriptions')
}

export function removeWebPushSubscription(id) {
    return http.delete(`/web-push/subscription/${id}`)
}

// noMsg: the caller shows its own diagnostic message based on the reason
// code (NO_REGISTERED_DEVICE / WEB_PUSH_NOT_CONFIGURED / ...) instead of the
// generic axios interceptor toast — same convention as notification.js's
// sendTestNotification().
export function sendWebPushTest() {
    return http.post('/web-push/test', null, { noMsg: true })
}
