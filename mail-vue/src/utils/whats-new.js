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
        icon: 'solar:palette-round-linear',
        zh: { title: '全新桜色主题', desc: '主色由橙色换成柔和的桜粉，浅色与深色模式均已适配。' },
        en: { title: 'New sakura theme', desc: 'The accent is now a soft sakura pink instead of orange, in both light and dark mode.' },
      },
      {
        icon: 'solar:download-minimalistic-linear',
        zh: { title: 'PSG Connect 下载页升级', desc: '换用 PSG Connect 官方图标；Linux 按架构分行，AppImage、DEB、RPM 一目了然。' },
        en: { title: 'Better PSG Connect downloads', desc: 'Uses the official PSG Connect icon, and Linux builds are grouped by architecture.' },
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
