<template>
  <el-dialog :model-value="modelValue" @update:model-value="v => emit('update:modelValue', v)"
             :title="$t('snoozeTitle')" width="min(360px, calc(100vw - 32px))" class="snooze-dialog" append-to-body>
    <p class="snooze-hint">{{ $t('snoozeHint') }}</p>
    <div class="snooze-presets">
      <button v-for="p in presets" :key="p.key" type="button" class="snooze-preset" @click="pick(p.time)">
        <span>{{ $t(p.labelKey) }}</span>
        <small>{{ p.time.format('MM-DD HH:mm') }}</small>
      </button>
    </div>
    <div class="snooze-custom">
      <el-date-picker id="snooze-custom-time" v-model="custom" type="datetime" format="YYYY-MM-DD HH:mm"
                      :placeholder="$t('snoozeCustom')" :disabled-date="d => dayjs(d).isBefore(dayjs(), 'day')"
                      style="width: 100%"/>
      <el-button type="primary" :disabled="!custom" @click="pick(dayjs(custom))">{{ $t('confirm') }}</el-button>
    </div>
  </el-dialog>
</template>

<script setup>
import { ref, watch } from 'vue'
import dayjs from 'dayjs'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'

const props = defineProps({ modelValue: { type: Boolean, default: false } })
const emit = defineEmits(['update:modelValue', 'confirm'])
const { t } = useI18n()
const custom = ref(null)

// Gmail-style choices. Candidates that land on the same minute (e.g. "next
// Monday" and "in a week" when today is Monday) are shown once, and "this
// weekend" only appears on weekdays.
function buildPresets() {
  const now = dayjs()
  const at8 = d => d.hour(8).minute(0).second(0).millisecond(0)
  const day = now.day()
  const candidates = [
    { key: 'later', labelKey: 'snoozeLaterToday', time: now.add(3, 'hour').startOf('minute') },
    { key: 'tomorrow', labelKey: 'snoozeTomorrow', time: at8(now.add(1, 'day')) },
    day >= 1 && day <= 5 && { key: 'weekend', labelKey: 'snoozeThisWeekend', time: at8(now.add(6 - day, 'day')) },
    { key: 'monday', labelKey: 'snoozeNextMonday', time: at8(now.add(((8 - day) % 7) || 7, 'day')) },
    { key: 'week', labelKey: 'snoozeNextWeek', time: at8(now.add(7, 'day')) },
  ].filter(Boolean)
  const seen = new Set()
  return candidates.filter(c => {
    const k = c.time.format('YYYY-MM-DD HH:mm')
    if (seen.has(k)) return false
    seen.add(k)
    return true
  }).slice(0, 4)
}

const presets = ref(buildPresets())
watch(() => props.modelValue, open => { if (open) presets.value = buildPresets() })

function pick(time) {
  if (!time.isAfter(dayjs())) {
    ElMessage({ message: t('snoozePastMsg'), type: 'error', plain: true })
    return
  }
  emit('confirm', time.valueOf())
  emit('update:modelValue', false)
  custom.value = null
}
</script>

<style scoped lang="scss">
.snooze-hint { margin: 0 0 12px; font-size: 13px; color: var(--psg-text-muted); }
.snooze-presets { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 14px; }
.snooze-preset {
  display: flex; flex-direction: column; align-items: flex-start; gap: 2px;
  padding: 10px 12px; border: 1px solid var(--psg-border); border-radius: var(--psg-radius-sm);
  background: var(--psg-surface); color: var(--psg-text); cursor: pointer; font: inherit; text-align: left;
  &:hover, &:focus-visible { border-color: var(--el-color-primary); }
  small { font-size: 12px; color: var(--psg-text-muted); font-variant-numeric: tabular-nums; }
}
.snooze-custom { display: flex; gap: 8px; }
</style>
