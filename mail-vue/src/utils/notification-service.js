import { Capacitor } from '@capacitor/core'

const ANDROID_CHANNEL_ID = 'psg-mail-inbox'

let capacitorNotifications = null
let capacitorReady = false
let notificationSeed = Date.now() % 100000

function isElectron() {
  return Boolean(window.electronAPI?.sendNotification)
}

function isNativeCapacitor() {
  return Capacitor?.isNativePlatform?.() === true
}

function nextNotificationId(emailId) {
  const numeric = Number(emailId)
  if (Number.isFinite(numeric) && numeric > 0) return Math.abs(numeric % 2147483647)
  notificationSeed = (notificationSeed + 1) % 2147483647
  return notificationSeed || 1
}

function notificationTitle(email) {
  return email?.name || email?.sendEmail || 'PSG Mail'
}

function notificationBody(email) {
  return email?.subject || 'New email'
}

async function getCapacitorNotifications() {
  if (!isNativeCapacitor()) return null
  if (capacitorNotifications) return capacitorNotifications

  try {
    const mod = await import('@capacitor/local-notifications')
    capacitorNotifications = mod.LocalNotifications
    return capacitorNotifications
  } catch (error) {
    console.warn('Local notifications plugin is unavailable', error)
    return null
  }
}

async function ensureCapacitorNotifications() {
  const localNotifications = await getCapacitorNotifications()
  if (!localNotifications) return false

  const current = await localNotifications.checkPermissions()
  let display = current.display
  if (display !== 'granted') {
    const requested = await localNotifications.requestPermissions()
    display = requested.display
  }
  if (display !== 'granted') return false

  if (!capacitorReady && Capacitor.getPlatform?.() === 'android') {
    await localNotifications.createChannel({
      id: ANDROID_CHANNEL_ID,
      name: 'New mail',
      description: 'PSG Mail inbox notifications',
      importance: 5,
      visibility: 1,
      sound: 'default',
      vibration: true,
      lights: true,
      lightColor: '#ef1748',
    })
    capacitorReady = true
  }

  return true
}

async function requestBrowserPermission() {
  if (!('Notification' in window)) return 'denied'
  if (Notification.permission === 'default') {
    return Notification.requestPermission()
  }
  return Notification.permission
}

async function showBrowserNotification(email) {
  const permission = await requestBrowserPermission()
  if (permission !== 'granted') return false

  const title = notificationTitle(email)
  const options = {
    body: notificationBody(email),
    icon: '/pwa-192.png',
    badge: '/pwa-192.png',
    tag: `psg-mail-${email.emailId || Date.now()}`,
    renotify: true,
  }

  const registration = await navigator.serviceWorker?.getRegistration?.()
  if (registration?.showNotification) {
    await registration.showNotification(title, options)
  } else {
    new Notification(title, options)
  }

  return true
}

export async function requestNotificationPermission() {
  if (isNativeCapacitor()) {
    const granted = await ensureCapacitorNotifications()
    return granted ? 'granted' : 'denied'
  }

  if (isElectron()) {
    return 'granted'
  }

  return requestBrowserPermission()
}

export async function showMailNotification(email) {
  if (isElectron()) {
    const result = await window.electronAPI.sendNotification(
      notificationTitle(email), notificationBody(email), email.emailId
    ).catch(() => ({ supported: false, shown: false }))
    return !!result?.shown
  }

  if (isNativeCapacitor()) {
    const ready = await ensureCapacitorNotifications()
    if (!ready) return false

    const localNotifications = await getCapacitorNotifications()
    await localNotifications.schedule({
      notifications: [{
        id: nextNotificationId(email.emailId),
        title: notificationTitle(email),
        body: notificationBody(email),
        channelId: ANDROID_CHANNEL_ID,
        largeBody: notificationBody(email),
        summaryText: 'PSG Mail',
        extra: {
          emailId: email.emailId,
        },
      }],
    })
    return true
  }

  return showBrowserNotification(email)
}
