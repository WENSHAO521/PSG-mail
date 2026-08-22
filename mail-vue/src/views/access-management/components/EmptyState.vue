<template>
  <div class="empty-state">
    <div class="empty-icon"><Icon :icon="icon" width="26" height="26"/></div>
    <h3 class="empty-title">{{ title }}</h3>
    <p v-if="description" class="empty-desc">{{ description }}</p>
    <div v-if="$slots.default || ctaText" class="empty-cta">
      <slot>
        <el-button type="primary" @click="$emit('cta')">
          <Icon icon="psg:add-circle" width="16" height="16"/>
          {{ ctaText }}
        </el-button>
      </slot>
    </div>
  </div>
</template>

<script setup>
import { Icon } from '@iconify/vue'

defineProps({
  icon: { type: String, required: true },
  title: { type: String, required: true },
  description: { type: String, default: '' },
  ctaText: { type: String, default: '' },
})
defineEmits(['cta'])
</script>

<style scoped lang="scss">
.empty-state {
  max-width: 440px;
  margin: 40px auto 24px;
  padding: 8px 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 6px;
}

.empty-icon {
  width: 52px;
  height: 52px;
  margin-bottom: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--psg-radius-xs);
  background: var(--psg-surface-muted);
  color: var(--psg-text-muted);
}

.empty-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: var(--psg-text);
}

.empty-desc {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--psg-text-secondary);
}

.empty-cta {
  margin-top: 10px;
}
</style>
