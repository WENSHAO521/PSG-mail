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

// Registers this browser/PWA install for FCM web push. Returns a structured
// { ok, stage, error } result instead of silently no-op'ing, so the Settings
// UI can show *why* push isn't connected (permission denied vs. unsupported
// vs. server misconfigured vs. token exchange failed) instead of just
// "Notification.permission === 'granted'" — which used to be conflated with
// "push is actually working" even when registration had failed downstream.
export async function registerWebPush() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('Notification' in window)) {
    return { ok: false, stage: 'unsupported' }
  }
  if (!firebaseConfig.apiKey) {
    return { ok: false, stage: 'firebase_init', error: 'FIREBASE_NOT_CONFIGURED' }
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    return { ok: false, stage: 'permission' }
  }

  try {
    if (!messaging) {
      const app = initializeApp(firebaseConfig)
      messaging = getMessaging(app)
    }
  } catch (e) {
    return { ok: false, stage: 'firebase_init', error: e?.message }
  }

  let registration
  try {
    registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js')
  } catch (e) {
    return { ok: false, stage: 'service_worker', error: e?.message }
  }

  let token
  try {
    token = await getToken(messaging, {
      vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
      serviceWorkerRegistration: registration,
    })
  } catch (e) {
    return { ok: false, stage: 'get_token', error: e?.message }
  }
  if (!token) {
    return { ok: false, stage: 'get_token', error: 'EMPTY_TOKEN' }
  }

  try {
    await registerDevice({
      platform: 'web',
      targetKind: 'fcm_token',
      target: token,
    })
  } catch (e) {
    return { ok: false, stage: 'device_register', error: e?.message }
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

  return { ok: true, stage: 'connected' }
}
