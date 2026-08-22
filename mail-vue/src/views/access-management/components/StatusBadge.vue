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
  gap: 7px;
  font-size: 12.5px;
  font-weight: 600;
  white-space: nowrap;
  line-height: 1.2;
}

.badge-dot {
  width: 7px;
  height: 7px;
  border-radius: var(--psg-radius-full);
  flex-shrink: 0;
  background: var(--psg-text-muted);
}

.variant-dot {
  color: var(--psg-text);

  .badge-label { color: var(--psg-text); }
}

.variant-pill {
  padding: 3px 10px;
  border-radius: var(--psg-radius-xs);
  background: var(--psg-surface-muted);
  color: var(--psg-text-secondary);
  font-weight: 600;
}

.tone-success {
  &.variant-dot .badge-dot { background: var(--psg-primary); }
  &.variant-pill { background: var(--psg-primary-muted); color: var(--psg-primary); }
}

.tone-danger {
  &.variant-dot .badge-dot { background: var(--psg-danger); }
  &.variant-dot .badge-label { color: var(--psg-danger); }
  &.variant-pill { background: var(--psg-danger-muted); color: var(--psg-danger); }
}

.tone-neutral {
  &.variant-dot .badge-dot { background: var(--psg-text-muted); }
  &.variant-pill { background: var(--psg-surface-active); color: var(--psg-text); font-weight: 700; }
}
</style>
