<template>
  <div class="gov">
    <!-- Retention -->
    <section class="gov-section">
      <header class="gov-head">
        <div>
          <h2>{{ $t('govRetentionTitle') }}</h2>
          <p>{{ $t('govRetentionDesc') }}</p>
        </div>
        <StatusBadge :tone="statusTone" :label="statusLabel"/>
      </header>

      <div v-if="loaded" class="gov-body">
        <div class="gov-row">
          <label>{{ $t('govEnabled') }}</label>
          <el-switch v-model="form.enabled" :active-value="1" :inactive-value="0"/>
        </div>
        <div class="gov-row">
          <label>{{ $t('govEmailDays') }}<small>{{ $t('govEmailDaysHint') }}</small></label>
          <el-input-number v-model="form.emailBusinessDays" :min="1" :max="3650" size="small"/>
        </div>
        <div class="gov-row">
          <label>{{ $t('govAttachmentDays') }}<small>{{ $t('govAttachmentHint') }}</small></label>
          <el-input-number v-model="form.attachmentDays" :min="1" :max="3650" size="small"/>
        </div>
        <div class="gov-row">
          <label>{{ $t('govTimezone') }}</label>
          <el-input v-model="form.timezone" size="small" class="gov-narrow" placeholder="Asia/Shanghai"/>
        </div>
        <div class="gov-row">
          <label>{{ $t('govWorkdays') }}</label>
          <el-checkbox-group v-model="form.workdays" size="small" class="gov-days">
            <el-checkbox-button v-for="d in 7" :key="d" :value="d">{{ weekdayName(d) }}</el-checkbox-button>
          </el-checkbox-group>
        </div>
        <div class="gov-row top">
          <label>{{ $t('govHolidays') }}<small>{{ $t('govHolidaysHint') }}</small></label>
          <el-input v-model="holidaysText" type="textarea" :rows="3" class="gov-wide" placeholder="2026-10-01"/>
        </div>
        <div class="gov-row">
          <label>{{ $t('govExempt') }}<small>{{ $t('govIdsHint') }}</small></label>
          <el-input v-model="exemptText" size="small" class="gov-wide" placeholder="12, 40"/>
        </div>
        <div class="gov-row">
          <label>{{ $t('govLegalHold') }}<small>{{ $t('govIdsHint') }}</small></label>
          <el-input v-model="holdText" size="small" class="gov-wide" placeholder="3"/>
        </div>
        <div class="gov-row">
          <label>{{ $t('govKeepStarred') }}</label>
          <el-switch v-model="form.keepStarred" :active-value="1" :inactive-value="0"/>
        </div>

        <div class="gov-actions">
          <el-button size="small" type="primary" :loading="saving" @click="save">{{ $t('save') }}</el-button>
          <el-button size="small" :loading="previewing" @click="doPreview">{{ $t('govPreview') }}</el-button>
          <el-button size="small" type="warning" plain :disabled="form.status === 'approved'" :loading="approving" @click="approve">
            {{ $t('govApprove') }}
          </el-button>
        </div>
        <p class="gov-note">{{ $t('govApproveNote') }}</p>

        <div v-if="preview" class="gov-result" role="status">
          <div class="gov-stat"><b>{{ preview.emailsToTrash }}</b><span>{{ $t('govWouldTrash') }}</span></div>
          <div class="gov-stat"><b>{{ preview.retainedMailsLosingAttachments }}</b><span>{{ $t('govLosingAtt') }}</span></div>
          <ul class="gov-warn">
            <li v-for="w in warningLines" :key="w">{{ w }}</li>
          </ul>
        </div>
      </div>
    </section>

    <!-- Storage audit -->
    <section class="gov-section">
      <header class="gov-head">
        <div>
          <h2>{{ $t('govStorageTitle') }}</h2>
          <p>{{ $t('govStorageDesc') }}</p>
        </div>
        <el-button size="small" :loading="auditing" @click="runAudit">{{ $t('govRunAudit') }}</el-button>
      </header>
      <div v-if="audit" class="gov-body">
        <div class="gov-result">
          <div class="gov-stat"><b>{{ audit.storageType }}</b><span>{{ $t('govStorageType') }}</span></div>
          <div class="gov-stat"><b>{{ audit.scanned }}</b><span>{{ $t('govScanned') }}</span></div>
          <div class="gov-stat"><b>{{ audit.orphans.length }}</b><span>{{ $t('govOrphans') }}</span></div>
          <div class="gov-stat" v-for="(n, k) in audit.queue" :key="k"><b>{{ n }}</b><span>{{ $t('govQueue', { status: k }) }}</span></div>
        </div>
        <p v-if="audit.note" class="gov-note">{{ audit.note }}</p>
        <p v-if="audit.cursor" class="gov-note">{{ $t('govMore') }}</p>
        <ul v-if="audit.orphans.length" class="gov-orphans">
          <li v-for="k in audit.orphans.slice(0, 20)" :key="k">{{ k }}</li>
        </ul>
        <p class="gov-note">{{ $t('govAuditReadOnly') }}</p>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import StatusBadge from '@/views/access-management/components/StatusBadge.vue'
import { retentionGet, retentionPreview, retentionSave, retentionApprove, storageAudit } from '@/request/governance.js'

const { t } = useI18n()
const loaded = ref(false)
const saving = ref(false)
const previewing = ref(false)
const approving = ref(false)
const auditing = ref(false)
const preview = ref(null)
const audit = ref(null)

const form = reactive({
  enabled: 0, status: 'draft', timezone: 'Asia/Shanghai', emailBusinessDays: 15, attachmentDays: 7,
  workdays: [1, 2, 3, 4, 5], keepStarred: 1,
})
const holidaysText = ref('')
const exemptText = ref('')
const holdText = ref('')

const toLines = (s) => String(s).split(/[\s,，;；]+/).map(x => x.trim()).filter(Boolean)
const weekdayName = (d) => t('govWeekday' + d)

function apply(p) {
  Object.assign(form, {
    enabled: p.enabled ? 1 : 0, status: p.status, timezone: p.timezone,
    emailBusinessDays: p.emailBusinessDays, attachmentDays: p.attachmentDays,
    workdays: [...p.workdays], keepStarred: p.keepStarred ? 1 : 0,
  })
  holidaysText.value = p.holidays.join('\n')
  exemptText.value = p.exemptAccountIds.join(', ')
  holdText.value = p.legalHoldAccountIds.join(', ')
  loaded.value = true
}

// Server sends codes; show plain-language sentences.
const warningLines = computed(() => {
  if (!preview.value) return []
  const lines = (preview.value.warningCodes || []).map(w => t('govWarn_' + w.code, w))
  const ex = preview.value.executable
  if (ex && !ex.ok) lines.push(t('govNotExecutable', { reason: t('govBlock_' + ex.code) }))
  else if (ex?.ok) lines.push(t('govWillRun'))
  return lines
})

const statusTone = computed(() => !form.enabled ? 'neutral' : form.status === 'approved' ? 'success' : 'warning')
const statusLabel = computed(() => !form.enabled ? t('govStatusOff') : form.status === 'approved' ? t('govStatusApproved') : t('govStatusDraft'))

async function save() {
  saving.value = true
  try {
    apply(await retentionSave({
      enabled: !!form.enabled, timezone: form.timezone, emailBusinessDays: form.emailBusinessDays,
      attachmentDays: form.attachmentDays, workdays: form.workdays, keepStarred: !!form.keepStarred,
      holidays: toLines(holidaysText.value), exemptAccountIds: toLines(exemptText.value).map(Number),
      legalHoldAccountIds: toLines(holdText.value).map(Number),
    }))
    preview.value = null
    ElMessage({ message: t('saveSuccessMsg'), type: 'success', plain: true })
  } catch { /* axios layer shows the error */ } finally { saving.value = false }
}

async function doPreview() {
  previewing.value = true
  try { preview.value = await retentionPreview() } catch { /* shown by axios */ } finally { previewing.value = false }
}

async function approve() {
  try {
    await ElMessageBox.confirm(t('govApproveConfirm'), t('govApprove'), { type: 'warning', confirmButtonText: t('govApprove'), cancelButtonText: t('cancel') })
  } catch { return }
  approving.value = true
  try {
    apply(await retentionApprove())
    ElMessage({ message: t('saveSuccessMsg'), type: 'success', plain: true })
  } catch { /* shown by axios */ } finally { approving.value = false }
}

async function runAudit() {
  auditing.value = true
  try { audit.value = await storageAudit({ limit: 1000 }) } catch { /* shown by axios */ } finally { auditing.value = false }
}

onMounted(async () => {
  try { apply(await retentionGet()) } catch { /* migrations not applied yet */ }
})
</script>

<style scoped>
.gov { display: flex; flex-direction: column; gap: 20px; }
.gov-section { border: 1px solid var(--psg-border); border-radius: var(--psg-radius-sm); background: var(--psg-surface); }
.gov-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; padding: 16px 22px; border-bottom: 1px solid var(--psg-border); }
.gov-head h2 { margin: 0; font-size: 15px; color: var(--psg-text); }
.gov-head p { margin: 4px 0 0; font-size: 13px; color: var(--psg-text-secondary); }
.gov-body { padding: 6px 22px 18px; }
.gov-row { display: grid; grid-template-columns: minmax(180px, 1fr) minmax(160px, 2fr); gap: 16px; align-items: center; padding: 12px 0; border-bottom: 1px solid color-mix(in srgb, var(--psg-border) 70%, var(--psg-surface)); }
.gov-row.top { align-items: start; }
.gov-row label { font-size: 14px; font-weight: 600; color: var(--psg-text); display: flex; flex-direction: column; gap: 2px; }
.gov-row small { font-size: 12px; font-weight: 500; color: var(--psg-text-secondary); }
.gov-narrow { max-width: 240px; }
.gov-wide { width: 100%; }
.gov-actions { display: flex; flex-wrap: wrap; gap: 8px; padding-top: 16px; }
.gov-note { margin: 10px 0 0; font-size: 12px; color: var(--psg-text-secondary); }
.gov-result { display: flex; flex-wrap: wrap; gap: 16px; margin-top: 14px; padding: 12px 14px; border-radius: var(--psg-radius-sm); background: var(--psg-surface-muted); }
.gov-stat { display: flex; flex-direction: column; min-width: 90px; }
.gov-stat b { font-size: 20px; color: var(--psg-text); }
.gov-stat span { font-size: 12px; color: var(--psg-text-secondary); }
.gov-warn { flex-basis: 100%; margin: 0; padding-left: 18px; font-size: 12px; line-height: 1.6; color: var(--psg-text-secondary); }
.gov-days { display: flex; flex-wrap: wrap; gap: 6px; }
.gov-days :deep(.el-checkbox-button__inner) { border: 1px solid var(--psg-border); border-radius: var(--psg-radius-sm); box-shadow: none; }
.gov-days :deep(.el-checkbox-button.is-checked .el-checkbox-button__inner) { box-shadow: none; }
.gov-orphans { margin: 10px 0 0; padding-left: 18px; font-size: 12px; font-family: var(--psg-font-mono, monospace); word-break: break-all; color: var(--psg-text-secondary); }
@media (max-width: 720px) {
  .gov-row { grid-template-columns: 1fr; gap: 6px; }
  .gov-head { flex-direction: column; }
}
</style>
