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
                @click="uiStore.asideCollapsed = !uiStore.asideCollapsed">
          <Icon icon="solar:hamburger-menu-linear" width="20" height="20" />
        </button>
        <button class="icon-button sidebar-close-button"
                :title="$t('close')"
                @click="uiStore.asideShow = false">
          <Icon icon="solar:close-circle-linear" width="20" height="20" />
        </button>
      </div>
    </div>

    <!-- ── Scrollable nav area ──────────────────────────── -->
    <div class="sidebar-nav-scroll">

      <!-- Primary nav -->
      <nav class="sidebar-nav">
        <el-tooltip v-for="item in navItems" :key="item.name"
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

      <!-- Labels -->
      <template v-if="hasPerm('email:send')">
        <div class="sidebar-section-separator"></div>
        <div class="sidebar-section-title label-section-title">
          <span>{{ $t('labels') }}</span>
          <button class="label-add-btn" :title="$t('newLabel')" @click="promptCreateLabel">
            <Icon icon="solar:add-circle-linear" width="15" height="15" />
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
          <button class="compose-icon-btn" @click="openCompose">
            <Icon icon="psg:compose" width="20" height="20" />
          </button>
        </el-tooltip>
        <!-- Compose — expanded: full button -->
        <button v-else-if="canSend" class="sidebar-compose-button" @click="openCompose">
          <Icon icon="psg:compose" width="20" height="20" />
          <span>{{ $t('compose') }}</span>
        </button>

        <!-- Utility cluster: search / notifications / AI assistant / more, grouped as one unit -->
        <div class="sidebar-util-cluster">
          <!-- Real backend mail search — distinct from Command Palette (Ctrl+K) -->
          <el-tooltip :content="$t('search') + ' (/)'" placement="right">
            <button class="util-btn" @click="router.push({ name: 'search' })">
              <Icon icon="solar:magnifer-linear" width="18" height="18" />
            </button>
          </el-tooltip>

          <div class="notif-trigger-wrap">
            <NotificationPanel />
          </div>

          <!-- AI mail assistant -->
          <el-tooltip v-if="aiAssistantEnabled" :content="$t('aiAssistantOpen')" placement="right">
            <button class="util-btn" @click="uiStore.aiAssistantShow = true">
              <Icon icon="solar:magic-stick-3-bold-duotone" width="18" height="18" />
            </button>
          </el-tooltip>

          <!-- ··· dropdown -->
          <el-dropdown placement="top-end" trigger="click">
            <button class="util-btn">
              <span class="more-dots"><span/><span/><span/></span>
            </button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item @click="toggleDark">
                  <div class="drop-item">
                    <Icon :icon="uiStore.dark ? 'solar:sun-linear' : 'solar:moon-linear'"
                          width="17" height="17" />
                    <span>{{ uiStore.dark ? $t('lightMode') : $t('darkMode') }}</span>
                  </div>
                </el-dropdown-item>
                <el-dropdown-item @click="clickLogout" class="logout-item">
                  <div class="drop-item">
                    <Icon icon="solar:logout-linear" width="17" height="17" />
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

  <AiAssistantDrawer />
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
import { computed, ref, onMounted, onUnmounted } from "vue";
import { useI18n } from "vue-i18n";
import { avatarBg, avatarLetter } from "@/utils/avatar.js";
import NotificationPanel from '@/components/notification-panel/index.vue'
import AiAssistantDrawer from '@/components/ai-assistant-drawer/index.vue'

const { t } = useI18n();
const route  = useRoute();
const uiStore = useUiStore();
const userStore = useUserStore();
const emailStore = useEmailStore();
const settingStore = useSettingStore();
const labelStore = useLabelStore();

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

/* ── AI assistant availability (admin-gated) ── */
const aiAssistantEnabled = computed(() => Number(settingStore.settings.aiAssistantStatus) === 0);

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

/* ── Can compose ── */
const canSend = computed(() => hasPerm('email:send'));

/* ── Nav items ── */
const navItems = [
  { name: 'all-inbox', labelKey: 'allInbox',      icon: 'solar:layers-linear' },
  { name: 'email',     labelKey: 'inbox',         icon: 'psg:inbox' },
  { name: 'send',      labelKey: 'sent',          icon: 'psg:send',     perm: 'email:send' },
  { name: 'draft',     labelKey: 'drafts',        icon: 'psg:draft',    perm: 'email:send' },
  { name: 'scheduled', labelKey: 'scheduled',     icon: 'solar:clock-circle-linear', perm: 'email:send' },
  { name: 'star',      labelKey: 'starred',       icon: 'psg:bookmark' },
  { name: 'archive',   labelKey: 'archiveFolder', icon: 'psg:archive' },
  { name: 'spam',      labelKey: 'spam',          icon: 'psg:spam' },
  { name: 'trash',     labelKey: 'deletedMail',   icon: 'solar:trash-bin-minimalistic-linear' },
  { name: 'templates', labelKey: 'templates',     icon: 'psg:template' },
  { name: 'groups',    labelKey: 'contactGroups', icon: 'psg:group' },
{ name: 'setting',   labelKey: 'settings',      icon: 'psg:settings' },
  { name: 'download',  labelKey: 'download',      icon: 'solar:download-minimalistic-linear' },
  { name: 'vpn',       labelKey: 'vpn',           icon: 'solar:shield-network-linear' },
  { name: 'about',     labelKey: 'about',         icon: 'solar:info-circle-linear' },
];

const adminItems = [
  { name: 'analysis',   labelKey: 'analytics',      icon: 'psg:analytics', perm: 'analysis:query' },
  { name: 'user',       labelKey: 'allUsers',        icon: 'psg:group',     perm: 'user:query' },
  { name: 'all-email',  labelKey: 'allMail',         icon: 'psg:all-mail',  perm: 'all-email:query' },
  { name: 'role',       labelKey: 'permissions',     icon: 'psg:lock',      perm: 'role:query' },
  { name: 'reg-key',    labelKey: 'inviteCode',      icon: 'psg:key',       perm: 'reg-key:query' },
  { name: 'sys-setting',labelKey: 'SystemSettings',  icon: 'psg:system',    perm: 'setting:query' },
];

const visibleAdminItems = computed(() =>
  adminItems.filter(item => !item.perm || hasPerm(item.perm))
);

/* ── Actions ── */
function openCompose() {
  uiStore.writerRef?.open?.();
}

function toggleDark() {
  const next = !uiStore.dark;
  document.documentElement.setAttribute('class', next ? 'dark' : '');
  uiStore.dark = next;
}

function clickLogout() {
  logout().catch(() => null).finally(() => {
    localStorage.removeItem('token');
    router.replace('/login');
  });
}
</script>

<style lang="scss" scoped>
/* ══════════════════════════════════════════════════════════
   Sidebar — PSG Brutalist Academic (light / dark adaptive)
   ══════════════════════════════════════════════════════════ */
.mail-sidebar {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 260px;
  background: var(--aside-backgound, #f9f9f9);
  border-right: 1px solid var(--light-border, #e2e2e6);
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
  border-bottom: 1px solid var(--light-border, #e2e2e6);
  border-left: 3px solid var(--red-accent);
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
  font-family: 'IBM Plex Sans', 'Noto Sans SC', sans-serif;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: #111111;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  :global(.dark) & { color: #f0f0f0; }
}

.brand-sub {
  font-family: 'IBM Plex Sans', 'Noto Sans SC', sans-serif;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--red-accent);
  white-space: nowrap;
}

.brand-abbr {
  display: none;
  width: 36px;
  height: 36px;
  object-fit: contain;
}

:global(html.dark) .brand-abbr {
  filter: invert(1);
}

/* ── Header ──────────────────────────────────────────────── */
.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 12px 14px 20px;
  flex-shrink: 0;
  gap: 8px;
  border-bottom: 1px solid var(--light-border-color, #cfc4c5);
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
  border-radius: var(--radius-full);

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

  @media (hover: hover) {
    &:hover .acct-name { color: var(--red-accent); }
  }
}

.acct-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: color 0.12s;
}

.acct-email {
  font-family: 'JetBrains Mono', 'IBM Plex Mono', monospace;
  font-size: 10px;
  color: var(--muted, #7e7576);
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
  border-radius: var(--radius-sm);
  cursor: pointer;
  color: var(--muted, #7e7576);
  transition: background 0.14s ease, color 0.14s ease, transform 0.1s ease;
  flex-shrink: 0;

  @media (hover: hover) {
    &:hover {
      background: #ffffff;
      color: var(--el-text-color-primary);
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
  border-radius: var(--radius-sm);
  background: transparent;
  cursor: pointer;
  color: var(--muted, #7e7576);
  transition: background 0.12s, color 0.12s;
  flex-shrink: 0;

  @media (hover: hover) {
    &:hover {
      background: var(--email-hover-background, #eeeeee);
      color: var(--el-text-color-primary);
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
  height: 44px;
  margin: 0 10px;
  padding: 0 14px 0 10px;
  border-left: 4px solid transparent;
  font-size: 13.5px;
  font-weight: 500;
  letter-spacing: 0;
  text-transform: none;
  font-family: 'IBM Plex Sans', 'Noto Sans SC', sans-serif;
  cursor: pointer;
  color: var(--psg-text-secondary, #4c4546);
  border-radius: var(--radius-sm);
  transition: background 0.10s ease, color 0.10s ease, border-color 0.10s ease;
  user-select: none;

  @media (hover: hover) {
    &:not(.active):hover {
      background: var(--email-hover-background, #eeeeee);
      color: var(--el-text-color-primary);
    }
  }

  /* Strong, quiet indicator — a black left rule + flat light-gray fill,
     never a solid black row. */
  &.active {
    background: var(--psg-surface-active, #ececea);
    border-left-color: var(--psg-black, #111111);
    color: var(--psg-black, #111111);
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
    font-family: 'JetBrains Mono', monospace;
    font-weight: 700;
    background: var(--red-accent);
    border: none;
    border-radius: var(--radius-full);
    padding: 0 4px;
    min-width: 18px;
    height: 16px;
    line-height: 16px;
  }
}

/* ── Admin separator + title ─────────────────────────────── */
.sidebar-section-separator {
  height: 1px;
  background: var(--light-border-color, #cfc4c5);
  margin: 10px 16px;
}

.sidebar-section-title {
  font-size: 10.5px;
  font-weight: 700;
  color: var(--muted, #7e7576);
  padding: 0 20px;
  margin-bottom: 4px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-family: 'IBM Plex Sans', 'Noto Sans SC', sans-serif;
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
  color: var(--muted, #7e7576);
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: background 0.1s, color 0.1s;

  &:hover { background: var(--base-fill); color: var(--el-text-color-primary); }
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
  color: var(--secondary-text-color);
  font-variant-numeric: tabular-nums;
}

/* ── Footer ──────────────────────────────────────────────── */
.sidebar-footer {
  padding: 14px 16px;
  flex-shrink: 0;
  border-top: 1px solid var(--light-border-color, #cfc4c5);
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
  border-radius: var(--radius-sm);
  background: var(--red-accent);
  color: var(--on-accent);
  font-size: 13.5px;
  font-weight: 600;
  letter-spacing: 0;
  text-transform: none;
  font-family: 'IBM Plex Sans', 'Noto Sans SC', sans-serif;
  cursor: pointer;
  transition: background 0.14s ease, transform 0.1s ease;

  @media (hover: hover) {
    &:hover { background: var(--red-accent-dark); }
  }
  &:active { background: var(--red-accent-dark); transform: scale(0.97); }
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
  border: 1px solid var(--light-border, #e2e2e6);
  border-radius: var(--radius-sm);
  background: var(--email-hover-background, #eeeeee);
}

.util-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--muted, #7e7576);
  cursor: pointer;
  transition: background 0.14s ease, color 0.14s ease, transform 0.1s ease;

  @media (hover: hover) {
    &:hover {
      background: #ffffff;
      color: var(--el-text-color-primary);
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

.compose-icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  border: none;
  border-radius: var(--radius-sm);
  background: var(--red-accent);
  color: var(--on-accent);
  cursor: pointer;
  transition: background 0.14s ease, transform 0.1s ease;

  @media (hover: hover) {
    &:hover { background: var(--red-accent-dark); }
  }
  &:active { background: var(--red-accent-dark); transform: scale(0.94); }
}

/* Dropdown items */
.drop-item {
  display: flex;
  align-items: center;
  gap: 10px;
}

:deep(.logout-item) {
  color: var(--red-accent) !important;
}

/* ══════════════════════════════════════════════════════════
   Dark mode overrides
   ══════════════════════════════════════════════════════════ */
:global(.dark) {
  .sidebar-nav-link {
    color: rgba(255, 255, 255, 0.55);

    @media (hover: hover) {
      &:not(.active):hover {
        background: rgba(255, 255, 255, 0.06);
        color: rgba(255, 255, 255, 0.90);
      }
    }

    &.active {
      background: rgba(var(--red-accent-rgb), 0.16);
      color: rgba(255, 255, 255, 0.95);
    }
  }

  .sidebar-util-cluster {
    border-color: rgba(255, 255, 255, 0.14);
    background: rgba(255, 255, 255, 0.05);
  }

  .util-btn,
  .notif-trigger-wrap :deep(.icon-btn) {
    color: rgba(255, 255, 255, 0.55);

    @media (hover: hover) {
      &:hover {
        background: rgba(255, 255, 255, 0.10);
        color: rgba(255, 255, 255, 0.92);
      }
    }
  }

  .icon-button {
    color: rgba(255, 255, 255, 0.40);
    &:hover {
      background: rgba(255, 255, 255, 0.08);
      color: rgba(255, 255, 255, 0.88);
    }
  }
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
    border-radius: var(--radius-sm);
  }

  .sidebar-nav-content {
    justify-content: center;
    gap: 0;
    flex: none;
  }

  .sidebar-section-separator { margin-inline: 14px; }

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
}
</style>
