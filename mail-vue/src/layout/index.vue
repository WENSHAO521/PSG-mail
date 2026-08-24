<template>
  <CommandPalette ref="cmdPaletteRef"/>
  <SendQuotaWidget/>

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
       :data-platform="platform"
       :style="{ '--mail-list-w': listPaneWidth + 'px' }">

    <!-- Mobile sidebar backdrop -->
    <div class="sidebar-backdrop"
         :data-open="String(uiStore.asideShow)"
         @click="closeMobileDrawer"/>

    <!-- Sidebar ─ always column 1 -->
    <Aside />

    <!-- ── Mobile top bar (hidden on desktop) ── -->
    <div class="mobile-chrome mobile-chrome--top">
      <MobileHeader />
    </div>

    <!-- ── Mail mode: list (col 2) + reading pane (col 3) ── -->
    <template v-if="isMailRoute">
      <section class="mail-list-pane">
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
      <section class="mail-detail-pane">
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
import Aside from '@/layout/aside/index.vue'
import ContentPane from '@/views/content/index.vue'
import CommandPalette from '@/components/command-palette/index.vue'
import SendQuotaWidget from '@/components/send-quota-widget/index.vue'
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
import { emailArchive } from '@/request/email.js'
import { checkAndDownloadAndroidUpdate } from '@/utils/android-update-service.js'
import {
  resetSyncState, startFallbackPolling, stopFallbackPolling, installLifecycleSync,
} from '@/utils/mail-sync-service.js'

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
const LIST_WIDTH_KEY = 'psgMailListWidth'
const DEFAULT_LIST_WIDTH = 440
const listPaneWidth = ref(Number(localStorage.getItem(LIST_WIDTH_KEY)) || DEFAULT_LIST_WIDTH)
let resizeStartX = 0
let resizeStartWidth = 0
const resizerDragging = ref(false)

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
  const next = resizeStartWidth + (e.clientX - resizeStartX)
  listPaneWidth.value = Math.min(650, Math.max(340, next))
}

function stopListResize() {
  resizerDragging.value = false
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
  localStorage.setItem(LIST_WIDTH_KEY, String(listPaneWidth.value))
  window.removeEventListener('mousemove', onListResize)
  window.removeEventListener('mouseup', stopListResize)
}

function resetListWidth() {
  listPaneWidth.value = DEFAULT_LIST_WIDTH
  localStorage.setItem(LIST_WIDTH_KEY, String(DEFAULT_LIST_WIDTH))
}
let elNotification = null
let noticeStyle = null

const actionsShortcuts = [
  { key: 'C',      label: 'shortcutCompose'  },
  { key: 'R',      label: 'shortcutReply'    },
  { key: 'A',      label: 'shortcutReplyAll' },
  { key: 'F',      label: 'shortcutForward'  },
  { key: 'E',      label: 'shortcutArchive'  },
  { key: '/',      label: 'shortcutSearch'   },
  { key: 'Ctrl K', label: 'shortcutCommandPalette' },
  { key: '?',      label: 'shortcutHelp'     },
]
const navShortcuts = [
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
    case 'e':
      if (email?.emailId) {
        emailArchive([email.emailId]).then(() => {
          emailStore.emailScroll?.deleteEmail?.([email.emailId])
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

watch(() => uiStore.mobileDetailOpen, (open) => {
  if (!isMobile.value) return
  if (open) {
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
  box-shadow: 0 2px 10px rgba(0,0,0,.20);
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
/* ── Shell: CSS grid, replaces el-container/el-aside ───────── */
.app-shell {
  height: 100vh;
  overflow: hidden;
  display: grid;
  position: fixed;
  inset: 0;

  /* Mail mode: sidebar | list | resizer | detail */
  &[data-mode="mail"] {
    grid-template-columns: 256px clamp(340px, var(--mail-list-w, 440px), 650px) 6px minmax(340px, 1fr);

    &[data-collapsed="true"] {
      grid-template-columns: 72px clamp(340px, var(--mail-list-w, 440px), 650px) 6px minmax(340px, 1fr);
    }
  }

  /* Workspace mode: sidebar | content */
  &[data-mode="workspace"] {
    grid-template-columns: 256px minmax(0, 1fr);

    &[data-collapsed="true"] {
      grid-template-columns: 72px minmax(0, 1fr);
    }
  }

  /* Tablet: reduce list width */
  @media (max-width: 1280px) {
    &[data-mode="mail"] {
      grid-template-columns: 256px clamp(300px, var(--mail-list-w, 380px), 480px) 6px minmax(0, 1fr);
      &[data-collapsed="true"] {
        grid-template-columns: 72px clamp(300px, var(--mail-list-w, 380px), 480px) 6px minmax(0, 1fr);
      }
    }
  }

  /* Mobile: single column */
  @media (max-width: 1024px) {
    display: block !important;
    height: 100dvh;
  }
}

/* ── macOS: traffic-light safe area ────────────────────────── */
/* hiddenInset puts traffic lights in top-left of the window (inside the sidebar).
   The sidebar-brand block already has -webkit-app-region:drag which acts as the
   drag handle. No extra padding needed — traffic lights sit at y=18 which aligns
   naturally with the brand block padding. */
.app-shell[data-platform="darwin"] {
  /* nothing extra needed for now — handled per-pane below if required */
}

/* ── Sidebar backdrop (mobile) ─────────────────────────────── */
.sidebar-backdrop {
  display: none;
  position: fixed;
  inset: 0;
  z-index: 40;
  pointer-events: none;
  background: rgba(0, 0, 0, 0);
  opacity: 0;
  transition: opacity 160ms ease, background 160ms ease;

  @media (max-width: 1024px) {
    display: block;

    &[data-open="true"] {
      pointer-events: auto;
      background: rgba(0, 0, 0, 0.35);
      opacity: 1;
    }
  }
}

/* ── Mail panes ────────────────────────────────────────────── */
.mail-list-pane {
  min-height: 0;
  overflow: hidden;
  border-right: 1px solid var(--psg-border);
  background: var(--psg-surface);
  border-radius: var(--psg-radius-md);

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
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  background: var(--psg-canvas);
  padding: 0;

  /* Mobile: a full-screen reading page (its own back button + actions) */
  @media (max-width: 1024px) {
    position: fixed;
    inset: 0;
    height: auto;
    padding: 0;
    z-index: 35;
  }
}

/* Mobile: list and reading view are separate screens */
@media (max-width: 1024px) {
  .app-shell[data-mobile-detail="true"]  .mail-list-pane { display: none; }
  .app-shell[data-mobile-detail="false"] .mail-detail-pane { display: none; }
}

/* ── Workspace pane ────────────────────────────────────────── */
.workspace-pane {
  min-height: 0;
  overflow: hidden;
  background: var(--psg-canvas);
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
    --m-tabbar-h: calc(62px + env(safe-area-inset-bottom, 0px));
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
  .app-shell[data-mobile-detail="true"] .mobile-chrome--top,
  .app-shell[data-mobile-detail="true"] .mobile-chrome--bottom {
    display: none;
  }
}
</style>
