<template>
  <!-- Mist phone navigation: a floating ink bar, with Compose as its own
       accent button just above it. -->
  <button v-if="canSend && onMailScreen && !uiStore.composeDocked" type="button" class="m-fab" @click="openCompose">
    <Icon icon="psg:compose" width="19" height="19" />
    <span>{{ $t('compose') }}</span>
  </button>
  <nav class="m-tabbar" :aria-label="$t('menu')">
    <button v-for="tab in tabs" :key="tab.name" type="button" class="m-tab"
            :class="{ active: tab.active }" :aria-current="tab.active ? 'page' : undefined" @click="go(tab.name)">
      <Icon :icon="tab.icon" width="22" height="22" />
      <span>{{ $t(tab.labelKey) }}</span>
    </button>
  </nav>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { Icon } from '@iconify/vue'
import router from '@/router/index.js'
import { useUiStore } from '@/store/ui.js'
import { hasPerm } from '@/perm/perm.js'

const route = useRoute()
const uiStore = useUiStore()
const canSend = computed(() => hasPerm('email:send'))

const MAIL_ROUTES = new Set(['email', 'all-inbox', 'send', 'draft', 'archive', 'spam', 'trash', 'label', 'scheduled'])
// Compose floats over the everyday mail lists only. Scheduled, Archive, Spam
// and Deleted are review screens where it would just cover content.
const COMPOSE_ROUTES = new Set(['email', 'all-inbox', 'star', 'send', 'draft', 'label'])
const onMailScreen = computed(() => COMPOSE_ROUTES.has(route.meta?.name))
const tabs = computed(() => {
  const name = route.meta?.name
  return [
    { name: 'email',   labelKey: 'mailSection',   icon: 'psg:inbox',    active: MAIL_ROUTES.has(name) },
    { name: 'search',  labelKey: 'search',        icon: 'psg:search',   active: name === 'search' },
    { name: 'star',    labelKey: 'starred',       icon: 'psg:star',     active: name === 'star' },
    { name: 'setting', labelKey: 'settings',      icon: 'psg:user',     active: name === 'setting' },
  ]
})

function go(name) {
  if (route.meta?.name === name) return
  router.push({ name })
}

function openCompose() {
  uiStore.writerRef?.open?.()
}
</script>

<style scoped lang="scss">
.m-tabbar {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  align-items: center;
  height: 64px;
  margin: 0 10px calc(10px + env(safe-area-inset-bottom, 0px));
  border-radius: var(--psg-radius-lg);
  background: #1C1C1E;
  box-shadow: var(--psg-shadow-md);
}

.m-tab {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  height: 100%;
  border: 0;
  background: transparent;
  color: #A1A1A6;
  font: inherit;
  font-size: 11px;
  font-weight: 500;

  &.active { color: #FFFFFF; font-weight: 700; }
}

.m-fab {
  position: fixed;
  right: 18px;
  bottom: calc(92px + env(safe-area-inset-bottom, 0px));
  z-index: 31;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 54px;
  padding: 0 20px;
  border: 0;
  border-radius: var(--psg-radius-lg);
  background: var(--psg-primary);
  color: var(--psg-on-primary);
  font: inherit;
  font-weight: 700;
  box-shadow: 0 10px 24px color-mix(in srgb, var(--psg-primary) 32%, transparent);
}
</style>
