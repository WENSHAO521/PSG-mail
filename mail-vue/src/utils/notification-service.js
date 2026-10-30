function notificationTitle(email) {
  return email?.name || email?.sendEmail || 'PSG Mail'
}

function notificationBody(email) {
  return email?.subject || 'New email'
}

export async function requestNotificationPermission() {
  if (!('Notification' in window)) return 'denied'
  if (Notification.permission === 'default') {
    return Notification.requestPermission()
  }
  return Notification.permission
}

export async function showMailNotification(email) {
  // New mail is a background event, not a user gesture. Never turn it into
  // a browser permission prompt; the Settings action owns that decision.
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false

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
