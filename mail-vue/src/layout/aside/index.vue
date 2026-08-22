<template>
  <aside class="mail-sidebar"
         :data-collapsed="String(collapsed)"
         :data-open="String(uiStore.asideShow)">

    <!-- ── Brand ────────────────────────────────────────── -->
    <div class="sidebar-brand" :class="{ 'sidebar-brand--mac': isMac }">
      <div class="brand-text-block">
        <div class="brand-name">PANORAMA SCHOLARLY GROUP</div>
        <div class="brand-sub">INSTITUTIONAL MAIL</div>
      </div>
      <img class="brand-abbr" src="/image/psg-logo.png" alt="PSG" />
    </div>

    <!-- ── Header ───────────────────────────────────────── -->
    <div class="sidebar-header">
      <div class="acct-section">
        <div class="sidebar-account-avatar" :style="{ background: acctAvatarBg }">
          <span class="acct-fallback">{{ acctInitial }}</span>
          <img v-if="userStore.avatar" :src="userStore.avatar" class="acct-img"
               @error="e => e.target.style.display = 'none'" />
        </div>
        <div class="sidebar-user-meta" @click="router.push({ name: 'setting' })">
          <div class="acct-name">{{ userStore.user.name || userStore.user.email }}</div>
          <div class="acct-email">{{ userStore.user.email }}</div>
        </div>
      </div>
      <div class="header-btns">
        <button class="icon-button sidebar-collapse-button"
                :title="collapsed ? $t('expand') : $t('collapse')"
                :aria-label="collapsed ? $t('expand') : $t('collapse')"
                @click="uiStore.asideCollapsed = !uiStore.asideCollapsed">
          <Icon icon="psg:menu" width="20" height="20" />
        </button>
        <button class="icon-button sidebar-close-button"
                :title="$t('close')"
                :aria-label="$t('close')"
                @click="uiStore.asideShow = false">
          <Icon icon="psg:close-circle" width="20" height="20" />
        </button>
      </div>
    </div>

    <!-- ── Scrollable nav area ──────────────────────────── -->
    <div class="sidebar-nav-scroll">

      <!-- Primary nav, grouped by frequency rather than one long flat list. -->
      <template v-for="section in navSections" :key="section.key">
        <div v-if="section.titleKey && section.key !== 'more'" class="sidebar-section-title nav-group-title">
          {{ $t(section.titleKey) }}
        </div>
        <button v-else-if="section.key === 'more'"
                type="button"
                class="sidebar-section-title nav-group-title nav-group-toggle"
                :aria-expanded="moreSectionExpanded"
                :aria-controls="`sidebar-section-${section.key}`"
                @click="toggleMoreSection">
          <span>{{ $t(section.titleKey) }}</span>
          <Icon icon="psg:chevron-down" width="14" height="14"
                class="nav-group-chevron"
                :class="{ 'is-open': moreSectionExpanded }" />
        </button>
        <nav v-if="section.key !== 'more' || moreSectionExpanded"
             :id="section.key === 'more' ? `sidebar-section-${section.key}` : undefined"
             class="sidebar-nav">
          <el-tooltip v-for="item in section.items" :key="item.name"
                      :content="$t(item.labelKey)" placement="right" :disabled="!collapsed">
            <div v-if="!item.perm || hasPerm(item.perm)"
                 class="sidebar-nav-link"
                 :class="{ active: route.meta.name === item.name }"
                 @click="router.push({ name: item.name })">
              <span class="sidebar-nav-content">
                <Icon :icon="item.icon" width="20" height="20" class="nav-icon" />
                <span class="sidebar-label">{{ $t(item.labelKey) }}</span>
                <el-badge v-if="item.name === 'email' && emailStore.inboxUnreadCount > 0"
                          :value="emailStore.inboxUnreadCount"
                          :max="99"
                          class="inbox-unread-badge" />
              </span>
            </div>
          </el-tooltip>
        </nav>
        <div v-if="section.key !== 'mail'" class="sidebar-section-separator"></div>
      </template>

      <!-- Labels -->
      <template v-if="hasPerm('email:send')">
        <div class="sidebar-section-separator"></div>
        <div class="sidebar-section-title label-section-title">
          <span>{{ $t('labels') }}</span>
          <button type="button" class="label-add-btn" :title="$t('newLabel')" :aria-label="$t('newLabel')" @click="promptCreateLabel">
            <Icon icon="psg:add-circle" width="15" height="15" />
          </button>
        </div>
        <nav class="sidebar-nav" v-if="labelStore.labels.length">
          <el-tooltip v-for="l in labelStore.labels" :key="l.labelId"
                      :content="l.name" placement="right" :disabled="!collapsed">
            <div class="sidebar-nav-link"
                 :class="{ active: route.name === 'label' && Number(route.params.id) === l.labelId }"
                 @click="router.push({ name: 'label', params: { id: l.labelId } })">
              <span class="sidebar-nav-content">
                <span class="label-dot" :style="{ background: l.color }"></span>
                <span class="sidebar-label">{{ l.name }}</span>
                <span class="label-count" v-if="l.emailCount">{{ l.emailCount }}</span>
              </span>
            </div>
          </el-tooltip>
        </nav>
      </template>

      <!-- Admin section -->
      <template v-if="visibleAdminItems.length">
        <div class="sidebar-section-separator"></div>
        <div class="sidebar-section-title">{{ $t('manage') }}</div>
        <nav class="sidebar-nav">
          <el-tooltip v-for="item in visibleAdminItems" :key="item.name"
                      :content="$t(item.labelKey)" placement="right" :disabled="!collapsed">
            <div class="sidebar-nav-link"
                 :class="{ active: route.meta.name === item.name }"
                 @click="router.push({ name: item.name })">
              <span class="sidebar-nav-content">
                <Icon :icon="item.icon" width="20" height="20" class="nav-icon" />
                <span class="sidebar-label">{{ $t(item.labelKey) }}</span>
              </span>
            </div>
          </el-tooltip>
        </nav>
      </template>

    </div>

    <!-- ── Footer ───────────────────────────────────────── -->
    <div class="sidebar-footer">
      <div class="sidebar-bottom-actions">

        <!-- Compose — collapsed: icon only -->
        <el-tooltip v-if="canSend && collapsed" :content="$t('compose')" placement="right">
          <button type="button" class="compose-icon-btn" :aria-label="$t('compose')" @click="openCompose">
            <Icon icon="psg:compose" width="20" height="20" />
          </button>
        </el-tooltip>
        <!-- Compose — expanded: full button -->
        <button v-else-if="canSend" type="button" class="sidebar-compose-button" @click="openCompose">
          <Icon icon="psg:compose" width="20" height="20" />
          <span>{{ $t('compose') }}</span>
        </button>

        <!-- Utility cluster: search / notifications / AI assistant / more, grouped as one unit -->
        <div class="sidebar-util-cluster">
          <!-- Real backend mail search — distinct from Command Palette (Ctrl+K) -->
          <el-tooltip :content="$t('search') + ' (/)'" placement="right">
            <button type="button" class="util-btn" :aria-label="$t('search')" @click="router.push({ name: 'search' })">
              <Icon icon="psg:search" width="18" height="18" />
            </button>
          </el-tooltip>

          <div class="notif-trigger-wrap">
            <NotificationPanel />
          </div>

          <!-- ··· dropdown -->
          <el-dropdown placement="top-end" trigger="click">
            <button type="button" class="util-btn util-more-btn" :aria-label="$t('more')">
              <span class="more-dots"><span/><span/><span/></span>
              <span v-if="!collapsed" class="utility-more-label">{{ $t('more') }}</span>
            </button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item @click="router.push({ name: 'setting' })">
                  <div class="drop-item">
                    <Icon icon="psg:settings" width="17" height="17" />
                    <span>{{ $t('settings') }}</span>
                  </div>
                </el-dropdown-item>
                <el-dropdown-item @click="router.push({ name: 'download' })">
                  <div class="drop-item">
                    <Icon icon="psg:download" width="17" height="17" />
                    <span>{{ $t('download') }}</span>
                  </div>
                </el-dropdown-item>
                <el-dropdown-item @click="router.push({ name: 'vpn' })">
                  <div class="drop-item">
                    <Icon icon="psg:shield" width="17" height="17" />
                    <span>{{ $t('vpn') }}</span>
                  </div>
                </el-dropdown-item>
                <el-dropdown-item divided disabled>
                  <div class="drop-item theme-menu-heading">
                    <Icon icon="solar:palette-linear" width="17" height="17" />
                    <span>{{ $t('theme') }}</span>
                    <span class="theme-current-label">{{ currentThemeLabel }}</span>
                  </div>
                </el-dropdown-item>
                <el-dropdown-item
                  v-for="option in themeOptions"
                  :key="option.value"
                  :class="{ 'theme-option-active': activeThemeMode === option.value }"
                  @click="uiStore.setThemeMode(option.value)"
                >
                  <div class="drop-item theme-option" role="menuitemradio"
                       :aria-checked="activeThemeMode === option.value">
                    <Icon :icon="option.icon" width="17" height="17" />
                    <span>{{ $t(option.labelKey) }}</span>
                    <Icon v-if="activeThemeMode === option.value"
                          icon="psg:check-circle" width="16" height="16" class="theme-check" />
                  </div>
                </el-dropdown-item>
                <el-dropdown-item disabled>
                  <div class="drop-item theme-menu-heading">
                    <Icon icon="psg:globe" width="17" height="17" />
                    <span>{{ $t('language') }}</span>
                    <span class="theme-current-label">{{ currentLanguageLabel }}</span>
                  </div>
                </el-dropdown-item>
                <el-dropdown-item
                  v-for="option in languageOptions"
                  :key="option.value"
                  :class="{ 'theme-option-active': activeLanguage === option.value }"
                  @click="changeLanguage(option.value)"
                >
                  <div class="drop-item theme-option" role="menuitemradio"
                       :aria-checked="activeLanguage === option.value">
                    <span class="language-mark">{{ option.mark }}</span>
                    <span>{{ option.label }}</span>
                    <Icon v-if="activeLanguage === option.value"
                          icon="psg:check-circle" width="16" height="16" class="theme-check" />
                  </div>
                </el-dropdown-item>
                <el-dropdown-item @click="clickLogout" class="logout-item">
                  <div class="drop-item">
                    <Icon icon="psg:logout" width="17" height="17" />
                    <span>{{ $t('logOut') }}</span>
                  </div>
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>

      </div>
    </div>

  </aside>
</template>

<script setup>
import router from "@/router/index.js";
import { useRoute } from "vue-router";
import { Icon } from "@iconify/vue";
import { useUiStore } from "@/store/ui.js";
import { useUserStore } from "@/store/user.js";
import { useEmailStore } from "@/store/email.js";
import { useSettingStore } from "@/store/setting.js";
import { useLabelStore } from "@/store/label.js";
import { hasPerm } from "@/perm/perm.js";
import { logout } from "@/request/login.js";
import { labelCreate } from "@/request/label.js";
import { computed, ref, watch, onMounted, onUnmounted } from "vue";
import { useI18n } from "vue-i18n";
import { avatarBg, avatarLetter } from "@/utils/avatar.js";
import NotificationPanel from '@/components/notification-panel/index.vue'
import { useNotificationStore } from '@/store/notification.js'

const { t } = useI18n();
const route  = useRoute();
const uiStore = useUiStore();
const userStore = useUserStore();
const emailStore = useEmailStore();
const settingStore = useSettingStore();
const labelStore = useLabelStore();
const notificationStore = useNotificationStore();

onMounted(() => { if (hasPerm('email:send')) labelStore.load(); })

const LABEL_COLORS = ['#7e7576', '#c48c00', '#2f9e52', '#1890ff', '#a855f7', '#ef1748']

async function promptCreateLabel() {
  try {
    const { value } = await ElMessageBox.prompt(t('newLabelPrompt'), t('newLabel'), {
      confirmButtonText: t('confirm'),
      cancelButtonText: t('cancel'),
      inputValidator: v => !!v?.trim() || t('labelNameRequired'),
    })
    const color = LABEL_COLORS[labelStore.labels.length % LABEL_COLORS.length]
    const created = await labelCreate(value.trim(), color)
    labelStore.upsertLocal(created)
    router.push({ name: 'label', params: { id: created.labelId } })
  } catch (e) {
    if (e === 'cancel') return
    ElMessage({ message: t('operationFailMsg'), type: 'error', plain: true })
  }
}

/* ── macOS traffic-light detection ── */
const isMac = !!window.electronAPI?.isMac;

/* ── Collapse ── */
const isMobile = ref(window.innerWidth < 1025);
const onResize = () => { isMobile.value = window.innerWidth < 1025; };
window.addEventListener('resize', onResize);
onUnmounted(() => window.removeEventListener('resize', onResize));
const collapsed = computed(() => uiStore.asideCollapsed && !isMobile.value);

/* ── Account ── */
const acctAvatarBg = computed(() => avatarBg(userStore.user?.email || ''));
const acctInitial  = computed(() => avatarLetter(userStore.user?.name, userStore.user?.email));

const themeOptions = [
  { value: 'light', labelKey: 'themeLight', icon: 'solar:sun-linear' },
  { value: 'dark', labelKey: 'themeDark', icon: 'solar:moon-linear' },
  { value: 'system', labelKey: 'themeSystem', icon: 'solar:monitor-linear' },
];
const activeThemeMode = computed(() => uiStore.themeMode || (uiStore.dark ? 'dark' : 'light'));
const currentThemeLabel = computed(() => {
  const option = themeOptions.find(item => item.value === activeThemeMode.value);
  return option ? t(option.labelKey) : t('themeLight');
});

const languageOptions = [
  { value: 'zh', label: '中文', mark: '中' },
  { value: 'en', label: 'English', mark: 'EN' },
];
const activeLanguage = computed(() => settingStore.lang || (navigator.language?.startsWith('zh') ? 'zh' : 'en'));
const currentLanguageLabel = computed(() =>
  languageOptions.find(item => item.value === activeLanguage.value)?.label || 'English'
);

const moreSectionExpanded = ref(false);
const moreSectionRoutes = new Set(['star', 'archive', 'spam', 'trash']);

watch(() => route.meta.name, (name) => {
  if (moreSectionRoutes.has(name)) moreSectionExpanded.value = true;
}, { immediate: true });

function toggleMoreSection() {
  moreSectionExpanded.value = !moreSectionExpanded.value;
}

function changeLanguage(lang) {
  if (lang === activeLanguage.value) return;
  let setting = {};
  try { setting = JSON.parse(localStorage.getItem('setting') || '{}'); } catch {}
  settingStore.lang = lang;
  localStorage.setItem('setting', JSON.stringify({ ...setting, lang }));
  window.location.reload();
}

/* ── Can compose ── */
const canSend = computed(() => hasPerm('email:send'));

/* ── Nav items ── */
const navSections = [
  {
    key: 'mail',
    titleKey: 'mailSection',
    items: [
      { name: 'all-inbox', labelKey: 'allInbox',  icon: 'psg:layers' },
      { name: 'email',     labelKey: 'inbox',     icon: 'psg:inbox' },
      { name: 'send',      labelKey: 'sent',      icon: 'psg:send',  perm: 'email:send' },
      { name: 'draft',     labelKey: 'drafts',    icon: 'psg:draft', perm: 'email:send' },
      { name: 'scheduled', labelKey: 'scheduled', icon: 'psg:clock', perm: 'email:send' },
    ],
  },
  {
    key: 'more',
    titleKey: 'more',
    items: [
      { name: 'star',    labelKey: 'starred',       icon: 'psg:bookmark' },
      { name: 'archive', labelKey: 'archiveFolder', icon: 'psg:archive' },
      { name: 'spam',    labelKey: 'spam',          icon: 'psg:spam' },
      { name: 'trash',   labelKey: 'deletedMail',   icon: 'psg:trash' },
    ],
  },
  {
    key: 'workspace',
    titleKey: 'workspace',
    items: [
      { name: 'templates', labelKey: 'templates',     icon: 'psg:template' },
      { name: 'groups',    labelKey: 'contactGroups', icon: 'psg:group' },
      { name: 'rules',     labelKey: 'subjectKeywords', icon: 'psg:tag' },
    ],
  },
];

const adminItems = [
  { name: 'analysis',    labelKey: 'analytics',      icon: 'psg:analytics', perm: 'analysis:query' },
  { name: 'access-mgmt', labelKey: 'accessManagement', icon: 'psg:group',   perm: ['user:query', 'role:query', 'reg-key:query'] },
  { name: 'all-email',   labelKey: 'allMail',         icon: 'psg:all-mail',  perm: 'all-email:query' },
  { name: 'sys-setting', labelKey: 'SystemSettings',  icon: 'psg:system',    perm: 'setting:query' },
];

const visibleAdminItems = computed(() =>
  adminItems.filter(item => !item.perm || hasPerm(item.perm))
);

/* ── Actions ── */
function openCompose() {
  uiStore.writerRef?.open?.();
}

function clickLogout() {
  // Notifications are intentionally in-memory, but the layout can survive
  // until router navigation completes. Clear them before the next account
  // can render so one user cannot see the previous user's mail subjects.
  notificationStore.clear({ resetPersistence: true })
  logout().catch(() => null).finally(() => {
    localStorage.removeItem('token');
    router.replace('/login');
  });
}
</script>

<style lang="scss" scoped>
/* ══════════════════════════════════════════════════════════
   Sidebar — PSG institutional shell (light / dark adaptive)
   ══════════════════════════════════════════════════════════ */
.mail-sidebar {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 256px;
  background: var(--psg-surface);
  border-right: 1px solid var(--psg-border);
  border-radius: var(--psg-radius-md);
  overflow: hidden;
  transition: width 0.22s cubic-bezier(0.22, 1, 0.36, 1);

  @media (max-width: 1024px) {
    position: fixed;
    inset: 0 auto 0 0;
    z-index: 50;
    width: min(88vw, 310px);
    transform: translateX(-105%);
    transition: transform 160ms ease;

    &[data-open="true"] { transform: translateX(0); }
  }
}

/* ── Brand ───────────────────────────────────────────────── */
.sidebar-brand {
  display: flex;
  align-items: flex-start;
  padding: 18px 20px 14px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--psg-border);
  -webkit-app-region: drag;

  /* macOS hiddenInset: trafficLightPosition y=18, button h≈14px → bottom≈32px.
     Push brand content to y≈46 so it clears the traffic lights. */
  &.sidebar-brand--mac { padding-top: 46px; }
}

.sidebar-brand * {
  -webkit-app-region: no-drag;
}

.brand-text-block {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.brand-name {
  font-family: var(--psg-font-sans);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--psg-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.brand-sub {
  font-family: var(--psg-font-sans);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--psg-text-muted);
  white-space: nowrap;
}

.brand-abbr {
  display: none;
  width: 36px;
  height: 36px;
  object-fit: contain;
  filter: var(--psg-logo-invert, none);
}

/* ── Header ──────────────────────────────────────────────── */
.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 12px 14px 20px;
  flex-shrink: 0;
  gap: 8px;
  border-bottom: 1px solid var(--psg-border);
}

.acct-section {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex: 1;
}

.sidebar-account-avatar {
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
  border-radius: var(--psg-radius-xs);

  .acct-fallback {
    color: #fff;
    font-size: 14px;
    font-weight: 700;
    line-height: 1;
  }

  .acct-img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.sidebar-user-meta {
  min-width: 0;
  flex: 1;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 2px;

}

.acct-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--psg-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.acct-email {
  font-family: var(--psg-font-mono);
  font-size: 10px;
  color: var(--psg-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.header-btns {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

/* ── Notification bell wrapper (sized to match footer util-btn) ── */
.notif-trigger-wrap :deep(.icon-btn) {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--psg-radius-md);
  cursor: pointer;
  color: var(--psg-text-secondary);
  transition: background 0.14s ease, color 0.14s ease, transform 0.1s ease;
  flex-shrink: 0;

  @media (hover: hover) {
    &:hover {
      background: var(--psg-surface-active);
      color: var(--psg-text);
    }
  }
  &:active { transform: scale(0.92); }
}

/* ── Icon button ─────────────────────────────────────────── */
.icon-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border: none;
  border-radius: var(--psg-radius-md);
  background: transparent;
  cursor: pointer;
  color: var(--psg-text-secondary);
  transition: background 0.12s, color 0.12s;
  flex-shrink: 0;

  @media (hover: hover) {
    &:hover {
      background: var(--psg-surface-active);
      color: var(--psg-text);
    }
  }
}

/* Close button only shows on mobile */
.sidebar-close-button { display: none; }
@media (max-width: 1024px) {
  .sidebar-close-button { display: flex; }
  .sidebar-collapse-button { display: none; }
}

/* ── Scrollable nav wrapper ───────────────────────────────── */
.sidebar-nav-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 8px 0;
}

/* ── Nav ─────────────────────────────────────────────────── */
.sidebar-nav {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.sidebar-nav-link {
  display: flex;
  align-items: center;
  height: 40px;
  margin: 0 10px;
  padding: 0 12px;
  font-size: 13.5px;
  font-weight: 500;
  letter-spacing: 0;
  text-transform: none;
  font-family: var(--psg-font-sans);
  cursor: pointer;
  color: var(--psg-text-secondary);
  border-radius: var(--psg-radius-md);
  transition: background 0.12s ease, color 0.12s ease;
  user-select: none;

  @media (hover: hover) {
    &:not(.active):hover {
      background: var(--psg-surface-muted);
      color: var(--psg-text);
    }
  }

  /* Soft filled pill, not a hard ruled indicator. */
  &.active {
    background: var(--psg-menu-active-bg);
    color: var(--psg-menu-active-text);
    font-weight: 700;
  }
}

.sidebar-nav-content {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  flex: 1;
}

.nav-icon { flex-shrink: 0; }

.sidebar-label {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.inbox-unread-badge {
  flex-shrink: 0;
  :deep(.el-badge__content) {
    font-size: 10px;
    font-family: var(--psg-font-mono);
    font-weight: 700;
    background: var(--psg-danger);
    border: none;
    border-radius: var(--psg-radius-xs);
    padding: 0 4px;
    min-width: 18px;
    height: 16px;
    line-height: 16px;
  }
}

/* ── Admin separator + title ─────────────────────────────── */
.sidebar-section-separator {
  height: 1px;
  background: var(--psg-border);
  margin: 10px 16px;
}

.sidebar-section-title {
  font-size: 10.5px;
  font-weight: 700;
  color: var(--psg-text-muted);
  padding: 0 20px;
  margin-bottom: 4px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-family: var(--psg-font-sans);
}

.nav-group-title {
  margin-top: 8px;
}

.nav-group-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  border: 0;
  background: transparent;
  color: var(--psg-text-muted);
  text-align: left;
  cursor: pointer;
  transition: color 0.14s ease;

  &:hover { color: var(--psg-text); }
  &:focus-visible {
    outline: 2px solid var(--psg-primary);
    outline-offset: -2px;
  }
}

.nav-group-chevron {
  flex-shrink: 0;
  transition: transform 0.16s ease;
}

.nav-group-chevron.is-open {
  transform: rotate(180deg);
}

.label-section-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.label-add-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: none;
  background: transparent;
  color: var(--psg-text-muted);
  cursor: pointer;
  border-radius: var(--psg-radius-sm);
  transition: background 0.1s, color 0.1s;

  &:hover { background: var(--psg-surface-muted); color: var(--psg-text); }
}

.label-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.label-count {
  margin-left: auto;
  font-size: 10.5px;
  font-weight: 700;
  color: var(--psg-text-secondary);
  font-variant-numeric: tabular-nums;
}

/* ── Footer ──────────────────────────────────────────────── */
.sidebar-footer {
  padding: 14px 16px;
  flex-shrink: 0;
  border-top: 1px solid var(--psg-border);
}

.sidebar-bottom-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.sidebar-compose-button {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 36px;
  border: none;
  border-radius: var(--psg-radius-md);
  background: var(--psg-primary);
  color: var(--psg-on-primary);
  font-size: 13.5px;
  font-weight: 600;
  letter-spacing: 0;
  text-transform: none;
  font-family: var(--psg-font-sans);
  cursor: pointer;
  box-shadow: var(--psg-shadow-sm);
  transition: background 0.14s ease, box-shadow 0.14s ease, transform 0.1s ease;

  @media (hover: hover) {
    &:hover { background: var(--psg-primary-hover); box-shadow: var(--psg-shadow-md); }
  }
  &:active { background: var(--psg-primary-active); transform: scale(0.97); box-shadow: var(--psg-shadow-xs); }
}

/* Secondary actions grouped into one quiet surface, distinct from the
   primary compose CTA rather than four buttons of equal weight. */
.sidebar-util-cluster {
  display: flex;
  align-items: center;
  gap: 2px;
  height: 36px;
  padding: 0 3px;
  flex-shrink: 0;
  border: 1px solid var(--psg-border);
  border-radius: var(--psg-radius-md);
  background: var(--psg-surface-muted);
}

.util-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  border: none;
  border-radius: var(--psg-radius-md);
  background: transparent;
  color: var(--psg-text-muted);
  cursor: pointer;
  transition: background 0.14s ease, color 0.14s ease, transform 0.1s ease;

  @media (hover: hover) {
    &:hover {
      background: var(--psg-surface);
      color: var(--psg-text);
    }
  }
  &:active { transform: scale(0.92); }
}

.more-dots {
  display: flex;
  align-items: center;
  gap: 3px;

  span {
    display: block;
    width: 3.5px;
    height: 3.5px;
    border-radius: 50%;
    background: currentColor;
  }
}

.util-more-btn {
  width: auto;
  min-width: 28px;
  gap: 7px;
  padding-inline: 6px;
}

.utility-more-label {
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}

.compose-icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  border: none;
  border-radius: var(--psg-radius-md);
  background: var(--psg-primary);
  color: var(--psg-on-primary);
  cursor: pointer;
  box-shadow: var(--psg-shadow-sm);
  transition: background 0.14s ease, transform 0.1s ease;

  @media (hover: hover) {
    &:hover { background: var(--psg-primary-hover); }
  }
  &:active { background: var(--psg-primary-active); transform: scale(0.94); }
}

/* Dropdown items */
.drop-item {
  display: flex;
  align-items: center;
  gap: 10px;
}

.theme-menu-heading {
  gap: 8px;
  font-weight: 600;
}

.theme-current-label {
  margin-left: auto;
  color: var(--psg-text-muted);
  font-size: 11px;
  font-weight: 500;
}

.theme-option {
  width: 100%;
}

.theme-option-active {
  color: var(--psg-menu-active-text) !important;
  background: var(--psg-menu-active-bg) !important;
}

.theme-check {
  margin-left: auto;
  color: var(--psg-primary);
}

.language-mark {
  width: 24px;
  flex: 0 0 24px;
  color: var(--psg-text-muted);
  font-family: var(--psg-font-mono);
  font-size: 11px;
  font-weight: 700;
  text-align: center;
}

/* ══════════════════════════════════════════════════════════
   Collapsed state
   ══════════════════════════════════════════════════════════ */
.mail-sidebar[data-collapsed="true"] {
  width: 72px;

  .sidebar-brand {
    justify-content: center;
    padding-inline: 12px;
  }

  .brand-text-block { display: none; }
  .brand-abbr { display: block; }

  .sidebar-header {
    flex-direction: column;
    gap: 8px;
    align-items: center;
    justify-content: center;
    padding-inline: 10px;
  }

  .acct-section {
    justify-content: center;
    flex: none;
  }

  .sidebar-user-meta,
  .sidebar-section-title,
  .sidebar-label {
    display: none;
  }

  .sidebar-collapse-button { margin-left: 0; }

  .sidebar-nav-link {
    justify-content: center;
    margin-inline: 8px;
    padding-inline: 0;
    border-left: none;
    border-radius: var(--psg-radius-sm);
  }

  .sidebar-nav-content {
    justify-content: center;
    gap: 0;
    flex: none;
  }

  .sidebar-section-separator { margin-inline: 14px; }

  .nav-group-title { margin-top: 8px; }

  .sidebar-footer { padding-inline: 10px; }

  .sidebar-bottom-actions {
    flex-direction: column;
    gap: 8px;
  }

  .sidebar-util-cluster {
    flex-direction: column;
    width: 34px;
    height: auto;
    padding: 3px;
    gap: 4px;
  }

  .util-more-btn {
    width: 28px;
    min-width: 28px;
    padding-inline: 0;
  }

  .utility-more-label { display: none; }
}
</style>
