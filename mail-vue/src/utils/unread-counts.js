import http from '@/axios/index.js'
import { useEmailStore } from '@/store/email.js'

// Server-side unread Inbox counts, per account and in total. The sidebar
// badge and the mailbox switcher read them from the email store; anything
// that changes read state (or moves mail in or out of the Inbox) asks for a
// refresh, and calls close together are folded into one request.
let timer = null
let inFlight = false
let again = false

export function refreshUnreadCounts(delay = 400) {
  clearTimeout(timer)
  timer = setTimeout(load, delay)
}

async function load() {
  if (inFlight) { again = true; return }
  inFlight = true
  try {
    const data = await http.get('/email/unread-counts', { noMsg: true })
    const store = useEmailStore()
    store.unreadCounts = { total: data?.total || 0, accounts: data?.accounts || {} }
  } catch {
    // Keep the last known counts.
  } finally {
    inFlight = false
    if (again) { again = false; load() }
  }
}

// Wraps a request so a successful call refreshes the counts.
export function withUnreadRefresh(promise) {
  return promise.then(res => { refreshUnreadCounts(); return res })
}
