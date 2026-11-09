import http from '@/axios/index.js'
import { useEmailStore } from '@/store/email.js'

// Server-side unread Inbox counts, per account and in total. The sidebar
// badge and the mailbox switcher read them from the email store; anything
// that changes read state (or moves mail in or out of the Inbox) asks for a
// refresh, and calls close together are folded into one request.
let timer = null
let inFlight = false
let again = false
let loadedAt = 0

// The background sync asks only when its counts are older than this (or new
// mail came in), so an idle open tab costs a count query every few minutes,
// not every 30 seconds. Actions that change read state still refresh at once.
const SYNC_MAX_AGE_MS = 5 * 60 * 1000

export function refreshUnreadCountsIfStale(maxAgeMs = SYNC_MAX_AGE_MS) {
  if (Date.now() - loadedAt >= maxAgeMs) refreshUnreadCounts(0)
}

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
    loadedAt = Date.now()
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
