import { Capacitor } from '@capacitor/core'
import { registerDevice } from '@/request/notification.js'
import { handleNewMailSignal, openEmailById } from '@/utils/mail-sync-service.js'

// Wires FCM to Capacitor's native Android channel. Web/PWA push lives in
// firebase.js — this file only runs inside the native app shell.
export async function initNativePush() {
  if (!Capacitor.isNativePlatform()) return

  const { PushNotifications } = await import('@capacitor/push-notifications')

  // 'registration' fires again whenever the OS rotates the token, so this
  // doubles as the refresh path — the backend upserts on (userId, targetKind, targetValue).
  PushNotifications.addListener('registration', async token => {
    try {
      await registerDevice({
        platform: 'android',
        targetKind: 'fcm_token',
        target: token.value,
        deviceName: 'Android',
      })
    } catch (error) {
      console.error('Failed to register push device', error)
    }
  })

  PushNotifications.addListener('registrationError', error => {
    console.error('FCM registration error', error)
  })

  // Foreground pushes don't show a system notification on their own — route
  // them through the same new-mail sync path as web push/poll/click so
  // Inbox insert + notification + de-dupe all go through one place.
  PushNotifications.addListener('pushNotificationReceived', notification => {
    const data = notification.data || {}
    if (data.type !== 'new_mail') return
    handleNewMailSignal({ emailId: data.emailId, accountId: data.accountId, source: 'native' })
  })

  // Background/tapped notification — open the specific email, not just the
  // Inbox list (see mail-sync-service.openEmailById).
  PushNotifications.addListener('pushNotificationActionPerformed', action => {
    const emailId = action.notification?.data?.emailId
    if (emailId) openEmailById(emailId)
  })

  let permission = await PushNotifications.checkPermissions()

  if (permission.receive === 'prompt' || permission.receive === 'prompt-with-rationale') {
    permission = await PushNotifications.requestPermissions()
  }

  if (permission.receive === 'granted') {
    await PushNotifications.register()
  }

  // Foreground pushes are surfaced as a local notification (see
  // notification-service.js#showMailNotification) rather than shown by the
  // OS automatically — tapping *that* notification is a separate event
  // stream from pushNotificationActionPerformed above, and needs its own
  // emailId → open-email wiring.
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    LocalNotifications.addListener('localNotificationActionPerformed', action => {
      const emailId = action.notification?.extra?.emailId
      if (emailId) openEmailById(emailId)
    })
  } catch (error) {
    console.warn('Local notification click wiring unavailable', error)
  }
}
