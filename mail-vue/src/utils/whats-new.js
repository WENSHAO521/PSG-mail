import { ref } from 'vue'

const SEEN_KEY = 'psg-whats-new-seen'

// Newest first. Add an entry when bumping the version; a version without one
// updates silently.
export const RELEASE_NOTES = [
  {
    version: '3.3.0',
    date: '2026-10-10',
    items: [
      {
        icon: 'psg:palette',
        zh: { title: '全新樱色主题', desc: '主色由橙色换成柔和的樱粉，浅色与深色模式均已适配。' },
        en: { title: 'New sakura theme', desc: 'The accent is now a soft sakura pink instead of orange, in both light and dark mode.' },
      },
      {
        icon: 'psg:clock',
        zh: { title: '稍后提醒', desc: '邮件可以先移出收件箱，到时间后自动回来并标为未读。' },
        en: { title: 'Snooze', desc: 'Move a mail out of the inbox and get it back, unread, at the time you pick.' },
      },
      {
        icon: 'psg:send',
        zh: { title: '发信更顺手', desc: '可以只填抄送或密送；漏写主题、忘了附件会先提醒；Ctrl+Enter 直接发送。' },
        en: { title: 'Smoother sending', desc: 'Send with only Cc or Bcc, get a nudge for a missing subject or attachment, and press Ctrl+Enter to send.' },
      },
    ],
  },
]

export const whatsNewVisible = ref(false)

export function currentNotes() {
  return RELEASE_NOTES.find(n => n.version === __APP_VERSION__) || null
}

function readSeen() {
  try { return localStorage.getItem(SEEN_KEY) } catch { return null }
}

export function markWhatsNewSeen() {
  try { localStorage.setItem(SEEN_KEY, __APP_VERSION__) } catch {}
}

// Opens once per version that has notes. Installs that predate this feature
// have no stored version, so a missing key counts as "not seen yet" rather
// than a first install: they are the ones this dialog is for.
export function showWhatsNewIfUpdated() {
  if (readSeen() !== __APP_VERSION__ && currentNotes()) whatsNewVisible.value = true
  else markWhatsNewSeen()
}

export function openWhatsNew() {
  if (currentNotes()) whatsNewVisible.value = true
}
