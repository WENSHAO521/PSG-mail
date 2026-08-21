<template>
  <header class="m-header">
    <div class="m-left">
      <button class="m-icon-btn" :aria-label="$t('menu')" @click="openDrawer">
        <Icon icon="solar:hamburger-menu-linear" width="22" height="22"/>
      </button>
      <div class="m-title-block">
        <span class="m-title">{{ title }}</span>
        <span class="m-brand-name">PSG Mail</span>
      </div>
    </div>

    <div class="m-notif">
      <NotificationPanel />
    </div>
  </header>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { Icon } from '@iconify/vue'
import { useI18n } from 'vue-i18n'
import { useUiStore } from '@/store/ui.js'
import NotificationPanel from '@/components/notification-panel/index.vue'

const route = useRoute()
const uiStore = useUiStore()
const { t } = useI18n()

const title = computed(() => {
  const key = route.meta?.title
  return key ? t(key) : 'PSG Mail'
})

function openDrawer() {
  uiStore.asideShow = true
}
</script>

<style scoped lang="scss">
.m-header {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  height: 58px;
  padding: 7px 10px 7px 8px;
  gap: 10px;
  background: var(--pm-surface, #fff);
  border-bottom: 1px solid var(--pm-border, #e3e7ed);
}

.m-left {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  flex: 1;
}

.m-title-block {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 0;
}

.m-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--pm-text, #172033);
  font-size: 14px;
  line-height: 18px;
  font-weight: 650;
}

.m-brand-name {
  color: var(--pm-text-3, #7d8797);
  font-size: 10px;
  line-height: 13px;
  font-weight: 550;
  letter-spacing: .02em;
}

.m-icon-btn,
.m-notif :deep(.icon-btn) {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--pm-text-2, #4f5b6e);
  cursor: pointer;
  transition: background .12s ease, color .12s ease;
}

.m-icon-btn:active,
.m-notif :deep(.icon-btn:active) {
  background: var(--pm-surface-hover, #f3f5f8);
  color: var(--pm-text, #172033);
}
</style>
