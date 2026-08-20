<template>
  <header class="m-header">
    <!-- Left: menu + brand / section title -->
    <div class="m-left">
      <button class="m-icon-btn" :aria-label="$t('menu')" @click="openDrawer">
        <Icon icon="solar:hamburger-menu-linear" width="24" height="24"/>
      </button>
      <div class="m-brand">
        <div class="m-title-block">
          <span class="m-brand-name">PSG Mail</span>
          <span class="m-title">{{ title }}</span>
        </div>
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
  height: 64px;
  padding: 8px 12px 8px 8px;
  background:
    linear-gradient(180deg, rgba(255,255,255,0.96), rgba(248,248,248,0.96));
  border-bottom: 1px solid rgba(0,0,0,0.10);
  box-shadow: 0 10px 24px rgba(0,0,0,0.06);
  gap: 10px;
  backdrop-filter: blur(18px);

  :global(.dark) & {
    background:
      linear-gradient(180deg, rgba(20,20,24,0.96), rgba(16,16,20,0.96));
    border-bottom-color: rgba(255,255,255,0.08);
    box-shadow: 0 10px 24px rgba(0,0,0,0.28);
  }
}

.m-left {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  flex: 1;
}

.m-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.m-title-block {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 1px;
}

.m-brand-name {
  flex-shrink: 0;
  font-size: 13px;
  font-weight: 800;
  color: var(--red-accent);
  line-height: 1.1;
}

.m-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--el-text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

/* 44px touch targets */
.m-icon-btn {
  width: 42px;
  height: 42px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--muted, #666666);
  transition: background 0.12s, color 0.12s;
  flex-shrink: 0;
  border-radius: 14px;

  &:active { background: rgba(0, 0, 0, 0.08); }
}

.m-notif :deep(.icon-btn) {
  width: 42px;
  height: 42px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--muted, #666666);
  border-radius: 14px;
  transition: background 0.12s, color 0.12s;
  flex-shrink: 0;

  &:active { background: rgba(0, 0, 0, 0.08); }
}

</style>
