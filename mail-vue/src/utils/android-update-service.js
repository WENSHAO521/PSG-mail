import { Capacitor } from '@capacitor/core'

const RELEASE_API = 'https://api.github.com/repos/WENSHAO521/PSG-mail/releases/latest'
const DOWNLOAD_KEY_PREFIX = 'psg-mail-android-update-download:'

function isAndroidApp() {
  return Capacitor?.isNativePlatform?.() === true && Capacitor.getPlatform?.() === 'android'
}

function parseVersion(version) {
  return String(version || '')
    .replace(/^v/i, '')
    .split('.')
    .map(part => Number.parseInt(part, 10) || 0)
}

function isNewerVersion(remote, current) {
  const remoteParts = parseVersion(remote)
  const currentParts = parseVersion(current)
  const length = Math.max(remoteParts.length, currentParts.length)

  for (let i = 0; i < length; i += 1) {
    const remotePart = remoteParts[i] || 0
    const currentPart = currentParts[i] || 0
    if (remotePart > currentPart) return true
    if (remotePart < currentPart) return false
  }

  return false
}

function findAndroidApk(release) {
  const assets = Array.isArray(release?.assets) ? release.assets : []
  return assets.find(asset => {
    const name = String(asset?.name || '').toLowerCase()
    return name.endsWith('.apk') && name.includes('android')
  })
}

async function openDownload(url) {
  try {
    const { Browser } = await import('@capacitor/browser')
    await Browser.open({ url })
  } catch {
    window.location.href = url
  }
}

export async function checkAndDownloadAndroidUpdate() {
  if (!isAndroidApp()) return null

  const response = await fetch(RELEASE_API, {
    headers: { Accept: 'application/vnd.github+json' },
    cache: 'no-store',
  })
  if (!response.ok) throw new Error(`GitHub release check failed: ${response.status}`)

  const release = await response.json()
  const remoteVersion = String(release?.tag_name || release?.name || '').replace(/^v/i, '')
  const currentVersion = __APP_VERSION__
  if (!isNewerVersion(remoteVersion, currentVersion)) return { status: 'current', remoteVersion }

  const apk = findAndroidApk(release)
  if (!apk?.browser_download_url) return { status: 'missing-apk', remoteVersion }

  const downloadKey = `${DOWNLOAD_KEY_PREFIX}${remoteVersion}`
  if (localStorage.getItem(downloadKey) === '1') {
    return { status: 'already-started', remoteVersion, url: apk.browser_download_url }
  }

  localStorage.setItem(downloadKey, '1')
  await openDownload(apk.browser_download_url)
  return { status: 'download-started', remoteVersion, url: apk.browser_download_url }
}
