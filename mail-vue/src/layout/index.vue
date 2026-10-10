<template>
  <CommandPalette ref="cmdPaletteRef"/>
  <SendQuotaWidget/>
  <AiAssistantDrawer/>
  <WhatsNew/>

  <!-- Keyboard shortcuts dialog -->
  <el-dialog v-model="showShortcuts" :title="$t('shortcutsTitle')" width="460" align-center>
    <div class="shortcuts-body">
      <div class="sc-section-title">{{ $t('shortcutActions') }}</div>
      <div class="shortcuts-grid">
        <div class="sc-row" v-for="sc in actionsShortcuts" :key="sc.key">
          <kbd class="sc-key">{{ sc.key }}</kbd>
          <span class="sc-desc">{{ $t(sc.label) }}</span>
        </div>
      </div>
      <div class="sc-section-title sc-section-title--mt">{{ $t('shortcutNavigation') }}</div>
      <div class="shortcuts-grid">
        <div class="sc-row" v-for="sc in navShortcuts" :key="sc.key">
          <kbd class="sc-key">{{ sc.key }}</kbd>
          <span class="sc-desc">{{ $t(sc.label) }}</span>
        </div>
      </div>
    </div>
  </el-dialog>

  <div class="app-shell"
       :data-mode="isMailRoute ? 'mail' : 'workspace'"
       :data-collapsed="String(sidebarCollapsed)"
       :data-mobile-detail="String(uiStore.mobileDetailOpen)"
       :data-reader-peek="readerDrag.mode === 'back' ? 'true' : null"
       :data-platform="platform"
       :style="{ '--mail-list-w': listPaneWidth + 'px' }">

    <!-- Desktop top bar (brand, sections, search, compose, account) -->
    <Topbar class="shell-topbar" />

    <!-- Folder column (desktop, mail mode) / slide-in sheet (phone) -->
    <Folders class="shell-folders" />

    <!-- ── Mobile top bar (hidden on desktop) ── -->
    <div class="mobile-chrome mobile-chrome--top">
      <MobileHeader />
    </div>

    <!-- ── Mail mode: list (col 2) + reading pane (col 3) ── -->
    <template v-if="isMailRoute">
      <section class="mail-list-pane" ref="listPaneRef">
        <router-view v-slot="{ Component, route: r }">
          <keep-alive :include="keepAliveList">
            <component :is="Component" :key="r.name"/>
          </keep-alive>
        </router-view>
      </section>
      <div class="mail-list-resizer"
           :class="{ 'is-dragging': resizerDragging }"
           @mousedown="startListResize"
           @dblclick="resetListWidth"></div>
      <section class="mail-detail-pane" ref="detailPaneRef" :style="readerPaneStyle">
      <ContentPane @back="closeMobileReader"/>
      </section>
    </template>

    <!-- ── Workspace mode: content (col 2) ── -->
    <main v-else class="workspace-pane">
      <div class="workspace-body">
        <router-view v-slot="{ Component, route: r }">
          <keep-alive :include="keepAliveWorkspace">
            <component :is="Component" :key="r.name"/>
          </keep-alive>
        </router-view>
      </div>
    </main>

    <!-- ── Mobile bottom navigation (hidden on desktop) ── -->
    <div class="mobile-chrome mobile-chrome--bottom">
      <MobileTabbar />
    </div>

  </div>

  <writer ref="writerRef"/>

  <!-- ── Auto-update banner (Electron only) ── -->
  <Transition name="update-bar">
    <div v-if="updateState.show" class="update-bar">
      <Icon icon="psg:download" width="16" height="16" class="update-icon"/>
      <span v-if="updateState.stage === 'downloading'" class="update-text">
        {{ $t('updateDownloading', { version: updateState.version, pct: updateState.progress }) }}
      </span>
      <span v-else class="update-text update-ready">
        {{ $t('updateReady', { version: updateState.version }) }}
      </span>
      <el-progress v-if="updateState.stage === 'downloading'"
                   :percentage="updateState.progress" :show-text="false"
                   class="update-progress" />
      <el-button v-else size="small" type="primary" class="update-btn" @click="installUpdate">
        {{ $t('updateInstall') }}
      </el-button>
      <button class="update-close" @click="updateState.show = false">×</button>
    </div>
  </Transition>
</template>

<script setup>
import { Icon } from '@iconify/vue'
import Topbar from '@/layout/topbar/index.vue'
import Folders from '@/layout/folders/index.vue'
import ContentPane from '@/views/content/index.vue'
import CommandPalette from '@/components/command-palette/index.vue'
import SendQuotaWidget from '@/components/send-quota-widget/index.vue'
import AiAssistantDrawer from '@/components/ai-assistant-drawer/index.vue'
import WhatsNew from '@/components/whats-new/index.vue'
import MobileHeader from '@/layout/mobile-header/index.vue'
import MobileTabbar from '@/layout/mobile-tabbar/index.vue'
import writer from '@/layout/write/index.vue'
import { ref, computed, reactive, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUiStore } from '@/store/ui.js'
import { useMobileNavigationStore } from '@/store/mobile-navigation.js'
import { useEmailStore } from '@/store/email.js'
import { useSettingStore } from '@/store/setting.js'
import { useAccountStore } from '@/store/account.js'
import { emailArchive, emailUnarchive } from '@/request/email.js'
import { undoToast } from '@/utils/undo-toast.js'
import { bindHorizontalDrag, committed, resist, haptic, reducedMotion, isTouchLayout } from '@/utils/gestures.js'
import { checkAndDownloadAndroidUpdate } from '@/utils/android-update-service.js'
import {
  resetSyncState, startFallbackPolling, stopFallbackPolling, installLifecycleSync,
} from '@/utils/mail-sync-service.js'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const uiStore = useUiStore()
const mobileNavigation = useMobileNavigationStore()
const emailStore = useEmailStore()
const settingStore = useSettingStore()
const accountStore = useAccountStore()
const writerRef = ref({})
const cmdPaletteRef = ref(null)
const showShortcuts = ref(false)
const platform = window.electronAPI?.platform ?? 'web'
const isMobile = ref(window.innerWidth < 1025)

// ── Draggable list/detail pane divider ──────────────────────────────────
// The list keeps a share of the window rather than a fixed pixel width, so
// it grows and shrinks with the window; dragging changes the share and a
// double-click goes back to the default.
const LIST_SHARE_KEY = 'psgMailListShare'
const DEFAULT_LIST_SHARE = 0.3
const LIST_MIN = 340
const viewportW = ref(window.innerWidth)
const listShare = ref(loadListShare())
const listPaneWidth = computed(() => clampListWidth(listShare.value * viewportW.value))
let resizeStartX = 0
let resizeStartWidth = 0
const resizerDragging = ref(false)

function loadListShare() {
  // One-off carry-over from the old fixed-pixel setting: convert it, save
  // the share, and drop the old key so it isn't re-read on every load.
  const legacyPx = Number(localStorage.getItem('psgMailListWidth'))
  if (localStorage.getItem('psgMailListWidth') !== null) {
    localStorage.removeItem('psgMailListWidth')
    if (legacyPx > 0 && localStorage.getItem(LIST_SHARE_KEY) === null) {
      // Capped at the widest share the layout allows, so opening this
      // version in a narrow window doesn't turn a saved width into a ratio
      // >= 1 that the check below would throw away.
      localStorage.setItem(LIST_SHARE_KEY, Math.min(legacyPx / window.innerWidth, 0.5).toFixed(4))
    }
  }
  const saved = Number(localStorage.getItem(LIST_SHARE_KEY))
  return saved > 0 && saved < 1 ? saved : DEFAULT_LIST_SHARE
}

// Widest the list may get: half the window, but 42% at <=1280px — the same
// cap as the medium-screen grid rule, so a drag never stores a width the
// layout won't draw.
function maxListWidth() {
  const vw = viewportW.value
  return Math.max(LIST_MIN, Math.min(760, vw * (vw <= 1280 ? 0.42 : 0.5)))
}

function clampListWidth(w) {
  return Math.round(Math.min(maxListWidth(), Math.max(LIST_MIN, w)))
}

function onViewportResize() { viewportW.value = window.innerWidth }
window.addEventListener('resize', onViewportResize)
onBeforeUnmount(() => window.removeEventListener('resize', onViewportResize))

function startListResize(e) {
  resizeStartX = e.clientX
  resizeStartWidth = listPaneWidth.value
  resizerDragging.value = true
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
  window.addEventListener('mousemove', onListResize)
  window.addEventListener('mouseup', stopListResize)
}

function onListResize(e) {
  const next = clampListWidth(resizeStartWidth + (e.clientX - resizeStartX))
  listShare.value = next / viewportW.value
}

function stopListResize() {
  resizerDragging.value = false
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
  localStorage.setItem(LIST_SHARE_KEY, listShare.value.toFixed(4))
  window.removeEventListener('mousemove', onListResize)
  window.removeEventListener('mouseup', stopListResize)
}

function resetListWidth() {
  listShare.value = DEFAULT_LIST_SHARE
  localStorage.removeItem(LIST_SHARE_KEY)
}
let elNotification = null
let noticeStyle = null

const actionsShortcuts = [
  { key: 'C',      label: 'shortcutCompose'  },
  { key: 'R',      label: 'shortcutReply'    },
  { key: 'A',      label: 'shortcutReplyAll' },
  { key: 'F',      label: 'shortcutForward'  },
  { key: 'E',      label: 'shortcutArchive'  },
  { key: 'S',      label: 'shortcutStar'     },
  { key: '#',      label: 'shortcutDelete'   },
  { key: '/',      label: 'shortcutSearch'   },
  { key: 'Ctrl K', label: 'shortcutCommandPalette' },
  { key: '?',      label: 'shortcutHelp'     },
]
const navShortcuts = [
  { key: 'J / K',  label: 'shortcutNextPrev' },
  { key: 'U',      label: 'shortcutBackToList' },
  { key: 'G I',    label: 'shortcutGoInbox'  },
  { key: 'G A',    label: 'shortcutGoAll'    },
  { key: 'G S',    label: 'shortcutGoSent'   },
  { key: 'G D',    label: 'shortcutGoDrafts' },
  { key: 'G T',    label: 'shortcutGoStarred'},
]

let pendingG = false
let pendingGTimer = null

// ── Website announcement ────────────────────────────────────
watch(() => uiStore.changeNotice, () => {
  const s = settingStore.settings
  showNotice({ notice: s.notice, noticeWidth: s.noticeWidth, noticeTitle: s.noticeTitle,
    noticeContent: s.noticeContent, noticeType: s.noticeType, noticeDuration: s.noticeDuration,
    noticePosition: s.noticePosition, noticeOffset: s.noticeOffset })
})
watch(() => uiStore.changePreview, () => { showNotice(uiStore.previewData) })

function showNotice(data) {
  if (data.notice === 1) return
  if (elNotification) elNotification.close()
  if (!noticeStyle) { noticeStyle = document.createElement('style'); document.head.appendChild(noticeStyle) }
  noticeStyle.innerHTML = `.custom-notice.el-notification{--el-notification-width:min(${data.noticeWidth}px,calc(100% - 30px))!important}`
  elNotification = ElNotification({
    title: data.noticeTitle,
    message: `<div style="width:100%;height:100%">${data.noticeContent}</div>`,
    type: data.noticeType === 'none' ? '' : data.noticeType,
    duration: data.noticeDuration, position: data.noticePosition,
    offset: data.noticeOffset, dangerouslyUseHTMLString: true, customClass: 'custom-notice'
  })
}

const MAIL_ROUTES = new Set(['email', 'all-inbox', 'send', 'draft', 'star', 'archive', 'spam', 'trash', 'all-email', 'label', 'search'])
const isMailRoute = computed(() => MAIL_ROUTES.has(route.meta?.name))
const sidebarCollapsed = computed(() => uiStore.asideCollapsed && window.innerWidth >= 1025)

const keepAliveList = ['email', 'all-inbox', 'all-email', 'send', 'star', 'draft', 'archive', 'spam', 'trash', 'label', 'search']
const keepAliveWorkspace = ['sys-setting', 'analysis', 'access-mgmt', 'setting', 'templates', 'groups', 'scheduled']

// Workspace pages share one scroll container. Keep navigation deterministic on
// mobile (and when a kept-alive page is revisited): a new section should open
// at its own heading instead of inheriting the previous page's scroll offset.
function resetWorkspaceScroll() {
  if (isMailRoute.value) return
  nextTick(() => {
    document.querySelector('.workspace-body')?.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  })
}

// Keep the reading pane scoped to the current mail route. contentData is
// persisted so a hard navigation can otherwise show the previous folder's
// message beside an empty/new list (for example All Mail -> Inbox).
function clearReaderSelection() {
  emailStore.contentData.email = null
  emailStore.contentData.delType = null
  emailStore.contentData.emailIndex = 0
  emailStore.contentData.emailTotal = 0
  uiStore.mobileDetailOpen = false
}

function closeMobileDrawer() {
  uiStore.asideShow = false
}

function closeMobileReader() {
  uiStore.mobileDetailOpen = false
}

// Clear on mail/workspace boundaries as well as when leaving mail entirely.
watch(isMailRoute, (is, wasInMailRoute) => {
  if (!is || !wasInMailRoute) clearReaderSelection()
})
watch(() => route.name, (name, prev) => {
  if (name !== prev && isMobile.value) {
    uiStore.asideShow = false
    uiStore.mobileDetailOpen = false
    mobileNavigation.clearLayers()
  }
  if (MAIL_ROUTES.has(name) && MAIL_ROUTES.has(prev) && name !== prev) {
    clearReaderSelection()
  }
  resetWorkspaceScroll()
})

// ── Touch gestures (phones / tablets) ─────────────────────────────────────
// Reader: swipe left/right for the next/previous message; swipe in from the
// left edge to go back to the list (it follows the finger, with the list
// visible underneath). List: swipe in from the left edge to open folders.
const listPaneRef = ref(null)
const detailPaneRef = ref(null)
const readerDrag = reactive({ mode: null, dx: 0, settling: false })

const readerPaneStyle = computed(() => {
  if (!readerDrag.mode && !readerDrag.settling) return null
  const transition = readerDrag.settling && !reducedMotion() ? 'transform .22s ease, opacity .22s ease' : 'none'
  if (readerDrag.mode === 'back') {
    return { transform: `translateX(${Math.max(0, readerDrag.dx)}px)`, transition, boxShadow: 'var(--psg-shadow-lg)' }
  }
  return { transform: `translateX(${readerDrag.dx}px)`, opacity: String(1 - Math.min(Math.abs(readerDrag.dx) / 600, 0.25)), transition }
})

function settleReader(dx, after) {
  readerDrag.settling = true
  readerDrag.dx = dx
  setTimeout(() => {
    readerDrag.mode = null
    readerDrag.dx = 0
    readerDrag.settling = false
    after?.()
  }, reducedMotion() ? 0 : 220)
}

const readerGestureEnabled = () => isTouchLayout() && isMailRoute.value && uiStore.mobileDetailOpen
  && !!emailStore.contentData.email && !uiStore.writerRef?.isOpen?.()

const unbindGestures = []
function bindTouchGestures() {
  if (detailPaneRef.value) {
    // Edge swipe → back to the list.
    unbindGestures.push(bindHorizontalDrag(detailPaneRef.value, {
      edge: true,
      enabled: readerGestureEnabled,
      onStart: () => { readerDrag.mode = 'back' },
      onMove: dx => { readerDrag.dx = dx },
      onEnd: (dx, vx) => {
        if (committed(dx, vx, 'right')) {
          haptic(10)
          settleReader(window.innerWidth, closeMobileReader)
        } else settleReader(0)
      },
      onCancel: () => settleReader(0),
    }))
    // Swipe across the message → next / previous.
    unbindGestures.push(bindHorizontalDrag(detailPaneRef.value, {
      enabled: readerGestureEnabled,
      onStart: () => { readerDrag.mode = 'nav' },
      onMove: dx => { readerDrag.dx = resist(dx * 0.6, 80) },
      onEnd: (dx, vx) => {
        const dir = committed(dx, vx, 'left') ? 1 : committed(dx, vx, 'right') ? -1 : 0
        if (dir && emailStore.activeList?.openRelative(dir)) {
          haptic(10)
          // The next message slides in from the side it was pulled from.
          readerDrag.settling = false
          readerDrag.dx = dir * 48
          requestAnimationFrame(() => settleReader(0))
        } else settleReader(0)
      },
      onCancel: () => settleReader(0),
    }))
  }
  if (listPaneRef.value) {
    // Edge swipe on a mail list → folder sheet.
    unbindGestures.push(bindHorizontalDrag(listPaneRef.value, {
      edge: true,
      enabled: () => isTouchLayout() && isMailRoute.value && !uiStore.mobileDetailOpen && !uiStore.asideShow,
      onEnd: (dx, vx) => {
        if (committed(dx, vx, 'right')) { haptic(10); uiStore.asideShow = true }
      },
    }))
  }
}
function unbindTouchGestures() {
  unbindGestures.splice(0).forEach(off => off())
}
// The panes only exist on mail routes; rebind when they (re)appear.
watch([listPaneRef, detailPaneRef], () => { unbindTouchGestures(); bindTouchGestures() })

// ── Mouse back button (desktop) ───────────────────────────────────────────
// Back closes the open message first, like it does on phones; with nothing
// open it falls through to normal browser/app history.
function handleMouseBack(e) {
  if (e.button !== 3 || isTouchLayout() || !isMailRoute.value || !emailStore.contentData.email) return
  e.preventDefault()
  clearReaderSelection()
}

// Keyboard shortcuts
function handleKeydown(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault()
    cmdPaletteRef.value?.open()
    return
  }
  const tag = e.target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return
  if (e.ctrlKey || e.metaKey || e.altKey) return

  // g-prefix navigation (Gmail-style: g then i/a/s/d/t)
  if (pendingG) {
    clearTimeout(pendingGTimer)
    pendingG = false
    switch (e.key) {
      case 'i': router.push({ name: 'email' }); return
      case 'a': router.push({ name: 'all-inbox' }); return
      case 's': router.push({ name: 'send' }); return
      case 'd': router.push({ name: 'draft' }); return
      case 't': router.push({ name: 'star' }); return
    }
    return
  }

  if (e.key === 'g') {
    pendingG = true
    pendingGTimer = setTimeout(() => { pendingG = false }, 1200)
    return
  }

  const email = emailStore.contentData?.email
  switch (e.key) {
    case 'c': uiStore.writerRef?.open?.(); break
    case 'r': if (email) uiStore.writerRef?.openReply?.(email); break
    case 'a': if (email) uiStore.writerRef?.openReplyAll?.(email); break
    case 'f': if (email) uiStore.writerRef?.openForward?.(email); break
    case '?': showShortcuts.value = true; break
    // Real mail search — distinct from Ctrl+K's Command Palette.
    case '/': e.preventDefault(); router.push({ name: 'search' }); break
    case 'j': emailStore.activeList?.openRelative(1); break
    case 'k': emailStore.activeList?.openRelative(-1); break
    case 's': if (email) emailStore.readerCommand = { name: 'star', at: Date.now() }; break
    case '#': if (email) emailStore.readerCommand = { name: 'delete', at: Date.now() }; break
    case 'u':
      if (email) { if (isTouchLayout()) closeMobileReader(); else clearReaderSelection() }
      break
    case 'e':
      if (email?.emailId) {
        emailArchive([email.emailId]).then(() => {
          emailStore.emailScroll?.deleteEmail?.([email.emailId])
          if (emailStore.contentData.email?.emailId === email.emailId) clearReaderSelection()
          undoToast(t('archivedMsg'), t('undo'), () => {
            emailUnarchive([email.emailId]).then(() => emailStore.activeList?.refreshList()).catch(() => {})
          })
        }).catch(() => {})
      }
      break
  }
}

// Responsive sidebar
function handleResize() {
  isMobile.value = window.innerWidth < 1025
  if (isMobile.value) {
    uiStore.asideShow = false
  } else {
    mobileNavigation.clearLayers()
    uiStore.asideShow = true
    uiStore.mobileDetailOpen = false
  }
}

// ── Auto-update (Electron only) ──────────────────────────────
const updateState = reactive({ show: false, stage: '', version: '', progress: 0 })

if (window.electronAPI?.onUpdateAvailable) {
  window.electronAPI.onUpdateAvailable((info) => {
    updateState.version = info.version
    updateState.stage = 'downloading'
    updateState.show = true
  })
  window.electronAPI.onUpdateProgress((pct) => {
    updateState.progress = pct
  })
  window.electronAPI.onUpdateDownloaded(() => {
    updateState.stage = 'ready'
    updateState.progress = 100
  })
  // Both fire on the silent 8-second-after-launch check too — only surface
  // a toast when `manual` says this was a "Check for Updates" button click
  // (sys-setting's footer), so launching the app doesn't pop a message
  // every single time there's nothing new.
  window.electronAPI.onUpdateNotAvailable((data) => {
    if (data?.manual) {
      ElMessage({ message: t('updateUpToDate'), type: 'success', plain: true })
    }
  })
  window.electronAPI.onUpdateError((data) => {
    if (data?.manual) {
      ElMessage({ message: `${t('updateCheckFailed')}: ${data.message}`, type: 'error', plain: true })
    }
  })
}

function installUpdate() {
  window.electronAPI?.installUpdate()
}

async function checkAndroidUpdates() {
  try {
    await checkAndDownloadAndroidUpdate()
  } catch (error) {
    console.warn('Android update check failed', error)
  }
}

// Account switch must not let a new account's poll reuse the previous
// account's cursor (see mail-sync-service.resetSyncState).
watch([
  () => accountStore.currentAccountId,
  () => accountStore.currentAccount?.allReceive,
], resetSyncState)

onMounted(async () => {
  // A full reload mounts the layout without changing route.name, so the
  // route watcher cannot clear a persisted reader selection by itself.
  if (isMailRoute.value) clearReaderSelection()
  uiStore.writerRef = writerRef
  window.addEventListener('resize', handleResize)
  window.addEventListener('keydown', handleKeydown)
  window.addEventListener('mouseup', handleMouseBack)
  window.addEventListener('popstate', handlePopState)
  handleResize()
  resetWorkspaceScroll()
  // One fallback polling loop + visibility/focus/online catch-up +
  // notification-click routing for the whole app (Firebase/native push is
  // the primary real-time signal — this just fills gaps). See
  // mail-sync-service.js for why this replaced two independently-polling
  // loops that used to race on the same rate-limited endpoint.
  installLifecycleSync()
  startFallbackPolling()
  setTimeout(checkAndroidUpdates, 8000)
})

// ── Mobile surface history ─────────────────────────────────────────────────
// Each full-screen mobile surface owns exactly one history marker. System
// back/edge-back closes the top surface first; the root route is left to the
// browser/host application and is never replaced with a fake exit state.
watch(() => uiStore.asideShow, (open) => {
  if (!isMobile.value) return
  if (open) {
    mobileNavigation.openLayer('drawer', () => {
      uiStore.asideShow = false
      return true
    })
  } else {
    mobileNavigation.closeLayer('drawer')
  }
})

// Landscape tablets show the reader beside the list (see the split-pane
// CSS), so opening a message isn't a separate screen there.
// Rotating while a message is open moves between the two, so the reader's
// history layer follows the split state as well as mobileDetailOpen.
const splitTabletQuery = window.matchMedia('(min-width: 900px) and (max-width: 1024px) and (orientation: landscape)')
const splitTablet = ref(splitTabletQuery.matches)
const onSplitChange = e => { splitTablet.value = e.matches }
splitTabletQuery.addEventListener?.('change', onSplitChange)
onBeforeUnmount(() => splitTabletQuery.removeEventListener?.('change', onSplitChange))

watch([() => uiStore.mobileDetailOpen, splitTablet, isMobile], ([open, split, mobile]) => {
  if (open && mobile && !split) {
    mobileNavigation.openLayer('reader', () => {
      uiStore.mobileDetailOpen = false
      return true
    })
  } else {
    mobileNavigation.closeLayer('reader')
  }
})

async function handlePopState() {
  // A route-level pop with no mobile surface is intentionally untouched.
  await mobileNavigation.handlePopState()
}

onBeforeUnmount(() => {
  stopFallbackPolling()
  window.removeEventListener('resize', handleResize)
  window.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('mouseup', handleMouseBack)
  unbindTouchGestures()
  window.removeEventListener('popstate', handlePopState)
  window.removeEventListener('mousemove', onListResize)
  window.removeEventListener('mouseup', stopListResize)
  clearTimeout(pendingGTimer)
})
</script>

<style lang="scss">
/* ── Auto-update banner ─────────────────────────────────────── */
.update-bar {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 9999;
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--psg-primary);
  color: var(--psg-on-primary);
  border-radius: var(--psg-radius-sm);
  padding: 10px 14px;
  box-shadow: var(--psg-shadow-sm);
  font-size: 13px;
  white-space: nowrap;
  max-width: calc(100vw - 40px);

  .update-icon { opacity: .75; flex-shrink: 0; }
  .update-text { opacity: .9; }
  .update-ready { font-weight: 600; }
  .update-progress { width: 100px; flex-shrink: 0; }
  .update-btn { flex-shrink: 0; border-radius: var(--psg-radius-sm); }
  .update-close {
    background: none; border: none; color: var(--psg-on-primary);
    opacity: .55;
    cursor: pointer; font-size: 16px; line-height: 1; padding: 0 2px;
    &:hover { opacity: 1; }
  }
}

.update-bar-enter-active, .update-bar-leave-active { transition: all .25s ease; }
.update-bar-enter-from, .update-bar-leave-to { opacity: 0; transform: translateX(-50%) translateY(12px); }

.shortcuts-body { display: flex; flex-direction: column; gap: 0; }
.sc-section-title {
  font-family: var(--psg-font-sans);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--psg-text-muted);
  margin-bottom: 10px;
  &--mt { margin-top: 20px; }
}
.shortcuts-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.sc-row {
  display: flex;
  align-items: center;
  gap: 16px;
}
.sc-key {
  font-family: var(--psg-font-mono);
  font-size: 11px;
  font-weight: 700;
  background: var(--psg-surface-muted);
  border: 1px solid var(--psg-border);
  padding: 3px 10px;
  border-radius: var(--psg-radius-sm);
  min-width: 72px;
  text-align: center;
  color: var(--psg-text);
  letter-spacing: 0.04em;
  white-space: nowrap;
}
.sc-desc {
  font-size: 13px;
  color: var(--psg-text-secondary);
}
</style>

<style lang="scss" scoped>
/* ── Shell (Mist): top bar over folders | list card | reader card ── */
.app-shell {
  height: 100vh;
  overflow: hidden;
  display: grid;
  position: fixed;
  inset: 0;
  padding: 0 24px 24px;
  background: var(--psg-canvas);
  grid-template-rows: 72px minmax(0, 1fr);

  &[data-mode="mail"] {
    grid-template-columns: 200px var(--mail-list-w, 420px) 16px minmax(360px, 1fr);
    grid-template-areas:
      "top top top top"
      "folders list gap detail";
  }

  &[data-mode="workspace"] {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas:
      "top"
      "main";
  }

  @media (max-width: 1280px) {
    padding: 0 16px 16px;

    &[data-mode="mail"] {
      grid-template-columns: 184px var(--mail-list-w, 360px) 12px minmax(0, 1fr);
    }
  }

  /* Phone: single column; the mobile header/tab bar take over. */
  @media (max-width: 1024px) {
    display: block !important;
    height: 100dvh;
    padding: 0;
  }
}

.shell-topbar { grid-area: top; }

.shell-folders {
  grid-area: folders;
  margin-right: 16px;
}

.app-shell[data-mode="workspace"] .shell-folders {
  @media (min-width: 1025px) { display: none; }
}

@media (max-width: 1024px) {
  .shell-topbar { display: none; }
  .shell-folders { margin: 0; }
}

/* ── Mail panes ────────────────────────────────────────────── */
.mail-list-pane {
  grid-area: list;
  min-height: 0;
  overflow: hidden;
  background: var(--psg-surface);
  border-radius: var(--psg-radius-xl);

  /* Mobile: sit between the fixed header and the bottom tab bar */
  @media (max-width: 1024px) {
    position: fixed;
    left: 0;
    right: 0;
    top: var(--m-header-h);
    bottom: var(--m-tabbar-h);
    height: auto;
    border-right: none;
    z-index: 5;
  }
}

/* ── Drag handle between list and detail panes ───────────────
   A near-invisible 6px hit target that only reveals itself on
   hover/drag, so it reads as "the gap between panes" at rest and
   as an obvious control the moment you reach for it. ── */
.mail-list-resizer {
  grid-area: gap;
  position: relative;
  cursor: col-resize;
  background: transparent;
  z-index: 6;

  &::after {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    left: 50%;
    width: 2px;
    transform: translateX(-50%);
    background: transparent;
    transition: background 0.15s ease;
  }

  @media (hover: hover) {
    &:hover::after { background: var(--psg-primary); }
  }

  &.is-dragging::after { background: var(--psg-primary); }

  @media (max-width: 1024px) { display: none; }
}

.mail-detail-pane {
  grid-area: detail;
  min-height: 0;
  overflow: hidden;
  -webkit-overflow-scrolling: touch;
  background: var(--psg-surface);
  border-radius: var(--psg-radius-xl);
  padding: 0;

  /* Mobile: a full-screen reading page (its own back button + actions) */
  @media (max-width: 1024px) {
    position: fixed;
    inset: 0;
    border-radius: 0;
    height: auto;
    padding: 0;
    z-index: 35;
  }
}

/* Mobile: list and reading view are separate screens */
@media (max-width: 1024px) {
  .app-shell[data-mobile-detail="true"]:not([data-reader-peek]) .mail-list-pane { display: none; }

  /* Horizontal drags on the reader are ours (next/previous, edge-back);
     vertical scrolling stays native. */
  .mail-detail-pane { touch-action: pan-y; will-change: transform; }
  .mail-list-pane { touch-action: pan-y; }
  /* touch-action is resolved up to the nearest scroll container, so the
     panes' own scrollers need it too (wide mail inside keeps its own). */
  .mail-detail-pane :deep(.el-scrollbar__wrap),
  .mail-list-pane :deep(.el-scrollbar__wrap),
  .mail-list-pane :deep(.virtual) { touch-action: pan-y; }
  .app-shell[data-mobile-detail="false"] .mail-detail-pane { display: none; }
}

/* ── Workspace pane ────────────────────────────────────────── */
.workspace-pane {
  grid-area: main;
  min-height: 0;
  overflow: hidden;
  background: var(--psg-surface);
  border-radius: var(--psg-radius-xl);
  display: flex;
  flex-direction: column;

  @media (max-width: 1024px) {
    position: fixed;
    left: 0;
    right: 0;
    top: var(--m-header-h);
    bottom: var(--m-tabbar-h);
    height: auto;
    z-index: 5;
  }
}

.workspace-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  -webkit-overflow-scrolling: touch;
  scroll-behavior: smooth;
}

/* ── Mobile chrome: top header + bottom tab bar ────────────── */
.mobile-chrome { display: none; }

@media (max-width: 1024px) {
  .app-shell {
    --m-header-h: calc(64px + env(safe-area-inset-top, 0px));
    --m-tabbar-h: calc(74px + env(safe-area-inset-bottom, 0px));
  }

  .mobile-chrome--top {
    display: block;
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: var(--m-header-h);
    z-index: 30;
  }

  .mobile-chrome--bottom {
    display: block;
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 30;
  }

  /* On the reading screen the detail view owns the chrome → hide global bars */
  .app-shell[data-mobile-detail="true"]:not([data-reader-peek]) .mobile-chrome--top,
  .app-shell[data-mobile-detail="true"]:not([data-reader-peek]) .mobile-chrome--bottom {
    display: none;
  }
}

/* ── Landscape tablets (900–1024px): two panes ─────────────────────────────
   Phones get one screen at a time; a landscape tablet has room for the list
   and the open message side by side. Touch chrome (header, tab bar) and
   gestures stay; the reader is simply docked to the right instead of
   covering the list. */
@media (min-width: 900px) and (max-width: 1024px) and (orientation: landscape) {
  .app-shell { --split-list-w: clamp(320px, 38vw, 400px); }

  .app-shell .mail-list-pane {
    display: block !important;
    right: auto;
    width: var(--split-list-w);
    border-radius: 0;
  }

  .app-shell .mail-detail-pane {
    display: block !important;
    inset: var(--m-header-h) 0 var(--m-tabbar-h) var(--split-list-w);
    z-index: 5;
    border-left: 1px solid var(--psg-border);
    box-shadow: none;
  }

  /* Outranks the "reading screen hides the chrome" rule above. */
  .app-shell[data-mobile-detail="true"]:not([data-reader-peek]) .mobile-chrome--top,
  .app-shell[data-mobile-detail="true"]:not([data-reader-peek]) .mobile-chrome--bottom {
    display: block;
  }
}
</style>
