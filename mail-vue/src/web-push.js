// Standards-based Web Push (Service Worker + Push API + PushManager +
// Notification API + VAPID) for browser/PWA clients — no Firebase SDK, no
// FCM token, no Firebase Web App config. See mail-worker/src/service/
// web-push-*.js for the RFC 8291/8292 server side. The old firebase.js /
// firebase-messaging-sw.js stay in the repo, unreferenced, until this path
// is proven stable in production (see the notification architecture
// migration notes) — nothing here imports them.
import { subscribeWebPush } from '@/request/web-push.js'
import { useSettingStore } from '@/store/setting.js'

const VAPID_KEY_STORAGE = 'psg-mail-vapid-public-key'

function getVapidPublicKey() {
  // The Worker response is the source of truth. A production bundle can stay
  // cached after a VAPID rotation, while websiteConfig is fetched at runtime.
  try {
    const runtimeKey = useSettingStore().settings.webPushVapidPublicKey
    if (runtimeKey) return runtimeKey
  } catch {}
  return import.meta.env.VITE_WEB_PUSH_VAPID_PUBLIC_KEY || ''
}

// PushManager.subscribe() needs applicationServerKey as a Uint8Array, not the
// base64url string the env var carries.
function urlBase64ToUint8Array(base64Url) {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4)
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

function uint8ArrayToUrlBase64(bytes) {
  let raw = ''
  for (const byte of bytes) raw += String.fromCharCode(byte)
  return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function readStoredVapidKey() {
  try {
    return localStorage.getItem(VAPID_KEY_STORAGE) || ''
  } catch {
    return ''
  }
}

function writeStoredVapidKey(value) {
  try {
    localStorage.setItem(VAPID_KEY_STORAGE, value)
  } catch {}
}

function subscriptionVapidKey(subscription) {
  const key = subscription?.options?.applicationServerKey
  if (!key) return ''
  try {
    return uint8ArrayToUrlBase64(new Uint8Array(key))
  } catch {
    return ''
  }
}

// Safe error identifier only — an exception's .name/.message never carries a
// subscription key or credential, unlike Firebase's SDK errors this is
// mirrored from, but kept to the same shape for the Settings UI to consume.
function errorId(e) {
  return e?.name || e?.message || 'unknown'
}

// Registers this browser/PWA install for standards Web Push. Returns a
// structured { ok, stage, error } result, same convention as firebase.js's
// former registerWebPush() so the Settings UI needs no shape change — only a
// different import. Stages: unsupported, permission, service_worker,
// subscribe, device_register, connected.
export async function registerWebPush({ requestPermission = true, forceRenew = false } = {}) {
  const vapidPublicKey = getVapidPublicKey()
  const diag = {
    permission: typeof Notification !== 'undefined' ? Notification.permission : 'unsupported',
    serviceWorkerSupported: typeof window !== 'undefined' && 'serviceWorker' in navigator,
    pushManagerSupported: typeof window !== 'undefined' && 'PushManager' in window,
    vapidKeyPresent: !!vapidPublicKey,
    serviceWorkerState: 'not_attempted',
    subscribe: 'not_attempted',
    deviceRegisterAttempted: false,
    deviceRegisterOk: null,
  }
  const finish = (result) => {
    console.info('[web-push] registerWebPush', diag, { ok: result.ok, stage: result.stage, error: result.error || null })
    return result
  }

  if (
    typeof window === 'undefined' ||
    !('serviceWorker' in navigator) ||
    !('PushManager' in window) ||
    !('Notification' in window)
  ) {
    return finish({ ok: false, stage: 'unsupported' })
  }
  if (!vapidPublicKey) {
    return finish({ ok: false, stage: 'unsupported', error: 'WEB_PUSH_NOT_CONFIGURED' })
  }

  let permission = Notification.permission
  if (permission !== 'granted' && requestPermission) {
    permission = await Notification.requestPermission()
  }
  diag.permission = permission
  if (permission !== 'granted') {
    return finish({ ok: false, stage: 'permission' })
  }

  let registration
  try {
    registration = await navigator.serviceWorker.register('/psg-mail-sw.js')
    // register() resolves once a registration exists, not once it's active —
    // pushManager.subscribe() below needs it actually controlling the page.
    await navigator.serviceWorker.ready
    diag.serviceWorkerState = registration.active ? registration.active.state : 'unknown'
  } catch (e) {
    diag.serviceWorkerState = 'failed'
    return finish({ ok: false, stage: 'service_worker', error: errorId(e) })
  }

  let subscription
  try {
    subscription = await registration.pushManager.getSubscription()
    const storedKey = readStoredVapidKey()
    const subscriptionKey = subscriptionVapidKey(subscription)
    const keyChanged = subscription && (
      forceRenew ||
      (subscriptionKey && subscriptionKey !== vapidPublicKey) ||
      (!subscriptionKey && storedKey && storedKey !== vapidPublicKey)
    )
    if (keyChanged) {
      await subscription.unsubscribe().catch(() => {})
      subscription = null
    }
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      })
    }
    diag.subscribe = 'success'
  } catch (e) {
    diag.subscribe = 'failed'
    return finish({ ok: false, stage: 'subscribe', error: errorId(e) })
  }

  const json = subscription.toJSON()
  diag.deviceRegisterAttempted = true
  try {
    await subscribeWebPush({
      endpoint: json.endpoint,
      p256dh: json.keys?.p256dh,
      auth: json.keys?.auth,
      platform: 'web',
      userAgent: navigator.userAgent,
    })
    writeStoredVapidKey(vapidPublicKey)
    diag.deviceRegisterOk = true
  } catch (e) {
    diag.deviceRegisterOk = false
    return finish({ ok: false, stage: 'device_register', error: errorId(e) })
  }

  return finish({ ok: true, stage: 'connected' })
}

export async function renewWebPushSubscription() {
  return registerWebPush({ requestPermission: false, forceRenew: true })
}

// "本地测试" — direct Notification API call, no server round trip. Distinct
// from sendWebPushTest() (request/web-push.js), which exercises the real
// background-delivery path through the backend.
export async function showLocalTestNotification() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return false

  const registration = await navigator.serviceWorker?.getRegistration?.('/psg-mail-sw.js')
  const options = { body: 'This is a local test notification', icon: '/pwa-192.png', badge: '/pwa-192.png' }
  if (registration?.showNotification) {
    await registration.showNotification('PSG Mail', options)
  } else {
    new Notification('PSG Mail', options)
  }
  return true
}
