import { useSettingStore } from '@/store/setting.js'

// Bypasses the axios JSON-unwrap interceptor (see src/axios/index.js) since this
// endpoint returns a raw message/rfc822 file, not the {code,data,message} envelope.
export async function downloadEml(emailId) {
  const { lang } = useSettingStore()
  const res = await fetch(`${import.meta.env.VITE_BASE_URL}/email/export-eml/${emailId}`, {
    headers: {
      Authorization: localStorage.getItem('token'),
      'accept-language': lang
    }
  })
  if (!res.ok) throw new Error('export failed')
  const disposition = res.headers.get('Content-Disposition') || ''
  const match = disposition.match(/filename="?([^"]+)"?/)
  const filename = match ? decodeURIComponent(match[1]) : `email-${emailId}.eml`
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
