<template>
  <div v-if="visible" class="send-quota-widget" :class="{ 'is-full': isAtCap }">
    <div class="sqw-head">
      <Icon icon="psg:send" width="14" height="14" class="sqw-icon"/>
      <span class="sqw-title">{{ title }}</span>
    </div>
    <div class="sqw-numbers">
      <span class="sqw-used">{{ used }}</span>
      <span class="sqw-sep">/</span>
      <span class="sqw-cap">{{ cap }}</span>
    </div>
    <div class="sqw-bar-track">
      <div class="sqw-bar-fill" :style="{ width: percent + '%' }"></div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { Icon } from '@iconify/vue'
import { useUserStore } from '@/store/user.js'
import { useI18n } from 'vue-i18n'

const userStore = useUserStore()
const { t } = useI18n()

const role = computed(() => userStore.user?.role)
const used = computed(() => userStore.user?.sendCount || 0)
const cap = computed(() => role.value?.sendCount || 0)

// Only 'day'/'count' roles carry a numeric cap (see roles-tab.vue's admin
// form — the sendCount input only shows for those two types); 'internal'
// and 'ban' have nothing to meter, and a falsy cap is this backend's
// "unlimited" convention (same one setting/index.vue's dailySendLimitText
// relies on) — neither is worth a permanent corner widget for.
const visible = computed(() => {
  const type = role.value?.sendType
  return (type === 'day' || type === 'count') && cap.value > 0
})

const percent = computed(() => Math.min(100, Math.round((used.value / cap.value) * 100)))
const isAtCap = computed(() => used.value >= cap.value)
const title = computed(() => {
  if (isAtCap.value) return t('sendQuotaReached')
  return role.value?.sendType === 'day' ? t('dailySendLimit') : t('totalSendQuota')
})
</script>

<style scoped>
.send-quota-widget {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 900;
  width: 176px;
  padding: 10px 12px;
  border-radius: var(--psg-radius-md);
  border: 1px solid var(--psg-border);
  background: var(--psg-surface);
  box-shadow: var(--psg-shadow-md);
  pointer-events: none;
  user-select: none;
}

.sqw-head {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--psg-text-secondary);
}

.sqw-icon { flex: none; }

.sqw-title {
  font-size: 11.5px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sqw-numbers {
  margin-top: 4px;
  font-size: 15px;
  font-weight: 700;
  color: var(--psg-text);
}

.sqw-sep, .sqw-cap {
  color: var(--psg-text-muted);
  font-weight: 500;
}

.sqw-bar-track {
  margin-top: 6px;
  height: 4px;
  border-radius: 2px;
  background: var(--psg-surface-active);
  overflow: hidden;
}

.sqw-bar-fill {
  height: 100%;
  border-radius: 2px;
  background: var(--psg-primary);
  transition: width 0.25s ease, background 0.15s ease;
}

.send-quota-widget.is-full .sqw-bar-fill { background: var(--psg-danger); }
.send-quota-widget.is-full .sqw-numbers { color: var(--psg-danger); }

@media (max-width: 768px) {
  /* Mobile has its own fixed bottom tab bar (layout/mobile-tabbar) —
     no free corner to anchor a persistent widget without overlapping it. */
  .send-quota-widget { display: none; }
}
</style>
