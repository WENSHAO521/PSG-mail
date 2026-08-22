<template>
  <nav class="m-tabbar">
    <button class="m-tab" :class="{ active: isActive('email') }" @click="go('email')">
      <Icon icon="psg:inbox" width="22" height="22"/>
      <span>{{ $t('inbox') }}</span>
    </button>

    <button class="m-tab" @click="openSearch">
      <Icon icon="psg:search" width="22" height="22"/>
      <span>{{ $t('search') }}</span>
    </button>

    <!-- Center: compose -->
    <button class="m-tab m-tab-compose" :aria-label="$t('compose')" @click="openCompose">
      <span class="m-compose-fab">
        <Icon icon="psg:compose" width="22" height="22"/>
      </span>
    </button>

    <button class="m-tab" :class="{ active: isActive('send') }" @click="go('send')">
      <Icon icon="psg:send" width="22" height="22"/>
      <span>{{ $t('sent') }}</span>
    </button>

    <button class="m-tab" :class="{ active: isActive('setting') }" @click="go('setting')">
      <Icon icon="psg:settings" width="22" height="22"/>
      <span>{{ $t('settings') }}</span>
    </button>
  </nav>
</template>

<script setup>
import { useRoute } from 'vue-router'
import { Icon } from '@iconify/vue'
import router from '@/router/index.js'
import { useUiStore } from '@/store/ui.js'

const route = useRoute()
const uiStore = useUiStore()

function isActive(name) {
  return route.meta?.name === name
}

function go(name) {
  if (route.meta?.name === name) return
  router.push({ name })
}

function openCompose() {
  uiStore.writerRef?.open?.()
}

function openSearch() {
  router.push({ name: 'search' })
}
</script>

<style scoped lang="scss">
.m-tabbar {
  display: flex;
  width: 100%;
  align-items: stretch;
  justify-content: space-around;
  height: calc(62px + env(safe-area-inset-bottom, 0px));
  padding: 6px 8px calc(6px + env(safe-area-inset-bottom, 0px));
  background: var(--psg-surface);
  border-top: 1px solid var(--psg-border);
}

.m-tab {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--psg-text-secondary);
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0;
  padding: 5px 2px;
  border-radius: var(--psg-radius-sm);
  transition: color 0.12s, background 0.12s;

  span {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }

  &:active { background: var(--psg-surface-active); }

  &.active {
    background: var(--psg-menu-active-bg);
    color: var(--psg-menu-active-text);
    font-weight: 700;
  }
}

.m-tab-compose {
  flex: 0 0 58px;
  padding: 0 4px;
}

.m-compose-fab {
  width: 44px;
  height: 44px;
  background: var(--psg-primary);
  color: var(--psg-on-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--psg-radius-sm);
  transition: transform 0.14s, opacity 0.14s;

  .m-tab-compose:active & {
    transform: scale(0.96);
    opacity: .85;
  }
}
</style>
