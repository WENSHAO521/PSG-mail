import { precacheAndRoute } from 'workbox-precaching'
import { initializeApp } from 'firebase/app'
import { getMessaging, onBackgroundMessage } from 'firebase/messaging/sw'

// injectManifest requires this call even with an empty manifest.
precacheAndRoute(self.__WB_MANIFEST)

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

if (firebaseConfig.apiKey) {
  const firebaseApp = initializeApp(firebaseConfig)
  const messaging = getMessaging(firebaseApp)

  onBackgroundMessage(messaging, payload => {
    const title = payload.notification?.title || payload.data?.name || 'PSG Mail'
    const body = payload.notification?.body || payload.data?.subject || ''

    self.registration.showNotification(title, {
      body,
      icon: '/pwa-192.png',
      badge: '/pwa-192.png',
      tag: `psg-mail-${payload.data?.emailId || Date.now()}`,
      data: payload.data,
    })
  })
}

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const emailId = event.notification.data?.emailId

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async clientList => {
      for (const client of clientList) {
        if ('focus' in client) {
          await client.focus()
          // An existing tab handles routing itself — mail-sync-service
          // listens for this on the page side (installLifecycleSync).
          if (emailId) client.postMessage({ type: 'OPEN_EMAIL', emailId })
          return
        }
      }
      // No open tab to postMessage into — deep-link a fresh one; the app
      // reads ?openEmail= on boot (see mail-sync-service.installLifecycleSync).
      if (self.clients.openWindow) {
        return self.clients.openWindow(emailId ? `/inbox?openEmail=${emailId}` : '/')
      }
    })
  )
})
