<template>
  <el-dialog v-model="show" :title="$t('agentSettingsTitle')" width="460" append-to-body class="agent-settings-dialog">
    <el-tabs v-model="tab">
      <el-tab-pane :label="$t('agentTabPrefs')" name="prefs">
        <div class="as-form" v-loading="loading">
          <label>{{ $t('agentLanguage') }}</label>
          <el-select v-model="form.language" size="small">
            <el-option v-for="l in languages" :key="l.value" :value="l.value" :label="l.label"/>
          </el-select>

          <label>{{ $t('agentInstructions') }}<small>{{ $t('agentInstructionsHint') }}</small></label>
          <el-input v-model="form.instructions" type="textarea" :rows="4" maxlength="2000" show-word-limit/>

          <label>{{ $t('agentSignature') }}</label>
          <el-input v-model="form.signature" type="textarea" :rows="3" maxlength="1000" show-word-limit/>

          <div class="as-switch">
            <div><b>{{ $t('agentAutoDraft') }}</b><small>{{ $t('agentAutoDraftHint') }}</small></div>
            <el-switch v-model="form.autoDraftEnabled"/>
          </div>
          <el-input v-if="form.autoDraftEnabled" v-model="domainsText" size="small" :placeholder="$t('agentDomainsPlaceholder')"/>

          <div class="as-switch">
            <div><b>{{ $t('agentHistory') }}</b><small>{{ $t('agentHistoryHint') }}</small></div>
            <el-switch v-model="form.historyEnabled"/>
          </div>
          <div v-if="form.historyEnabled" class="as-switch">
            <div><b>{{ $t('agentRetention') }}</b></div>
            <el-input-number v-model="form.retentionDays" :min="1" :max="365" size="small"/>
          </div>

          <div class="as-actions">
            <el-button size="small" type="danger" plain @click="clearHistory">{{ $t('agentClearHistory') }}</el-button>
            <el-button size="small" type="primary" :loading="saving" @click="save">{{ $t('save') }}</el-button>
          </div>
        </div>
      </el-tab-pane>

      <el-tab-pane :label="$t('agentTabDrafts')" name="drafts">
        <div v-loading="draftsLoading">
          <p v-if="!drafts.length" class="as-empty">{{ $t('agentNoDrafts') }}</p>
          <div v-for="d in drafts" :key="d.draftId" class="as-draft">
            <div class="as-draft-head">
              <b>{{ d.subject || $t('noSubject') }}</b>
              <span class="as-tag">{{ d.source === 'ai_auto' ? $t('agentDraftAuto') : $t('agentDraftAi') }}</span>
            </div>
            <div class="as-draft-to">{{ $t('agentDraftTo') }}: {{ (d.to || []).join(', ') }}</div>
            <pre class="as-draft-body">{{ d.body }}</pre>
            <div class="as-actions">
              <el-button size="small" @click="copy(d)">{{ $t('copy') }}</el-button>
              <el-button size="small" type="danger" plain @click="discard(d)">{{ $t('agentDraftDiscard') }}</el-button>
            </div>
          </div>
          <p class="as-note">{{ $t('agentDraftNote') }}</p>
        </div>
      </el-tab-pane>
    </el-tabs>
  </el-dialog>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { aiAgentGetSettings, aiAgentPutSettings, aiAgentDrafts, aiAgentDiscardDraft, aiAgentClearHistory } from '@/request/ai-assistant.js'

const props = defineProps({ modelValue: Boolean })
const emit = defineEmits(['update:modelValue'])
const { t } = useI18n()

const show = computed({ get: () => props.modelValue, set: (v) => emit('update:modelValue', v) })
const tab = ref('prefs')
const loading = ref(false)
const saving = ref(false)
const draftsLoading = ref(false)
const drafts = ref([])
const domainsText = ref('')
const form = reactive({ language: 'auto', instructions: '', signature: '', autoDraftEnabled: false, historyEnabled: true, retentionDays: 30 })

// Language names are shown in their own script so they are recognizable in any UI language.
const languages = computed(() => [
  { value: 'auto', label: t('agentLangAuto') },
  { value: 'zh-CN', label: '简体中文' },
  { value: 'zh-TW', label: '繁體中文' },
  { value: 'en', label: 'English' },
  { value: 'ko', label: '한국어' },
  { value: 'de', label: 'Deutsch' },
])

async function load() {
  loading.value = true
  try {
    const s = await aiAgentGetSettings(0)
    Object.assign(form, s)
    domainsText.value = (s.autoDraftDomains || []).join(', ')
  } catch { /* shown by axios */ } finally { loading.value = false }
}

async function loadDrafts() {
  draftsLoading.value = true
  try { drafts.value = (await aiAgentDrafts()).drafts || [] } catch { /* shown by axios */ } finally { draftsLoading.value = false }
}

async function save() {
  saving.value = true
  try {
    await aiAgentPutSettings({
      accountId: 0, ...form,
      autoDraftDomains: domainsText.value.split(/[\s,，;；]+/).map(s => s.trim().toLowerCase()).filter(Boolean),
    })
    ElMessage({ message: t('saveSuccessMsg'), type: 'success', plain: true })
  } catch { /* shown by axios */ } finally { saving.value = false }
}

async function clearHistory() {
  try {
    await ElMessageBox.confirm(t('agentClearConfirm'), t('agentClearHistory'), { type: 'warning', confirmButtonText: t('confirm'), cancelButtonText: t('cancel') })
  } catch { return }
  try {
    await aiAgentClearHistory()
    ElMessage({ message: t('saveSuccessMsg'), type: 'success', plain: true })
  } catch { /* shown by axios */ }
}

async function copy(d) {
  try {
    await navigator.clipboard.writeText(d.body || '')
    ElMessage({ message: t('copySuccessMsg'), type: 'success', plain: true })
  } catch { /* clipboard unavailable */ }
}

async function discard(d) {
  try {
    await aiAgentDiscardDraft(d.draftId)
    drafts.value = drafts.value.filter(x => x.draftId !== d.draftId)
  } catch { /* shown by axios */ }
}

watch(show, (open) => { if (open) { load(); loadDrafts() } })
</script>

<style scoped>
.as-form { display: flex; flex-direction: column; gap: 10px; }
.as-form label { font-size: 13px; font-weight: 600; color: var(--psg-text); display: flex; flex-direction: column; gap: 2px; }
small { font-size: 12px; font-weight: 500; color: var(--psg-text-secondary); }
.as-switch { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.as-switch > div { display: flex; flex-direction: column; font-size: 13px; color: var(--psg-text); }
.as-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 6px; }
.as-empty, .as-note { font-size: 12px; color: var(--psg-text-secondary); margin: 8px 0; }
.as-draft { border: 1px solid var(--psg-border); border-radius: var(--psg-radius-sm); padding: 10px 12px; margin-bottom: 10px; background: var(--psg-surface); }
.as-draft-head { display: flex; justify-content: space-between; gap: 8px; font-size: 13px; color: var(--psg-text); }
.as-tag { font-size: 11px; padding: 1px 6px; border-radius: 8px; background: var(--psg-surface-muted); color: var(--psg-text-secondary); white-space: nowrap; }
.as-draft-to { font-size: 12px; color: var(--psg-text-secondary); margin-top: 2px; }
.as-draft-body { white-space: pre-wrap; word-break: break-word; font: inherit; font-size: 13px; line-height: 1.5; margin: 8px 0 0; max-height: 160px; overflow: auto; color: var(--psg-text); }
</style>
