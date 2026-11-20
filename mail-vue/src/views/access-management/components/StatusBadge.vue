<template>
  <span class="status-badge" :class="[`tone-${tone}`, `variant-${variant}`]">
    <span v-if="variant === 'dot'" class="badge-dot" />
    <span class="badge-label"><slot>{{ label }}</slot></span>
  </span>
</template>

<script setup>
defineProps({
  // success | neutral | danger — no raw "warning" color exists in the token
  // system (tokens.css), so states like "expired" map to neutral, not yellow.
  tone: { type: String, default: 'neutral' },
  variant: { type: String, default: 'dot' }, // 'dot' (status) | 'pill' (role/default label)
  label: { type: String, default: '' },
})
</script>

<style scoped lang="scss">
.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  line-height: 1.2;
}

.badge-dot {
  width: 6px;
  height: 6px;
  border-radius: var(--psg-radius-full);
  flex-shrink: 0;
  background: var(--psg-text-muted);
}

.variant-dot {
  color: var(--psg-text);

  .badge-label { color: var(--psg-text); }
}

.variant-pill {
  padding: 2px 8px;
  border-radius: var(--psg-radius-xs);
  background: var(--psg-surface-muted);
  color: var(--psg-text-secondary);
  font-weight: 500;
}

.tone-success {
  &.variant-dot .badge-dot { background: var(--psg-success); }
  &.variant-pill { background: var(--psg-success-light-9); color: var(--psg-success); }
}

.tone-danger {
  &.variant-dot .badge-dot { background: var(--psg-danger); }
  &.variant-dot .badge-label { color: var(--psg-danger); }
  &.variant-pill { background: var(--psg-danger-muted); color: var(--psg-danger); }
}

.tone-neutral {
  &.variant-dot .badge-dot { background: var(--psg-text-muted); }
  &.variant-pill { background: var(--psg-surface-active); color: var(--psg-text); font-weight: 500; }
}
</style>
