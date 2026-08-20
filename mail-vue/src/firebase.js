import { initializeApp } from 'firebase/app'
import { getMessaging, getToken, onMessage } from 'firebase/messaging'
import { registerDevice } from '@/request/notification.js'
import { useNotificationStore } from '@/store/notification.js'

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

// Registers this browser/PWA install for FCM web push. No-op if Firebase
// env vars aren't configured yet, or the browser lacks push support.
export async function registerWebPush() {
  if (!isSupported()) return

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return

  if (!messaging) {
    const app = initializeApp(firebaseConfig)
    messaging = getMessaging(app)
  }

  const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js')

  const token = await getToken(messaging, {
    vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
    serviceWorkerRegistration: registration,
  })

  if (!token) return

  await registerDevice({
    platform: 'web',
    targetKind: 'fcm_token',
    target: token,
  })

  // Foreground messages don't trigger the service worker's background
  // handler, so surface them through the app's own notification panel.
  onMessage(messaging, payload => {
    const notificationStore = useNotificationStore()
    notificationStore.notifyEmail({
      emailId: payload.data?.emailId,
      name: payload.data?.name || payload.notification?.title || '',
      subject: payload.data?.subject || payload.notification?.body || '',
    })
  })
}
