<template>
  <div class="provider-card">
    <div class="provider-card-head">
      <span class="provider-name">{{ name }}</span>
      <StatusBadge
          :tone="configured ? 'success' : 'neutral'"
          :label="configured ? $t('providerStatusNormal') : $t('providerStatusUnconfigured')"
      />
    </div>

    <p v-if="!configured" class="provider-unconfigured-desc">
      {{ $t('providerNotConfiguredDesc', { name }) }}
    </p>

    <template v-else>
      <div v-if="dailyQuota > 0" class="provider-usage-row">
        <div class="usage-label-row">
          <span>{{ $t('providerTodaySent') }}</span>
          <span class="usage-percent" :class="toneClass(dailyPercent)">{{ formatPercent(dailyPercent) }}</span>
        </div>
        <div class="usage-numbers">{{ formatNum(todaySent) }} / {{ formatNum(dailyQuota) }}</div>
        <div
            class="usage-bar-track"
            role="progressbar"
            :aria-valuenow="Math.round(Math.min(100, dailyPercent))"
            aria-valuemin="0"
            aria-valuemax="100"
        >
          <div class="usage-bar-fill" :class="toneClass(dailyPercent)" :style="{ width: Math.min(100, dailyPercent) + '%' }"/>
        </div>
        <div v-if="dailyPercent >= 100" class="usage-warn-text">
          {{ dailyPercent > 100 ? $t('providerQuotaExceeded') : $t('providerQuotaReachedToday') }}
        </div>
      </div>

      <div v-if="monthlyQuota > 0" class="provider-usage-row">
        <div class="usage-label-row">
          <span>{{ $t('providerMonthSent') }}</span>
          <span class="usage-percent" :class="toneClass(monthlyPercent)">{{ formatPercent(monthlyPercent) }}</span>
        </div>
        <div class="usage-numbers">{{ formatNum(monthSent) }} / {{ formatNum(monthlyQuota) }}</div>
        <div
            class="usage-bar-track"
            role="progressbar"
            :aria-valuenow="Math.round(Math.min(100, monthlyPercent))"
            aria-valuemin="0"
            aria-valuemax="100"
        >
          <div class="usage-bar-fill" :class="toneClass(monthlyPercent)" :style="{ width: Math.min(100, monthlyPercent) + '%' }"/>
        </div>
        <div v-if="monthlyPercent >= 100" class="usage-warn-text">
          {{ monthlyPercent > 100 ? $t('providerQuotaExceeded') : $t('providerQuotaReachedMonth') }}
        </div>
      </div>
    </template>

    <div class="provider-card-foot">
      <el-button size="small" @click="$emit('configure')">{{ $t('providerConfigure') }}</el-button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import StatusBadge from '@/views/access-management/components/StatusBadge.vue'

const props = defineProps({
  name: { type: String, required: true },
  configured: { type: Boolean, default: false },
  todaySent: { type: Number, default: 0 },
  dailyQuota: { type: Number, default: 0 },
  monthSent: { type: Number, default: 0 },
  monthlyQuota: { type: Number, default: 0 },
})
defineEmits(['configure'])

// 0 quota means "no observation quota set" (this backend's existing
// convention, same as aiDailyQuota) — the row for that period is hidden
// entirely by the v-if above, so these only ever divide by a positive number.
const dailyPercent = computed(() => (props.dailyQuota > 0 ? (props.todaySent / props.dailyQuota) * 100 : 0))
const monthlyPercent = computed(() => (props.monthlyQuota > 0 ? (props.monthSent / props.monthlyQuota) * 100 : 0))

function toneClass(percent) {
  if (percent >= 95) return 'tone-danger'
  if (percent >= 80) return 'tone-warning'
  return 'tone-normal'
}

function formatPercent(percent) {
  const rounded = Math.round(percent * 10) / 10
  return (Number.isInteger(rounded) ? rounded : rounded.toFixed(1)) + '%'
}

function formatNum(n) {
  return Number(n || 0).toLocaleString()
}
</script>

<style scoped lang="scss">
.provider-card {
  border: 1px solid var(--psg-border);
  border-radius: var(--psg-radius-sm);
  background: var(--psg-surface);
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.provider-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.provider-name {
  font-size: 15px;
  font-weight: 700;
  color: var(--psg-text);
}

.provider-unconfigured-desc {
  margin: 0;
  font-size: 13px;
  color: var(--psg-text-secondary);
}

.provider-usage-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.usage-label-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--psg-text-secondary);
}

.usage-percent {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.usage-numbers {
  font-size: 15px;
  font-weight: 700;
  color: var(--psg-text);
  font-variant-numeric: tabular-nums;
}

.usage-bar-track {
  width: 100%;
  height: 6px;
  border-radius: 3px;
  background: var(--psg-surface-active);
  overflow: hidden;
}

.usage-bar-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.2s ease, background 0.15s ease;
}

.usage-warn-text {
  font-size: 12px;
  font-weight: 600;
  color: var(--psg-danger);
}

.tone-normal { color: var(--psg-primary); }
.tone-warning { color: var(--psg-warning); }
.tone-danger { color: var(--psg-danger); }

.usage-bar-fill.tone-normal { background: var(--psg-primary); }
.usage-bar-fill.tone-warning { background: var(--psg-warning); }
.usage-bar-fill.tone-danger { background: var(--psg-danger); }

.provider-card-foot {
  display: flex;
  justify-content: flex-end;
}

@media (max-width: 767px) {
  .provider-card { padding: 14px; }
}
</style>
