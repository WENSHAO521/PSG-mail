<template>
  <!-- Mist phone header: the page title doubles as the folder switcher. -->
  <header class="m-header">
    <button type="button" class="m-title" :aria-label="$t('menu')" @click="uiStore.asideShow = true">
      <span>{{ title }}</span>
      <Icon icon="psg:chevron-down" width="16" height="16" />
    </button>
    <span class="m-spacer"></span>
    <div class="m-notif">
      <NotificationPanel />
    </div>
    <button type="button" class="m-avatar" :aria-label="$t('settings')" @click="router.push({ name: 'setting' })">
      <img v-if="userStore.avatar" :src="userStore.avatar" alt="" @error="e => e.target.style.display = 'none'" />
      <span v-else>{{ initial }}</span>
    </button>
  </header>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { Icon } from '@iconify/vue'
import { useI18n } from 'vue-i18n'
import router from '@/router/index.js'
import { useUiStore } from '@/store/ui.js'
import { useUserStore } from '@/store/user.js'
import NotificationPanel from '@/components/notification-panel/index.vue'

const route = useRoute()
const uiStore = useUiStore()
const userStore = useUserStore()
const { t } = useI18n()

const title = computed(() => {
  const key = route.meta?.title
  return key ? t(key) : 'PSG Mail'
})
const initial = computed(() => ((userStore.user?.name || userStore.user?.email || '?')[0] || '?').toUpperCase())
</script>

<style scoped lang="scss">
.m-header {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: calc(64px + env(safe-area-inset-top, 0px));
  padding: calc(8px + env(safe-area-inset-top, 0px)) 12px 8px 16px;
  background: var(--psg-canvas);
  border-bottom: 1px solid var(--psg-border);
}

.m-title {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  border: 0;
  padding: 0;
  background: transparent;
  color: var(--psg-text);
  font: inherit;
  font-family: var(--psg-font-display);
  font-size: 26px;
  font-weight: 400;

  span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  svg { flex: 0 0 auto; }

  /* Narrow phones: long admin titles (用户与访问管理) fit instead of truncating. */
  @media (max-width: 360px) { font-size: 22px; }
}

.m-spacer { flex: 1; }

.m-notif :deep(.icon-btn),
.m-avatar {
  width: 40px !important;
  height: 40px !important;
  border: 0 !important;
  border-radius: var(--psg-radius-sm) !important;
  background: transparent !important;
  color: var(--psg-text-secondary) !important;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}

.m-avatar {
  width: 32px !important;
  height: 32px !important;
  margin-left: 4px;
  border-radius: 50% !important;
  background: var(--psg-surface-active) !important;
  overflow: hidden;
  font: inherit;
  font-size: 13px;
  font-weight: 500;

  img { width: 100%; height: 100%; object-fit: cover; }
}
</style>
