// Single owner of "a new email exists, get it into the Inbox" for the whole
// app. Every entry point that can learn about a new email — Firebase push
// (web foreground + background click), Capacitor/Android push, and the
// fallback poller — funnels through here instead of each independently
// calling addItem()/notifyEmail(), which used to race against each other
// (see mail-sync incident writeup: two independent /email/latest pollers +
// a server-side rate limit that silently returned [] on the second caller).
//
// Responsibilities:
//   - de-dupe a given emailId across push + poll (at most one Inbox row,
//     one notification)
//   - own the single fallback polling loop (Firebase is the primary signal;
//     polling only fills gaps — see startFallbackPolling)
//   - insert into the Inbox immediately when it's mounted and in scope,
//     otherwise mark it dirty so the Inbox refreshes itself when opened
//   - catch up immediately on visibility/focus/online transitions instead
//     of waiting for the next poll tick
import router from '@/router'
import { emailLatest, emailDetail, emailList, emailArchive, emailRead } from '@/request/email.js'
import { starAdd } from '@/request/star.js'
import { useEmailStore } from '@/store/email.js'
import { useNotificationStore } from '@/store/notification.js'
import { useAccountStore } from '@/store/account.js'
import { useSettingStore } from '@/store/setting.js'
import { useRulesStore } from '@/store/rules.js'
import { useUiStore } from '@/store/ui.js'
import { EmailUnreadEnum } from '@/enums/email-enum.js'
import { sleep } from '@/utils/time-utils.js'

const MAX_RECENT = 500
const recentIds = new Map()

function isDuplicate(emailId) {
  const id = Number(emailId)
  if (!id) return false
  if (recentIds.has(id)) return true
  recentIds.set(id, Date.now())
  if (recentIds.size > MAX_RECENT) {
    recentIds.delete(recentIds.keys().next().value)
  }
  return false
}

let cursor = 0
let scopeKey = ''
let pollRunning = false
let pollLoopStarted = false
let lifecycleInstalled = false

function currentScope() {
  const accountStore = useAccountStore()
  const accountId = Number(accountStore.currentAccountId || 0)
  const allReceive = Number(accountStore.currentAccount?.allReceive || 0)
  return accountId > 0 ? `${accountId}:${allReceive}` : ''
}

// Called on login/logout and account switch — a cursor from account A must
// never be used to page account B's /email/latest.
export function resetSyncState() {
  cursor = 0
  scopeKey = ''
  recentIds.clear()
}

async function ensureCursor(accountId, allReceive, scope) {
  if (cursor > 0 && scopeKey === scope) return
  const data = await emailList(accountId, allReceive, 0, 0, 1, 0)
  cursor = Number(data?.latestEmail?.emailId || data?.list?.[0]?.emailId || 0)
  scopeKey = scope
}

function isOnInboxRoute() {
  return router.currentRoute.value?.name === 'email'
}

function isVisibleInCurrentScope(email) {
  const accountStore = useAccountStore()
  const allReceive = Number(accountStore.currentAccount?.allReceive || 0)
  if (allReceive) return true
  return Number(email.accountId) === Number(accountStore.currentAccountId)
}

function archiveAndRemove(emailId) {
  return emailArchive([emailId]).then(() => {
    useEmailStore().emailScroll?.deleteEmail?.([emailId])
  })
}

function starIncomingEmail(emailId, email) {
  return starAdd(emailId).then(() => {
    email.isStar = 1
    useEmailStore().starScroll?.addItem?.(email)
  })
}

function markIncomingEmailRead(emailIds, email) {
  return emailRead(emailIds).then(() => {
    if (emailIds.some(id => String(id) === String(email.emailId))) {
      email.unread = EmailUnreadEnum.READ
      email.checked = false
    }
  })
}

// Inserts into the mounted Inbox list (if visible right now) or marks the
// Inbox dirty for the next time it's opened. Returns true if inserted.
function insertIntoInboxIfVisible(email) {
  const emailStore = useEmailStore()

  if (!isVisibleInCurrentScope(email)) return false

  const scroll = emailStore.emailScroll
  if (!isOnInboxRoute() || !scroll?.addItem) {
    emailStore.inboxDirty = true
    return false
  }

  const inserted = scroll.addItem(email)
  return inserted
}

async function processIncomingEmail(email, source, { notify = true } = {}) {
  if (!email || isDuplicate(email.emailId)) return
  insertIntoInboxIfVisible(email)
  // Rules belong to the incoming-mail pipeline, not to the Inbox view. They
  // must also run when the user is on another route or the Inbox is not
  // mounted, otherwise a configured subject keyword silently does nothing.
  useRulesStore().applyRules(email, {
    starAdd: (emailId) => starIncomingEmail(emailId, email),
    archiveEmail: archiveAndRemove,
    emailRead: (emailIds) => markIncomingEmailRead(emailIds, email),
  })
  await useNotificationStore().notifyEmail(email, { deliver: notify })
  if (Number(email.emailId) > cursor) cursor = Number(email.emailId)
}

// Entry point for push signals (Firebase web/Android) — payloads only carry
// { emailId, accountId }, so fetch the full row before inserting it.
export async function handleNewMailSignal({ emailId, accountId, source, notify = true }) {
  // Do not claim the id before the detail request succeeds. If the request
  // fails transiently, the fallback poll must still be able to pick up the
  // same message. processIncomingEmail() is the single de-duplication point
  // after we have a complete email row.
  if (!emailId) return
  try {
    const email = await emailDetail(emailId)
    if (!email) return
    await processIncomingEmail(email, source, { notify })
  } catch (e) {
    // Detail fetch failed (transient network/500) — don't lose the signal,
    // let the next fallback poll (or Inbox refresh) pick it up instead.
    console.warn('new mail sync failed', emailId, source, e?.message)
    useEmailStore().inboxDirty = true
  }
}

// Fallback poll — de-dupes against handleNewMailSignal via the same
// recentIds set, so a push+poll race for the same email never double-inserts
// or double-notifies.
export async function syncNow(reason = 'manual') {
  const accountStore = useAccountStore()
  const accountId = Number(accountStore.currentAccountId || 0)
  const scope = currentScope()
  if (!accountId || !scope) return
  const allReceive = Number(accountStore.currentAccount?.allReceive || 0)

  try {
    await ensureCursor(accountId, allReceive, scope)
    if (!cursor) return

    const list = await emailLatest(cursor, accountId, allReceive)
    if (!Array.isArray(list) || list.length === 0) return

    const newestId = Math.max(...list.map(e => Number(e.emailId || 0)))
    for (const email of [...list].reverse()) {
      await processIncomingEmail(email, reason)
      await sleep(50)
    }
    if (Number.isFinite(newestId) && newestId > cursor) cursor = newestId
  } catch (e) {
    if (e?.code === 401 || e?.code === 403) {
      useSettingStore().settings.autoRefresh = 0
    }
  }
}

// Flushed when the Inbox mounts/activates after being marked dirty by a push
// that arrived while it wasn't visible.
export function flushInboxIfDirty() {
  const emailStore = useEmailStore()
  if (!emailStore.inboxDirty) return
  emailStore.inboxDirty = false
  emailStore.emailScroll?.refreshList?.()
}

// The one fallback polling loop for the whole app. Firebase/native push is
// the primary real-time signal; this only fills gaps (push blocked/missing
// token/network blip/Electron has no push transport yet). Honors the same
// autoRefresh semantics the old per-view pollers used: 0/1 = disabled.
async function pollLoop() {
  while (pollRunning) {
    const settingStore = useSettingStore()
    const autoRefresh = Number(settingStore.settings.autoRefresh || 0)
    const interval = autoRefresh > 1 ? autoRefresh * 1000 : 30000
    await sleep(interval)
    if (!pollRunning) break
    if (!localStorage.getItem('token')) continue
    if (autoRefresh <= 1) continue
    await syncNow('poll')
  }
}

export function startFallbackPolling() {
  if (pollLoopStarted) return
  pollLoopStarted = true
  pollRunning = true
  pollLoop()
}

export function stopFallbackPolling() {
  pollRunning = false
  pollLoopStarted = false
}

// Opens a specific email from a notification click (Web SW postMessage,
// Electron native click, Android pushNotificationActionPerformed).
export async function openEmailById(emailId) {
  if (!emailId) return
  router.push({ name: 'email' }).catch(() => {})
  try {
    const email = await emailDetail(emailId)
    if (!email) return
    const emailStore = useEmailStore()
    emailStore.contentData.email = email
    emailStore.contentData.delType = 'logic'
    emailStore.contentData.showUnread = true
    emailStore.contentData.showStar = true
    emailStore.contentData.showReply = true
    useUiStore().mobileDetailOpen = true
  } catch (e) {
    console.warn('open email from notification failed', emailId, e?.message)
  }
}

// Immediate catch-up on visibility/focus/online transitions instead of
// waiting for the next poll tick, plus notification-click routing. Call once
// from the app shell (layout/index.vue).
export function installLifecycleSync() {
  if (lifecycleInstalled) return
  lifecycleInstalled = true

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') syncNow('visibility')
  })
  window.addEventListener('focus', () => syncNow('focus'))
  window.addEventListener('online', () => syncNow('online'))

  // Web: service worker background-notification clicks postMessage here.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'OPEN_EMAIL' && event.data.emailId) {
        openEmailById(event.data.emailId)
      }
      if (event.data?.type === 'NEW_MAIL' && event.data.emailId) {
        // The service worker already displayed the system notification for
        // this push. Update the open app and in-app center without showing a
        // second browser notification for the same event.
        handleNewMailSignal({
          emailId: event.data.emailId,
          accountId: event.data.accountId,
          source: 'web-push',
          notify: false,
        })
      }
    })
  }

  // Electron: native notification click.
  if (window.electronAPI?.onNotificationOpenEmail) {
    window.electronAPI.onNotificationOpenEmail(({ emailId }) => openEmailById(emailId))
  }

  // Web: boot-time deep link from a notification click that had to open a
  // brand-new window/tab (no existing client to postMessage into).
  try {
    const params = new URLSearchParams(window.location.search)
    const openEmailId = params.get('openEmail')
    if (openEmailId) openEmailById(openEmailId)
  } catch {}
}
