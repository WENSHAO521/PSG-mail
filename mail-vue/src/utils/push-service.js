import { Capacitor } from '@capacitor/core'
import router from '@/router'
import { registerDevice } from '@/request/notification.js'
import { useNotificationStore } from '@/store/notification.js'

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

  // Foreground pushes don't show a system notification on their own —
  // surface them through the app's own notification panel, same as polling.
  PushNotifications.addListener('pushNotificationReceived', notification => {
    const data = notification.data || {}
    if (data.type !== 'new_mail') return
    useNotificationStore().notifyEmail({
      emailId: data.emailId,
      name: data.name || notification.title || '',
      subject: data.subject || notification.body || '',
    })
  })

  PushNotifications.addListener('pushNotificationActionPerformed', action => {
    const emailId = action.notification?.data?.emailId
    if (emailId) {
      router.push('/inbox')
    }
  })

  let permission = await PushNotifications.checkPermissions()

  if (permission.receive === 'prompt' || permission.receive === 'prompt-with-rationale') {
    permission = await PushNotifications.requestPermissions()
  }

  if (permission.receive !== 'granted') return

  await PushNotifications.register()
}
