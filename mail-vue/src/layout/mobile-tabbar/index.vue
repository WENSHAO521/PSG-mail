<template>
  <nav class="m-tabbar">
    <button class="m-tab" :class="{ active: isActive('email') }" @click="go('email')">
      <Icon icon="psg:inbox" width="21" height="21"/>
      <span>{{ $t('inbox') }}</span>
    </button>

    <button class="m-tab" :class="{ active: isActive('search') }" @click="openSearch">
      <Icon icon="solar:magnifer-linear" width="21" height="21"/>
      <span>{{ $t('search') }}</span>
    </button>

    <button class="m-tab m-tab-compose" :aria-label="$t('compose')" @click="openCompose">
      <span class="m-compose-fab">
        <Icon icon="psg:compose" width="20" height="20"/>
      </span>
      <span class="m-compose-label">{{ $t('compose') }}</span>
    </button>

    <button class="m-tab" :class="{ active: isActive('send') }" @click="go('send')">
      <Icon icon="psg:send" width="21" height="21"/>
      <span>{{ $t('sent') }}</span>
    </button>

    <button class="m-tab" :class="{ active: isActive('setting') }" @click="go('setting')">
      <Icon icon="psg:settings" width="21" height="21"/>
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
  margin: 0;
  padding: 4px 8px calc(4px + env(safe-area-inset-bottom, 0px));
  background: var(--pm-surface, #fff);
  border-top: 1px solid var(--pm-border, #e3e7ed);
}

.m-tab {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 3px 2px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--pm-text-3, #7d8797);
  cursor: pointer;
  font-size: 10px;
  line-height: 13px;
  font-weight: 550;
  transition: color .12s ease, background .12s ease;

  > span {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &:active { background: var(--pm-surface-hover, #f3f5f8); }

  &.active {
    color: var(--pm-brand, #b4233d);
    font-weight: 650;
  }
}

.m-tab-compose {
  flex: 0 0 66px;
  gap: 1px;
}

.m-compose-fab {
  width: 38px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 9px;
  background: var(--pm-brand, #b4233d);
  color: #fff;
  box-shadow: 0 4px 10px rgba(180, 35, 61, .18);
  transition: transform .12s ease, background .12s ease;
}

.m-compose-label {
  color: var(--pm-brand, #b4233d);
  font-weight: 650;
}

.m-tab-compose:active .m-compose-fab {
  transform: scale(.97);
  background: var(--pm-brand-hover, #971c32);
}
</style>
