<template>
  <aside
    class="pro-sidebar"
    :class="{ 'is-mac': isMac }"
    :data-collapsed="String(collapsed)"
    :data-open="String(uiStore.asideShow)"
  >
    <header class="pro-brand">
      <div class="pro-brand-mark">
        <img src="/image/psg-logo.png" alt="PSG" />
      </div>
      <div class="pro-brand-copy">
        <strong>PSG Mail</strong>
        <span>Institutional Mail</span>
      </div>
      <button
        class="pro-icon-btn pro-close"
        :aria-label="$t('close')"
        :title="$t('close')"
        @click="uiStore.asideShow = false"
      >
        <Icon icon="solar:close-linear" width="19" height="19" />
      </button>
    </header>

    <section class="pro-account">
      <div class="pro-avatar" :style="{ background: acctAvatarBg }">
        <span>{{ acctInitial }}</span>
        <img
          v-if="userStore.avatar"
          :src="userStore.avatar"
          alt=""
          @error="e => { e.target.style.display = 'none' }"
        />
      </div>
      <button class="pro-account-copy" @click="go('setting')">
        <strong>{{ userStore.user.name || userStore.user.email }}</strong>
        <span>{{ userStore.user.email }}</span>
      </button>
      <button
        class="pro-icon-btn pro-collapse"
        :title="collapsed ? $t('expand') : $t('collapse')"
        @click="uiStore.asideCollapsed = !uiStore.asideCollapsed"
      >
        <Icon :icon="collapsed ? 'solar:sidebar-minimalistic-linear' : 'solar:sidebar-code-linear'" width="18" height="18" />
      </button>
    </section>

    <div class="pro-compose-wrap" v-if="canSend">
      <el-tooltip :content="$t('compose')" placement="right" :disabled="!collapsed">
        <button class="pro-compose" @click="openCompose">
          <Icon icon="psg:compose" width="19" height="19" />
          <span>{{ $t('compose') }}</span>
        </button>
      </el-tooltip>
    </div>

    <div class="pro-nav-scroll">
      <nav class="pro-nav" aria-label="Mail folders">
        <el-tooltip
          v-for="item in visibleMailItems"
          :key="item.name"
          :content="$t(item.labelKey)"
          placement="right"
          :disabled="!collapsed"
        >
          <button
            class="pro-nav-item"
            :class="{ active: isRoute(item.name) }"
            @click="go(item.name)"
          >
            <Icon :icon="item.icon" width="19" height="19" class="pro-nav-icon" />
            <span class="pro-nav-label">{{ $t(item.labelKey) }}</span>
            <el-badge
              v-if="item.name === 'email' && emailStore.inboxUnreadCount > 0"
              :value="emailStore.inboxUnreadCount"
              :max="99"
              class="pro-unread"
            />
          </button>
        </el-tooltip>
      </nav>

      <template v-if="hasPerm('email:send')">
        <div class="pro-divider"></div>
        <div class="pro-section-head">
          <span>{{ $t('labels') }}</span>
          <button class="pro-section-action" :title="$t('newLabel')" @click="promptCreateLabel">
            <Icon icon="solar:add-circle-linear" width="16" height="16" />
          </button>
        </div>
        <nav v-if="labelStore.labels.length" class="pro-nav pro-labels" aria-label="Labels">
          <el-tooltip
            v-for="label in labelStore.labels"
            :key="label.labelId"
            :content="label.name"
            placement="right"
            :disabled="!collapsed"
          >
            <button
              class="pro-nav-item"
              :class="{ active: route.name === 'label' && Number(route.params.id) === label.labelId }"
              @click="goLabel(label.labelId)"
            >
              <span class="pro-label-dot" :style="{ background: label.color }"></span>
              <span class="pro-nav-label">{{ label.name }}</span>
              <span v-if="label.emailCount" class="pro-count">{{ label.emailCount }}</span>
            </button>
          </el-tooltip>
        </nav>
      </template>

      <template v-if="visibleToolItems.length">
        <div class="pro-divider"></div>
        <nav class="pro-nav pro-tools" aria-label="Mail tools">
          <el-tooltip
            v-for="item in visibleToolItems"
            :key="item.name"
            :content="$t(item.labelKey)"
            placement="right"
            :disabled="!collapsed"
          >
            <button
              class="pro-nav-item pro-nav-item--quiet"
              :class="{ active: isRoute(item.name) }"
              @click="go(item.name)"
            >
              <Icon :icon="item.icon" width="18" height="18" class="pro-nav-icon" />
              <span class="pro-nav-label">{{ $t(item.labelKey) }}</span>
            </button>
          </el-tooltip>
        </nav>
      </template>

      <template v-if="visibleAdminItems.length">
        <div class="pro-divider"></div>
        <div class="pro-section-head pro-section-head--label">{{ $t('manage') }}</div>
        <nav class="pro-nav" aria-label="Administration">
          <el-tooltip
            v-for="item in visibleAdminItems"
            :key="item.name"
            :content="$t(item.labelKey)"
            placement="right"
            :disabled="!collapsed"
          >
            <button
              class="pro-nav-item pro-nav-item--quiet"
              :class="{ active: isRoute(item.name) }"
              @click="go(item.name)"
            >
              <Icon :icon="item.icon" width="18" height="18" class="pro-nav-icon" />
              <span class="pro-nav-label">{{ $t(item.labelKey) }}</span>
            </button>
          </el-tooltip>
        </nav>
      </template>
    </div>

    <footer class="pro-footer">
      <el-tooltip :content="$t('search') + ' (/)'" placement="top">
        <button class="pro-footer-btn" @click="go('search')">
          <Icon icon="solar:magnifer-linear" width="18" height="18" />
        </button>
      </el-tooltip>

      <div class="pro-notification">
        <NotificationPanel />
      </div>

      <el-tooltip v-if="aiAssistantEnabled" :content="$t('aiAssistantOpen')" placement="top">
        <button class="pro-footer-btn" @click="uiStore.aiAssistantShow = true">
          <Icon icon="solar:magic-stick-3-linear" width="18" height="18" />
        </button>
      </el-tooltip>

      <el-tooltip :content="$t('settings')" placement="top">
        <button class="pro-footer-btn" :class="{ active: isRoute('setting') }" @click="go('setting')">
          <Icon icon="psg:settings" width="18" height="18" />
        </button>
      </el-tooltip>

      <el-dropdown placement="top-end" trigger="click">
        <button class="pro-footer-btn" aria-label="More">
          <Icon icon="solar:menu-dots-bold" width="19" height="19" />
        </button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item @click="go('download')">
              <div class="pro-drop-item"><Icon icon="solar:download-minimalistic-linear" width="17" height="17" /><span>{{ $t('download') }}</span></div>
            </el-dropdown-item>
            <el-dropdown-item @click="go('vpn')">
              <div class="pro-drop-item"><Icon icon="solar:shield-network-linear" width="17" height="17" /><span>{{ $t('vpn') }}</span></div>
            </el-dropdown-item>
            <el-dropdown-item @click="go('about')">
              <div class="pro-drop-item"><Icon icon="solar:info-circle-linear" width="17" height="17" /><span>{{ $t('about') }}</span></div>
            </el-dropdown-item>
            <el-dropdown-item divided @click="toggleDark">
              <div class="pro-drop-item">
                <Icon :icon="uiStore.dark ? 'solar:sun-linear' : 'solar:moon-linear'" width="17" height="17" />
                <span>{{ uiStore.dark ? $t('lightMode') : $t('darkMode') }}</span>
              </div>
            </el-dropdown-item>
            <el-dropdown-item class="pro-logout" @click="clickLogout">
              <div class="pro-drop-item"><Icon icon="solar:logout-linear" width="17" height="17" /><span>{{ $t('logOut') }}</span></div>
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </footer>
  </aside>

  <AiAssistantDrawer />
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Icon } from '@iconify/vue'
import { useI18n } from 'vue-i18n'
import router from '@/router/index.js'
import { useUiStore } from '@/store/ui.js'
import { useUserStore } from '@/store/user.js'
import { useEmailStore } from '@/store/email.js'
import { useSettingStore } from '@/store/setting.js'
import { useLabelStore } from '@/store/label.js'
import { hasPerm } from '@/perm/perm.js'
import { logout } from '@/request/login.js'
import { labelCreate } from '@/request/label.js'
import { avatarBg, avatarLetter } from '@/utils/avatar.js'
import NotificationPanel from '@/components/notification-panel/index.vue'
import AiAssistantDrawer from '@/components/ai-assistant-drawer/index.vue'

const { t } = useI18n()
const route = useRoute()
const uiStore = useUiStore()
const userStore = useUserStore()
const emailStore = useEmailStore()
const settingStore = useSettingStore()
const labelStore = useLabelStore()

const LABEL_COLORS = ['#7e8796', '#b97918', '#2f8c5c', '#3d72c9', '#8358b8', '#b4233d']
const isMac = Boolean(window.electronAPI?.isMac)
const viewportWidth = ref(window.innerWidth)
const isMobile = computed(() => viewportWidth.value < 1025)
const collapsed = computed(() => uiStore.asideCollapsed && !isMobile.value)
const canSend = computed(() => hasPerm('email:send'))
const aiAssistantEnabled = computed(() => Number(settingStore.settings.aiAssistantStatus) === 0)
const acctAvatarBg = computed(() => avatarBg(userStore.user?.email || ''))
const acctInitial = computed(() => avatarLetter(userStore.user?.name, userStore.user?.email))

const mailItems = [
  { name: 'all-inbox', labelKey: 'allInbox', icon: 'solar:layers-linear' },
  { name: 'email', labelKey: 'inbox', icon: 'psg:inbox' },
  { name: 'send', labelKey: 'sent', icon: 'psg:send', perm: 'email:send' },
  { name: 'draft', labelKey: 'drafts', icon: 'psg:draft', perm: 'email:send' },
  { name: 'scheduled', labelKey: 'scheduled', icon: 'solar:clock-circle-linear', perm: 'email:send' },
  { name: 'star', labelKey: 'starred', icon: 'psg:bookmark' },
  { name: 'archive', labelKey: 'archiveFolder', icon: 'psg:archive' },
  { name: 'spam', labelKey: 'spam', icon: 'psg:spam' },
  { name: 'trash', labelKey: 'deletedMail', icon: 'solar:trash-bin-minimalistic-linear' },
]

const toolItems = [
  { name: 'templates', labelKey: 'templates', icon: 'psg:template', perm: 'email:send' },
  { name: 'groups', labelKey: 'contactGroups', icon: 'psg:group', perm: 'email:send' },
]

const adminItems = [
  { name: 'analysis', labelKey: 'analytics', icon: 'psg:analytics', perm: 'analysis:query' },
  { name: 'user', labelKey: 'allUsers', icon: 'psg:group', perm: 'user:query' },
  { name: 'all-email', labelKey: 'allMail', icon: 'psg:all-mail', perm: 'all-email:query' },
  { name: 'role', labelKey: 'permissions', icon: 'psg:lock', perm: 'role:query' },
  { name: 'reg-key', labelKey: 'inviteCode', icon: 'psg:key', perm: 'reg-key:query' },
  { name: 'sys-setting', labelKey: 'SystemSettings', icon: 'psg:system', perm: 'setting:query' },
]

const visibleMailItems = computed(() => mailItems.filter(item => !item.perm || hasPerm(item.perm)))
const visibleToolItems = computed(() => toolItems.filter(item => !item.perm || hasPerm(item.perm)))
const visibleAdminItems = computed(() => adminItems.filter(item => !item.perm || hasPerm(item.perm)))

function onResize() {
  viewportWidth.value = window.innerWidth
}

onMounted(() => {
  window.addEventListener('resize', onResize)
  if (hasPerm('email:send')) labelStore.load()
})

onUnmounted(() => window.removeEventListener('resize', onResize))

function isRoute(name) {
  return route.meta?.name === name || route.name === name
}

function go(name) {
  if (!isRoute(name)) router.push({ name })
  if (isMobile.value) uiStore.asideShow = false
}

function goLabel(id) {
  router.push({ name: 'label', params: { id } })
  if (isMobile.value) uiStore.asideShow = false
}

function openCompose() {
  uiStore.writerRef?.open?.()
  if (isMobile.value) uiStore.asideShow = false
}

async function promptCreateLabel() {
  try {
    const { value } = await ElMessageBox.prompt(t('newLabelPrompt'), t('newLabel'), {
      confirmButtonText: t('confirm'),
      cancelButtonText: t('cancel'),
      inputValidator: value => Boolean(value?.trim()) || t('labelNameRequired'),
    })
    const color = LABEL_COLORS[labelStore.labels.length % LABEL_COLORS.length]
    const created = await labelCreate(value.trim(), color)
    labelStore.upsertLocal(created)
    goLabel(created.labelId)
  } catch (error) {
    if (error === 'cancel' || error === 'close') return
    ElMessage({ message: t('operationFailMsg'), type: 'error', plain: true })
  }
}

function toggleDark() {
  const next = !uiStore.dark
  document.documentElement.setAttribute('class', next ? 'dark' : '')
  uiStore.dark = next
}

function clickLogout() {
  logout().catch(() => null).finally(() => {
    localStorage.removeItem('token')
    router.replace('/login')
  })
}
</script>

<style scoped>
.pro-sidebar {
  position: relative;
  width: 100%;
  height: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-right: 1px solid var(--pm-border, #e3e7ed);
  background: var(--pm-sidebar, #f7f8fa);
  color: var(--pm-text, #172033);
}

.pro-brand {
  min-height: 66px;
  padding: 13px 12px 9px 14px;
  display: flex;
  align-items: center;
  gap: 10px;
  -webkit-app-region: drag;
}
.pro-sidebar.is-mac .pro-brand { padding-top: 40px; min-height: 92px; }
.pro-brand > * { -webkit-app-region: no-drag; }

.pro-brand-mark {
  width: 34px;
  height: 34px;
  flex: 0 0 34px;
  display: grid;
  place-items: center;
  border-radius: 9px;
  background: var(--pm-surface, #fff);
  box-shadow: inset 0 0 0 1px var(--pm-border, #e3e7ed);
}
.pro-brand-mark img { width: 25px; height: 25px; object-fit: contain; }
:global(html.dark) .pro-brand-mark img { filter: invert(1); }

.pro-brand-copy { min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.pro-brand-copy strong { font-size: 16px; line-height: 20px; font-weight: 700; letter-spacing: -.015em; }
.pro-brand-copy span { color: var(--pm-text-3, #7d8797); font-size: 9.5px; line-height: 13px; font-weight: 650; letter-spacing: .08em; text-transform: uppercase; }

.pro-account {
  margin: 0 8px 8px;
  min-height: 50px;
  padding: 6px 6px;
  display: flex;
  align-items: center;
  gap: 8px;
  border-radius: 10px;
}
.pro-account:hover { background: var(--pm-surface-hover, #f3f5f8); }
.pro-avatar {
  position: relative;
  width: 34px;
  height: 34px;
  flex: 0 0 34px;
  display: grid;
  place-items: center;
  overflow: hidden;
  border-radius: 50%;
  color: #fff;
  font-size: 13px;
  font-weight: 700;
}
.pro-avatar img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.pro-account-copy {
  flex: 1;
  min-width: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.pro-account-copy strong,
.pro-account-copy span { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pro-account-copy strong { font-size: 12.5px; line-height: 17px; font-weight: 650; }
.pro-account-copy span { color: var(--pm-text-3, #7d8797); font-size: 10.5px; line-height: 15px; }

.pro-icon-btn,
.pro-footer-btn,
.pro-section-action {
  display: inline-grid;
  place-items: center;
  border: 0;
  background: transparent;
  color: var(--pm-text-3, #7d8797);
  cursor: pointer;
}
.pro-icon-btn { width: 32px; height: 32px; flex: 0 0 32px; border-radius: 8px; }
.pro-icon-btn:hover,
.pro-footer-btn:hover,
.pro-section-action:hover { background: var(--pm-surface-hover, #f3f5f8); color: var(--pm-text, #172033); }
.pro-close { display: none; }

.pro-compose-wrap { padding: 0 10px 10px; }
.pro-compose {
  width: 100%;
  height: 42px;
  padding: 0 13px;
  display: flex;
  align-items: center;
  gap: 10px;
  border: 1px solid rgba(var(--pm-brand-rgb, 180,35,61), .16);
  border-radius: 10px;
  background: var(--pm-brand, #b4233d);
  color: #fff;
  box-shadow: 0 4px 12px rgba(var(--pm-brand-rgb, 180,35,61), .14);
  cursor: pointer;
  font-size: 13px;
  font-weight: 650;
}
.pro-compose:hover { background: var(--pm-brand-hover, #971c32); }

.pro-nav-scroll { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; padding: 0 8px 8px; scrollbar-width: thin; scrollbar-color: transparent transparent; }
.pro-nav-scroll:hover { scrollbar-color: var(--pm-border-strong, #d4dae3) transparent; }
.pro-nav { display: flex; flex-direction: column; gap: 1px; }
.pro-nav-item {
  width: 100%;
  min-height: 36px;
  padding: 0 10px;
  display: flex;
  align-items: center;
  gap: 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--pm-text-2, #4f5b6e);
  cursor: pointer;
  text-align: left;
  font-size: 12.75px;
  font-weight: 520;
}
.pro-nav-item:hover { background: var(--pm-surface-hover, #f3f5f8); color: var(--pm-text, #172033); }
.pro-nav-item.active { background: var(--pm-brand-soft, #fbeef1); color: var(--pm-brand, #b4233d); font-weight: 650; }
.pro-nav-item--quiet { color: var(--pm-text-3, #7d8797); }
.pro-nav-icon { flex: 0 0 auto; color: currentColor; }
.pro-nav-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pro-unread { margin-left: auto; }
.pro-unread :deep(.el-badge__content) { min-width: 19px; height: 17px; padding: 0 5px; border: 0; background: var(--pm-brand, #b4233d); font-size: 9.5px; line-height: 17px; font-weight: 700; }

.pro-divider { height: 1px; margin: 9px 4px; background: var(--pm-border, #e3e7ed); }
.pro-section-head { min-height: 28px; padding: 3px 9px 5px; display: flex; align-items: center; justify-content: space-between; color: var(--pm-text-3, #7d8797); font-size: 9.5px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
.pro-section-head--label { justify-content: flex-start; }
.pro-section-action { width: 26px; height: 26px; border-radius: 7px; }
.pro-label-dot { width: 8px; height: 8px; flex: 0 0 8px; border-radius: 50%; }
.pro-count { margin-left: auto; color: var(--pm-text-3, #7d8797); font-size: 10px; font-variant-numeric: tabular-nums; }

.pro-footer {
  min-height: 52px;
  padding: 7px 8px 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 2px;
  border-top: 1px solid var(--pm-border, #e3e7ed);
  background: var(--pm-sidebar, #f7f8fa);
}
.pro-footer-btn { width: 34px; height: 34px; border-radius: 8px; }
.pro-footer-btn.active { background: var(--pm-brand-soft, #fbeef1); color: var(--pm-brand, #b4233d); }
.pro-notification :deep(.icon-btn) { width: 34px !important; height: 34px !important; display: grid !important; place-items: center !important; border-radius: 8px !important; color: var(--pm-text-3, #7d8797) !important; }
.pro-notification :deep(.icon-btn:hover) { background: var(--pm-surface-hover, #f3f5f8) !important; color: var(--pm-text, #172033) !important; }
.pro-drop-item { display: flex; align-items: center; gap: 9px; }
:deep(.pro-logout) { color: var(--pm-danger, #c53737) !important; }

.pro-sidebar[data-collapsed="true"] .pro-brand { justify-content: center; padding-inline: 8px; }
.pro-sidebar[data-collapsed="true"] .pro-brand-copy,
.pro-sidebar[data-collapsed="true"] .pro-account-copy,
.pro-sidebar[data-collapsed="true"] .pro-section-head,
.pro-sidebar[data-collapsed="true"] .pro-nav-label,
.pro-sidebar[data-collapsed="true"] .pro-count,
.pro-sidebar[data-collapsed="true"] .pro-unread { display: none; }
.pro-sidebar[data-collapsed="true"] .pro-account { justify-content: center; margin-inline: 5px; padding-inline: 0; }
.pro-sidebar[data-collapsed="true"] .pro-collapse { display: none; }
.pro-sidebar[data-collapsed="true"] .pro-compose-wrap { padding-inline: 9px; }
.pro-sidebar[data-collapsed="true"] .pro-compose { width: 42px; padding: 0; justify-content: center; }
.pro-sidebar[data-collapsed="true"] .pro-compose span { display: none; }
.pro-sidebar[data-collapsed="true"] .pro-nav-scroll { padding-inline: 6px; }
.pro-sidebar[data-collapsed="true"] .pro-nav-item { padding: 0; justify-content: center; }
.pro-sidebar[data-collapsed="true"] .pro-label-dot { width: 10px; height: 10px; flex-basis: 10px; }
.pro-sidebar[data-collapsed="true"] .pro-footer { flex-direction: column; justify-content: flex-start; padding-inline: 6px; }

@media (max-width: 1024px) {
  .pro-sidebar {
    position: fixed;
    inset: 0 auto 0 0;
    z-index: 60;
    width: min(88vw, 300px);
    transform: translateX(-104%);
    transition: transform .16s ease;
    box-shadow: 18px 0 44px rgba(17,25,39,.18);
  }
  .pro-sidebar[data-open="true"] { transform: translateX(0); }
  .pro-sidebar.is-mac .pro-brand,
  .pro-brand { min-height: calc(66px + env(safe-area-inset-top, 0px)); padding-top: calc(13px + env(safe-area-inset-top, 0px)); }
  .pro-close { display: inline-grid; margin-left: auto; }
  .pro-collapse { display: none; }
  .pro-footer { padding-bottom: calc(8px + env(safe-area-inset-bottom, 0px)); }
}

@media (prefers-reduced-motion: reduce) {
  .pro-sidebar { transition: none; }
}
</style>
