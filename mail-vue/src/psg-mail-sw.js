import { precacheAndRoute } from 'workbox-precaching'

// injectManifest requires this call even with an empty manifest (see
// vite.config.js's injectManifest.globPatterns: [] — no offline precache).
precacheAndRoute(self.__WB_MANIFEST)

// Standards Web Push (RFC 8030) — no Firebase SDK involved. Unlike Firebase's
// onMessage()/onBackgroundMessage() split, the Push API has no in-page
// "foreground message" callback: every push, tab open or not, arrives here
// and must call showNotification() directly (Chrome silently kills a
// subscription that doesn't show a notification for an incoming push).
self.addEventListener('push', event => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = {}
  }

  const title = data.title || 'PSG Mail'
  const body = data.body || ''

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/pwa-192.png',
      badge: '/pwa-192.png',
      tag: `psg-mail-${data.data?.emailId || Date.now()}`,
      data: data.data,
    })
  )
})

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
