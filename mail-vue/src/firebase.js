import { initializeApp } from 'firebase/app'
import { getMessaging, getToken, onMessage } from 'firebase/messaging'
import { registerDevice } from '@/request/notification.js'
import { handleNewMailSignal } from '@/utils/mail-sync-service.js'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

let messaging = null

function isSupported() {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'Notification' in window
    && !!firebaseConfig.apiKey
}

// Safe error identifier only — a FirebaseError's .code (e.g.
// "messaging/token-subscribe-failed") or the exception's .name, never
// .message (which can echo back request details) and never any
// token/key/credential value.
function errorId(e) {
  return e?.code || e?.name || 'unknown'
}

function swState(registration) {
  if (!registration) return 'none'
  if (registration.active) return registration.active.state // 'activated'
  if (registration.installing) return 'installing'
  if (registration.waiting) return 'waiting'
  return 'unknown'
}

// Registers this browser/PWA install for FCM web push. Returns a structured
// { ok, stage, error } result instead of silently no-op'ing, so the Settings
// UI can show *why* push isn't connected (permission denied vs. unsupported
// vs. server misconfigured vs. token exchange failed) instead of just
// "Notification.permission === 'granted'" — which used to be conflated with
// "push is actually working" even when registration had failed downstream.
//
// Also logs a redacted diagnostic snapshot to the console at each stage —
// permission/serviceWorker state/firebase init/getToken/device-register
// outcome only, never a token, VAPID key, Firebase API key, or full error
// message (see errorId() above) — so a failure can be triaged from a user's
// DevTools console without asking them to paste anything sensitive.
export async function registerWebPush() {
  const diag = {
    permission: typeof Notification !== 'undefined' ? Notification.permission : 'unsupported',
    serviceWorkerSupported: typeof window !== 'undefined' && 'serviceWorker' in navigator,
    serviceWorkerState: 'not_attempted',
    firebaseInit: 'not_attempted',
    getToken: 'not_attempted',
    deviceRegisterAttempted: false,
    deviceRegisterOk: null,
  }
  const finish = (result) => {
    console.info('[push] registerWebPush', diag, { ok: result.ok, stage: result.stage })
    return result
  }

  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('Notification' in window)) {
    return finish({ ok: false, stage: 'unsupported' })
  }
  if (!firebaseConfig.apiKey) {
    diag.firebaseInit = 'not_configured'
    return finish({ ok: false, stage: 'firebase_init', error: 'FIREBASE_NOT_CONFIGURED' })
  }

  const permission = await Notification.requestPermission()
  diag.permission = permission
  if (permission !== 'granted') {
    return finish({ ok: false, stage: 'permission' })
  }

  try {
    if (!messaging) {
      const app = initializeApp(firebaseConfig)
      messaging = getMessaging(app)
    }
    diag.firebaseInit = 'ok'
  } catch (e) {
    diag.firebaseInit = 'failed'
    return finish({ ok: false, stage: 'firebase_init', error: errorId(e) })
  }

  let registration
  try {
    registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js')
    // register() resolves once a registration exists, not once it's
    // active — on a brand-new registration (nothing else has visited this
    // origin yet) that can still be 'installing' at this point. Firebase's
    // getToken() subscribes via this exact registration's PushManager;
    // waiting for it to actually control the page removes that race
    // instead of handing getToken() a not-yet-active registration.
    await navigator.serviceWorker.ready
    diag.serviceWorkerState = swState(registration)
  } catch (e) {
    diag.serviceWorkerState = 'failed'
    return finish({ ok: false, stage: 'service_worker', error: errorId(e) })
  }

  let token
  try {
    token = await getToken(messaging, {
      vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
      serviceWorkerRegistration: registration,
    })
    diag.getToken = token ? 'success' : 'empty'
  } catch (e) {
    diag.getToken = 'failed'
    return finish({ ok: false, stage: 'get_token', error: errorId(e) })
  }
  if (!token) {
    return finish({ ok: false, stage: 'get_token', error: 'EMPTY_TOKEN' })
  }

  diag.deviceRegisterAttempted = true
  try {
    await registerDevice({
      platform: 'web',
      targetKind: 'fcm_token',
      target: token,
    })
    diag.deviceRegisterOk = true
  } catch (e) {
    diag.deviceRegisterOk = false
    return finish({ ok: false, stage: 'device_register', error: errorId(e) })
  }

  // Foreground messages don't trigger the service worker's background
  // handler — route them through the same new-mail sync path as
  // poll/Android/click so Inbox insert + notification + de-dupe all go
  // through one place instead of just showing a notification-panel entry.
  onMessage(messaging, payload => {
    handleNewMailSignal({
      emailId: payload.data?.emailId,
      accountId: payload.data?.accountId,
      source: 'firebase',
    })
  })

  return finish({ ok: true, stage: 'connected' })
}
