import { defineStore } from 'pinia'
import { requestNotificationPermission, showMailNotification } from '@/utils/notification-service.js'
import { notificationEvents, notificationEventsRead, notificationEventsReadAll } from '@/request/notification-events.js'

// Desktop and mobile layouts both mount the notification panel. Keep the
// persisted-event request at one per app session instead of one per panel.
let persistedLoadPromise = null
let persistedLoaded = false

export const useNotificationStore = defineStore('notification', {
  state: () => ({
    items: [],               // { emailId, name, subject, time, read }
    permission: typeof window !== 'undefined' && typeof Notification !== 'undefined'
      ? Notification.permission
      : 'denied',
  }),
  getters: {
    unreadCount: (state) => state.items.filter(n => !n.read).length,
  },
  actions: {
    push(email, eventId = null) {
      if (this.items.some(n => n.emailId === email.emailId)) return
      this.items.unshift({
        eventId,
        emailId: email.emailId,
        name: email.name || email.sendEmail || '',
        subject: email.subject || '',
        time: Date.now(),
        read: false,
      })
      if (this.items.length > 100) this.items.length = 100
      return true
    },
    async loadPersisted({ force = false } = {}) {
      if (persistedLoaded && !force) return
      if (persistedLoadPromise) return persistedLoadPromise

      persistedLoadPromise = (async () => {
        try {
          const rows = await notificationEvents({ limit: 50 })
          for (const row of (rows || []).reverse()) {
            if (this.items.some(item => String(item.emailId) === String(row.emailId))) continue
            this.items.push({
              eventId: row.id,
              emailId: row.emailId,
              name: row.title || row.payload?.from || '',
              subject: row.payload?.subject || row.subject || row.body || '',
              time: row.createdAt || Date.now(),
              read: !row.unread,
            })
          }
          this.items.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
          if (this.items.length > 100) this.items.length = 100
          persistedLoaded = true
        } catch {
          // The in-memory mail-sync notification remains the fallback for older
          // deployments or a database migration that has not arrived yet.
        } finally {
          persistedLoadPromise = null
        }
      })()

      return persistedLoadPromise
    },
    async notifyEmail(email, { deliver = true } = {}) {
      const added = this.push(email)
      if (!added) return false
      if (deliver) {
        try {
          await showMailNotification(email)
        } catch (error) {
          // Notification delivery is best-effort. The inbox item and the
          // in-app notification are already recorded and must not be rolled
          // back because a browser/plugin/provider is unavailable.
          console.warn('mail notification delivery failed', error)
        }
      }
      return true
    },
    async markAllRead() {
      this.items.forEach(n => { n.read = true })
      try { await notificationEventsReadAll() } catch {}
    },
    async markRead(emailId) {
      this.items.forEach(n => {
        if (String(n.emailId) === String(emailId)) n.read = true
      })
      const ids = this.items.filter(n => String(n.emailId) === String(emailId) && n.eventId).map(n => n.eventId)
      if (ids.length) {
        try { await notificationEventsRead(ids) } catch {}
      }
    },
    clear({ resetPersistence = false } = {}) {
      this.items = []
      if (resetPersistence) persistedLoaded = false
    },
    async requestPermission() {
      const result = await requestNotificationPermission()
      this.permission = result
      return result
    },
  },
})
