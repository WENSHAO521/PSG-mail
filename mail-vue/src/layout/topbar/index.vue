<template>
  <!-- Mist top bar (desktop): brand · section nav · global search · compose,
       notifications and the account menu. Replaces the old sidebar. -->
  <header class="topbar" :class="{ 'topbar--mac': isMac }">
    <div class="tb-brand" @click="router.push({ name: 'email' })">
      <BrandLogo class="tb-mark" />
      <span class="tb-name">PSG Mail</span>
    </div>

    <nav class="tb-nav" :aria-label="$t('menu')">
      <button v-for="item in sections" :key="item.key" type="button" class="tb-nav-item"
              :class="{ active: item.active }" @click="router.push({ name: item.route })">
        {{ $t(item.labelKey) }}
      </button>
      <el-dropdown v-if="adminItems.length" trigger="click" placement="bottom-start">
        <button type="button" class="tb-nav-item" :class="{ active: adminActive }">
          {{ $t('manage') }}
          <Icon icon="psg:chevron-down" width="12" height="12" />
        </button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item v-for="item in adminItems" :key="item.name"
                              @click="router.push({ name: item.name })">
              <div class="tb-menu-item">
                <Icon :icon="item.icon" width="16" height="16" />
                <span>{{ $t(item.labelKey) }}</span>
              </div>
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </nav>

    <form class="tb-search" role="search" @submit.prevent="submitSearch">
      <Icon icon="psg:search" width="16" height="16" aria-hidden="true" />
      <label for="tb-search-input" class="tb-sr">{{ $t('search') }}</label>
      <input id="tb-search-input" ref="searchRef" v-model="query" type="search"
             :placeholder="$t('searchAllMailboxes')" @keydown.esc="query = ''; searchRef?.blur()" />
      <kbd class="tb-kbd">/</kbd>
    </form>

    <button v-if="canSend" type="button" class="tb-compose" @click="openCompose">
      <Icon icon="psg:compose" width="17" height="17" />
      <span>{{ $t('compose') }}</span>
    </button>

    <div class="tb-icon-wrap">
      <NotificationPanel />
    </div>

    <el-dropdown trigger="click" placement="bottom-end" popper-class="tb-account-popper">
      <button type="button" class="tb-avatar" :aria-label="$t('settings')">
        <img v-if="userStore.avatar" :src="userStore.avatar" alt="" @error="e => e.target.style.display = 'none'" />
        <span v-else>{{ initial }}</span>
      </button>
      <template #dropdown>
        <div class="tb-account-head">
          <strong>{{ userStore.user.name || userStore.user.email }}</strong>
          <span>{{ userStore.user.email }}</span>
        </div>
        <el-dropdown-menu>
          <el-dropdown-item @click="router.push({ name: 'setting' })">
            <div class="tb-menu-item"><Icon icon="psg:settings" width="16" height="16" /><span>{{ $t('settings') }}</span></div>
          </el-dropdown-item>
          <el-dropdown-item @click="uiStore.aiAssistantShow = true">
            <div class="tb-menu-item"><Icon icon="psg:sparkles" width="16" height="16" /><span>{{ $t('aiAssistant') }}</span></div>
          </el-dropdown-item>
          <el-dropdown-item @click="router.push({ name: 'download' })">
            <div class="tb-menu-item"><Icon icon="psg:download" width="16" height="16" /><span>{{ $t('download') }}</span></div>
          </el-dropdown-item>
          <el-dropdown-item @click="router.push({ name: 'vpn' })">
            <div class="tb-menu-item"><Icon icon="psg:shield" width="16" height="16" /><span>{{ $t('vpn') }}</span></div>
          </el-dropdown-item>
          <el-dropdown-item @click="router.push({ name: 'about' })">
            <div class="tb-menu-item"><Icon icon="solar:info-circle-linear" width="16" height="16" /><span>{{ $t('aboutApp') }}</span></div>
          </el-dropdown-item>
          <el-dropdown-item divided disabled>
            <div class="tb-menu-heading">{{ $t('theme') }}</div>
          </el-dropdown-item>
          <el-dropdown-item v-for="option in themeOptions" :key="option.value"
                            @click="uiStore.setThemeMode(option.value)">
            <div class="tb-menu-item" role="menuitemradio" :aria-checked="activeThemeMode === option.value">
              <span>{{ $t(option.labelKey) }}</span>
              <Icon v-if="activeThemeMode === option.value" icon="psg:check-circle" width="15" height="15" class="tb-check" />
            </div>
          </el-dropdown-item>
          <el-dropdown-item disabled>
            <div class="tb-menu-heading">{{ $t('language') }}</div>
          </el-dropdown-item>
          <el-dropdown-item v-for="option in languageOptions" :key="option.value"
                            @click="changeLanguage(option.value)">
            <div class="tb-menu-item" role="menuitemradio" :aria-checked="activeLanguage === option.value">
              <span>{{ option.label }}</span>
              <Icon v-if="activeLanguage === option.value" icon="psg:check-circle" width="15" height="15" class="tb-check" />
            </div>
          </el-dropdown-item>
          <el-dropdown-item divided @click="clickLogout">
            <div class="tb-menu-item tb-danger"><Icon icon="psg:logout" width="16" height="16" /><span>{{ $t('logOut') }}</span></div>
          </el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>
  </header>
</template>

<script setup>
import BrandLogo from "@/components/brand-logo/index.vue"
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { Icon } from '@iconify/vue'
import router from '@/router/index.js'
import { useUiStore } from '@/store/ui.js'
import { useUserStore } from '@/store/user.js'
import { useSettingStore } from '@/store/setting.js'
import { useNotificationStore } from '@/store/notification.js'
import { hasPerm } from '@/perm/perm.js'
import { logout } from '@/request/login.js'
import NotificationPanel from '@/components/notification-panel/index.vue'

const route = useRoute()
const uiStore = useUiStore()
const userStore = useUserStore()
const settingStore = useSettingStore()
const notificationStore = useNotificationStore()

const isMac = !!window.electronAPI?.isMac
const canSend = computed(() => hasPerm('email:send'))
const initial = computed(() => ((userStore.user?.name || userStore.user?.email || '?')[0] || '?').toUpperCase())

const MAIL_ROUTES = new Set(['email', 'all-inbox', 'send', 'draft', 'star', 'archive', 'spam', 'trash', 'label', 'search', 'scheduled'])
const sections = computed(() => [
  { key: 'mail', route: 'email', labelKey: 'mailSection', active: MAIL_ROUTES.has(route.meta?.name) },
  { key: 'groups', route: 'groups', labelKey: 'contactGroups', active: route.meta?.name === 'groups' },
  { key: 'templates', route: 'templates', labelKey: 'templates', active: route.meta?.name === 'templates' },
  { key: 'rules', route: 'rules', labelKey: 'subjectKeywords', active: route.meta?.name === 'rules' },
])

const ADMIN_ITEMS = [
  { name: 'analysis',    labelKey: 'analytics',        icon: 'psg:analytics', perm: 'analysis:query' },
  { name: 'access-mgmt', labelKey: 'accessManagement', icon: 'psg:group',     perm: ['user:query', 'role:query', 'reg-key:query'] },
  { name: 'all-email',   labelKey: 'allMail',          icon: 'psg:all-mail',  perm: 'all-email:query' },
  { name: 'sys-setting', labelKey: 'SystemSettings',   icon: 'psg:system',    perm: 'setting:query' },
]
const adminItems = computed(() => ADMIN_ITEMS.filter(item => hasPerm(item.perm)))
const adminActive = computed(() => ADMIN_ITEMS.some(item => item.name === route.meta?.name))

/* Global search: Enter opens the Search page with the query; "/" focuses. */
const query = ref('')
const searchRef = ref(null)
function submitSearch() {
  const q = query.value.trim()
  router.push({ name: 'search', query: q ? { q } : {} })
}
function onSlash(e) {
  if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return
  const tag = (e.target?.tagName || '').toLowerCase()
  if (tag === 'input' || tag === 'textarea' || e.target?.isContentEditable) return
  e.preventDefault()
  searchRef.value?.focus()
}
onMounted(() => window.addEventListener('keydown', onSlash))
onUnmounted(() => window.removeEventListener('keydown', onSlash))

function openCompose() {
  uiStore.writerRef?.open?.()
}

const themeOptions = [
  { value: 'light', labelKey: 'themeLight' },
  { value: 'dark', labelKey: 'themeDark' },
  { value: 'system', labelKey: 'themeSystem' },
]
const activeThemeMode = computed(() => uiStore.themeMode || (uiStore.dark ? 'dark' : 'light'))

const languageOptions = [
  { value: 'zh', label: '中文' },
  { value: 'en', label: 'English' },
]
const activeLanguage = computed(() => settingStore.lang || (navigator.language?.startsWith('zh') ? 'zh' : 'en'))
function changeLanguage(lang) {
  if (lang === activeLanguage.value) return
  let setting = {}
  try { setting = JSON.parse(localStorage.getItem('setting') || '{}') } catch {}
  settingStore.lang = lang
  localStorage.setItem('setting', JSON.stringify({ ...setting, lang }))
  window.location.reload()
}

function clickLogout() {
  // Clear in-memory notifications before the next account can render.
  notificationStore.clear({ resetPersistence: true })
  logout().catch(() => null).finally(() => {
    localStorage.removeItem('token')
    router.replace('/login')
  })
}
</script>

<style scoped lang="scss">
.topbar {
  display: flex;
  align-items: center;
  gap: 16px;
  height: 72px;
  padding: 0 4px;
  -webkit-app-region: drag;

  > * { -webkit-app-region: no-drag; }

  /* macOS hiddenInset traffic lights sit top-left. */
  &.topbar--mac { padding-left: 76px; }
}

.tb-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 196px;
  flex-shrink: 0;
  cursor: pointer;
}

.tb-mark {
  width: 26px;
  height: 31px;
  color: var(--psg-text);
}

.tb-name {
  font-size: 17px;
  font-weight: 700;
  letter-spacing: -.01em;
  color: var(--psg-text);
}

.tb-nav {
  display: flex;
  gap: 4px;
  padding: 4px;
  border-radius: var(--psg-radius-md);
  background: var(--psg-surface);
  flex-shrink: 0;
}

.tb-nav-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 36px;
  padding: 0 14px;
  border: 0;
  border-radius: var(--psg-radius-sm);
  background: transparent;
  color: var(--psg-text-secondary);
  font: inherit;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;

  @media (hover: hover) {
    &:hover:not(.active) { background: var(--psg-surface-muted); color: var(--psg-text); }
  }

  &.active {
    background: var(--psg-text);
    color: var(--psg-surface);
    font-weight: 600;
  }
}

.tb-search {
  flex: 1;
  max-width: 520px;
  min-width: 220px;
  margin-right: auto;
  display: flex;
  align-items: center;
  gap: 10px;
  height: 44px;
  padding: 0 14px 0 16px;
  border-radius: var(--psg-radius-md);
  background: var(--psg-surface);
  color: var(--psg-text-muted);
  transition: box-shadow .14s ease;

  &:focus-within { box-shadow: 0 0 0 2px var(--psg-primary); }

  input {
    flex: 1;
    min-width: 0;
    border: 0;
    outline: none;
    background: transparent;
    color: var(--psg-text);
    font: inherit;
    font-size: 14px;

    &::placeholder { color: var(--psg-text-muted); }
  }
}

.tb-kbd {
  font-family: var(--psg-font-mono);
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 6px;
  background: var(--psg-surface-muted);
  color: var(--psg-text-muted);
}

.tb-sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}

.tb-spacer { flex: 1; }

.tb-compose {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 44px;
  padding: 0 20px;
  border: 0;
  border-radius: var(--psg-radius-md);
  background: var(--psg-primary);
  color: var(--psg-on-primary);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
  flex-shrink: 0;
  transition: background .14s ease, transform .1s ease;

  @media (hover: hover) { &:hover { background: var(--psg-primary-hover); } }
  &:active { transform: scale(.97); }
}

.tb-icon-wrap :deep(.icon-btn),
.tb-avatar {
  width: 44px !important;
  height: 44px !important;
  border: 0 !important;
  border-radius: var(--psg-radius-md) !important;
  background: var(--psg-surface) !important;
  color: var(--psg-text) !important;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  cursor: pointer;
}

.tb-avatar {
  overflow: hidden;
  font: inherit;
  font-weight: 700;

  img { width: 100%; height: 100%; object-fit: cover; }
}

.tb-account-head {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 16px 8px;
  max-width: 260px;

  strong { font-size: 14px; color: var(--psg-text); }
  span { font-size: 12px; color: var(--psg-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
}

.tb-menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 180px;

  .tb-check { margin-left: auto; color: var(--psg-primary); }
}

.tb-menu-heading {
  font-size: 12px;
  font-weight: 600;
  color: var(--psg-text-muted);
}

.tb-danger { color: var(--psg-danger); }

@media (max-width: 1280px) {
  .tb-brand { width: auto; }
  .tb-name { display: none; }
}
</style>
