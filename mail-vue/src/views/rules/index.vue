<template>
  <div class="rules-page" :class="{ 'editor-open': editorOpen }">
    <section class="rules-hero" aria-labelledby="rules-title">
      <div class="hero-copy">
        <div class="eyebrow">
          <span class="eyebrow-mark" aria-hidden="true" />
          {{ $t('subjectKeywords') }}
        </div>
        <h1 id="rules-title">{{ $t('emailRules') }}</h1>
        <p>{{ $t('subjectKeywordsDesc') }}</p>
      </div>

    </section>

    <section class="scope-note" role="note">
      <Icon icon="psg:info-circle" width="17" height="17" aria-hidden="true" />
      <span>{{ $t('rulesScopeNote') }}</span>
    </section>

    <section class="stats-grid" aria-label="Rule summary">
      <div class="stat-card surface-card">
        <span class="stat-label">{{ $t('rulesTotalCount') }}</span>
        <strong class="stat-value">{{ rulesStore.rules.length }}</strong>
      </div>
      <div class="stat-card surface-card">
        <span class="stat-label">{{ $t('rulesActiveCount') }}</span>
        <strong class="stat-value stat-value--accent">{{ enabledCount }}</strong>
      </div>
      <div class="stat-card surface-card stat-card--wide">
        <span class="stat-label">{{ $t('ruleActionType') }}</span>
        <span class="stat-description">{{ $t('rulesActionSummary') }}</span>
      </div>
    </section>

    <section class="rules-section surface-card" aria-labelledby="rules-list-title">
      <header class="section-header">
        <div>
          <h2 id="rules-list-title">{{ $t('emailRules') }}</h2>
          <p>{{ $t('rulesListDesc') }}</p>
        </div>
        <span v-if="rulesStore.rules.length" class="section-count">
          {{ rulesStore.rules.length }}
        </span>
      </header>

      <div v-if="!rulesStore.rules.length" class="empty-state">
        <div class="empty-icon-wrap">
          <Icon icon="psg:tag" width="26" height="26" aria-hidden="true" />
        </div>
        <h3>{{ $t('noRules') }}</h3>
        <p>{{ $t('noRulesDesc') }}</p>
        <el-button type="primary" class="empty-action" @click="openAdd">
          <Icon icon="psg:add-circle" width="15" height="15" />
          {{ $t('addRule') }}
        </el-button>
      </div>

      <div v-else class="rule-list">
        <article
          v-for="rule in rulesStore.rules"
          :key="rule.id"
          class="rule-row"
          :class="{ 'rule-row--disabled': !rule.enabled }"
        >
          <div class="rule-icon" aria-hidden="true">
            <Icon icon="psg:tag" width="18" height="18" />
          </div>

          <div class="rule-content">
            <div class="rule-title-line">
              <h3>{{ rule.name }}</h3>
              <span class="rule-status" :class="{ 'rule-status--muted': !rule.enabled }">
                {{ rule.enabled ? $t('ruleEnabledLabel') : $t('ruleDisabledLabel') }}
              </span>
            </div>
            <div class="rule-detail-line">
              <span class="rule-detail-group">
                <span class="detail-label">{{ $t('ruleConditionType') }}</span>
                <span class="detail-value">{{ conditionLabel(rule.conditionType) }}</span>
                <code v-if="rule.conditionType !== 'all'" class="keyword-value">{{ rule.conditionValue }}</code>
              </span>
              <span class="detail-arrow" aria-hidden="true">→</span>
              <span class="rule-detail-group">
                <span class="detail-label">{{ $t('ruleActionType') }}</span>
                <span class="detail-value">{{ actionLabel(rule.action) }}</span>
              </span>
            </div>
          </div>

          <div class="rule-actions">
            <el-switch
              :model-value="Boolean(rule.enabled)"
              :aria-label="rule.enabled ? $t('disableRule') : $t('enableRule')"
              @change="value => toggleRule(rule.id, value)"
            />
            <button
              type="button"
              class="icon-action"
              :aria-label="$t('editRule')"
              :title="$t('editRule')"
              @click="openEdit(rule)"
            >
              <Icon icon="psg:edit" width="16" height="16" aria-hidden="true" />
            </button>
            <button
              type="button"
              class="icon-action icon-action--danger"
              :aria-label="$t('delete')"
              :title="$t('delete')"
              @click="deleteRule(rule.id)"
            >
              <Icon icon="psg:trash" width="16" height="16" aria-hidden="true" />
            </button>
          </div>
        </article>
      </div>
    </section>

    <section
      v-if="editorOpen"
      ref="editorSection"
      class="editor-section surface-card"
      aria-labelledby="rule-editor-title"
    >
      <header class="editor-header">
        <div>
          <div class="eyebrow">{{ $t('subjectKeywords') }}</div>
          <h2 id="rule-editor-title">{{ isEditing ? $t('editRule') : $t('addRule') }}</h2>
        </div>
        <button type="button" class="close-editor" :aria-label="$t('cancel')" @click="cancelEdit">
          <Icon icon="psg:close" width="18" height="18" aria-hidden="true" />
        </button>
      </header>

      <form class="editor-form" @submit.prevent="saveRule">
        <div class="field-block">
          <label class="field-label" for="rule-name">{{ $t('ruleName') }}</label>
          <el-input
            id="rule-name"
            v-model="ruleForm.name"
            maxlength="80"
            show-word-limit
            :placeholder="$t('ruleNamePlaceholder')"
          />
        </div>

        <div class="field-grid">
          <div class="field-block">
            <label class="field-label" for="rule-condition">{{ $t('ruleConditionType') }}</label>
            <el-select id="rule-condition" v-model="ruleForm.conditionType" class="field-control">
              <el-option value="subject" :label="$t('conditionSubject')" />
              <el-option value="sender" :label="$t('conditionSender')" />
              <el-option value="all" :label="$t('ruleMatchAll')" />
            </el-select>
          </div>

          <div v-if="ruleForm.conditionType !== 'all'" class="field-block">
            <label class="field-label" for="rule-value">{{ $t('ruleConditionValue') }}</label>
            <el-input
              id="rule-value"
              ref="keywordInput"
              v-model="ruleForm.conditionValue"
              maxlength="120"
              :placeholder="conditionPlaceholder"
            />
          </div>
        </div>

        <div class="field-grid field-grid--bottom">
          <div class="field-block">
            <label class="field-label" for="rule-action">{{ $t('ruleActionType') }}</label>
            <el-select id="rule-action" v-model="ruleForm.action" class="field-control">
              <el-option value="star" :label="$t('actionStar')" />
              <el-option value="archive" :label="$t('actionArchive')" />
              <el-option value="markRead" :label="$t('actionMarkRead')" />
            </el-select>
          </div>

          <label class="enabled-field">
            <el-switch v-model="ruleForm.enabled" />
            <span>
              <strong>{{ $t('ruleEnabledLabel') }}</strong>
              <small>{{ $t('ruleEnabledHint') }}</small>
            </span>
          </label>
        </div>

        <footer class="editor-footer">
          <button type="button" class="text-action" @click="cancelEdit">{{ $t('cancel') }}</button>
          <el-button type="primary" native-type="submit" class="save-action">
            {{ $t('save') }}
          </el-button>
        </footer>
      </form>
    </section>
  </div>
</template>

<script setup>
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Icon } from '@iconify/vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRulesStore } from '@/store/rules.js'
import { useMobileNavigationStore } from '@/store/mobile-navigation.js'

defineOptions({ name: 'rules' })

const { t } = useI18n()
const rulesStore = useRulesStore()
const mobileNavigation = useMobileNavigationStore()
const editorOpen = ref(false)
const editorSection = ref(null)
const keywordInput = ref(null)
const ruleForm = reactive(createEmptyRule())

const isEditing = computed(() => Boolean(ruleForm.id))
const enabledCount = computed(() => rulesStore.rules.filter(rule => rule.enabled).length)
const conditionPlaceholder = computed(() =>
  ruleForm.conditionType === 'subject' ? t('ruleSubjectPlaceholder') : t('ruleConditionPlaceholder')
)

watch(editorOpen, (open) => {
  if (typeof window === 'undefined' || window.innerWidth > 1024) return
  if (open) {
    mobileNavigation.openLayer('rules-editor', () => {
      cancelEdit()
      return true
    })
  } else {
    mobileNavigation.closeLayer('rules-editor')
  }
})

function createEmptyRule() {
  return {
    id: null,
    name: '',
    conditionType: 'subject',
    conditionValue: '',
    action: 'star',
    enabled: true,
  }
}

function resetForm(rule = createEmptyRule()) {
  Object.assign(ruleForm, createEmptyRule(), rule)
}

async function openEditor(rule) {
  resetForm(rule)
  editorOpen.value = true
  await nextTick()
  editorSection.value?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  keywordInput.value?.focus?.()
}

function openAdd() {
  openEditor()
}

function openEdit(rule) {
  openEditor({ ...rule })
}

function cancelEdit() {
  editorOpen.value = false
  resetForm()
}

function saveRule() {
  const name = ruleForm.name.trim()
  const conditionValue = ruleForm.conditionValue.trim()

  if (!name) {
    ElMessage({ message: t('ruleNameRequired'), type: 'error', plain: true })
    return
  }
  if (ruleForm.conditionType !== 'all' && !conditionValue) {
    ElMessage({ message: t('ruleConditionRequired'), type: 'error', plain: true })
    return
  }

  const payload = {
    ...ruleForm,
    name,
    conditionValue,
  }

  if (isEditing.value) {
    rulesStore.updateRule(payload)
  } else {
    rulesStore.addRule(payload)
  }

  ElMessage({ message: t('ruleSaved'), type: 'success', plain: true })
  cancelEdit()
}

function toggleRule(id, enabled) {
  rulesStore.setEnabled(id, enabled)
}

async function deleteRule(id) {
  try {
    await ElMessageBox.confirm(
      t('deleteRuleConfirm'),
      t('delete'),
      {
        confirmButtonText: t('delete'),
        cancelButtonText: t('cancel'),
        type: 'warning',
      },
    )
    rulesStore.removeRule(id)
    if (ruleForm.id === id) cancelEdit()
    ElMessage({ message: t('ruleDeleted'), type: 'success', plain: true })
  } catch {
    // Closing the confirmation dialog is an intentional no-op.
  }
}

function conditionLabel(type) {
  const key = { sender: 'conditionSender', subject: 'conditionSubject', all: 'ruleMatchAll' }[type]
  return key ? t(key) : type
}

function actionLabel(action) {
  const key = { star: 'actionStar', archive: 'actionArchive', markRead: 'actionMarkRead' }[action]
  return key ? t(key) : action
}
</script>

<style scoped lang="scss">
.rules-page {
  width: min(1120px, 100%);
  margin: 0 auto;
  padding: 28px 32px 64px;

  @media (max-width: 720px) {
    padding: 20px 16px 40px;
  }
}

.rules-hero {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 28px;
  margin-bottom: 22px;

  @media (max-width: 620px) {
    align-items: flex-start;
    flex-direction: column;
    gap: 18px;
  }
}

.hero-copy {
  min-width: 0;
}

.eyebrow {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--psg-primary);
  font-family: var(--psg-font-mono);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: .12em;
  line-height: 1.2;
  text-transform: uppercase;
}

.eyebrow-mark {
  width: 8px;
  height: 8px;
  flex: 0 0 auto;
  background: var(--psg-primary);
  border-radius: var(--psg-radius-full);
}

.rules-hero h1 {
  margin: 9px 0 6px;
  color: var(--psg-text);
  font-size: clamp(24px, 3vw, 32px);
  font-weight: 700;
  letter-spacing: -.035em;
  line-height: 1.1;
}

.rules-hero p {
  max-width: 600px;
  margin: 0;
  color: var(--psg-text-secondary);
  font-size: 14px;
  line-height: 1.6;
}

.primary-action,
.empty-action,
.save-action {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 40px;
  border-radius: var(--psg-radius-sm) !important;
  font-weight: 700;
}

.primary-action {
  flex: 0 0 auto;
  padding-inline: 16px;
}

.scope-note {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 14px;
  margin-bottom: 16px;
  color: var(--psg-text-secondary);
  background: var(--psg-surface-muted);
  border: 1px solid var(--psg-border);
  border-radius: var(--psg-radius-sm);
  font-size: 12px;
  line-height: 1.55;

  svg {
    flex: 0 0 auto;
    margin-top: 1px;
    color: var(--psg-primary);
  }
}

.stats-grid {
  display: grid;
  grid-template-columns: minmax(130px, .65fr) minmax(130px, .65fr) minmax(220px, 1.7fr);
  gap: 10px;
  margin-bottom: 16px;

  @media (max-width: 620px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));

    .stat-card--wide {
      grid-column: 1 / -1;
    }
  }
}

.stat-card {
  min-height: 86px;
  padding: 15px 16px;
  background: var(--psg-surface);
  border: 1px solid var(--psg-border);
}

.stat-label {
  display: block;
  margin-bottom: 8px;
  color: var(--psg-text-muted);
  font-family: var(--psg-font-mono);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.stat-value {
  display: block;
  color: var(--psg-text);
  font-family: var(--psg-font-mono);
  font-size: 26px;
  font-weight: 500;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.stat-value--accent {
  color: var(--psg-primary);
}

.stat-description {
  display: block;
  color: var(--psg-text-secondary);
  font-size: 13px;
  line-height: 1.45;
}

.rules-section,
.editor-section {
  overflow: hidden;
  background: var(--psg-surface);
  border: 1px solid var(--psg-border);
}

.section-header,
.editor-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 19px 20px 17px;
  border-bottom: 1px solid var(--psg-border);
}

.section-header h2,
.editor-header h2 {
  margin: 0 0 4px;
  color: var(--psg-text);
  font-size: 16px;
  font-weight: 700;
  letter-spacing: -.015em;
}

.section-header p {
  margin: 0;
  color: var(--psg-text-secondary);
  font-size: 12px;
  line-height: 1.5;
}

.section-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 28px;
  padding: 0 7px;
  color: var(--psg-primary);
  background: var(--psg-primary-muted);
  border-radius: var(--psg-radius-sm);
  font-family: var(--psg-font-mono);
  font-size: 12px;
  font-weight: 700;
}

.empty-state {
  display: flex;
  align-items: center;
  flex-direction: column;
  padding: 52px 24px 58px;
  text-align: center;
}

.empty-icon-wrap {
  display: grid;
  width: 52px;
  height: 52px;
  margin-bottom: 15px;
  place-items: center;
  color: var(--psg-primary);
  background: var(--psg-primary-muted);
  border-radius: var(--psg-radius-sm);
}

.empty-state h3 {
  margin: 0 0 5px;
  color: var(--psg-text);
  font-size: 15px;
  font-weight: 700;
}

.empty-state p {
  max-width: 360px;
  margin: 0 0 18px;
  color: var(--psg-text-secondary);
  font-size: 13px;
  line-height: 1.55;
}

.rule-list {
  display: flex;
  flex-direction: column;
}

.rule-row {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
  padding: 16px 20px;
  border-bottom: 1px solid var(--psg-border);
  transition: background-color 160ms ease, opacity 160ms ease;

  &:last-child {
    border-bottom: 0;
  }

  &:hover {
    background: var(--psg-surface-muted);
  }

  &--disabled {
    opacity: .62;
  }

  @media (max-width: 620px) {
    align-items: flex-start;
    flex-wrap: wrap;
    padding: 15px 16px;
  }
}

.rule-icon {
  display: grid;
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
  place-items: center;
  color: var(--psg-primary);
  background: var(--psg-primary-muted);
  border: 1px solid var(--psg-primary-muted-strong);
  border-radius: var(--psg-radius-sm);
}

.rule-content {
  min-width: 0;
  flex: 1 1 auto;
}

.rule-title-line {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
  margin-bottom: 5px;
}

.rule-title-line h3 {
  overflow: hidden;
  margin: 0;
  color: var(--psg-text);
  font-size: 14px;
  font-weight: 700;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rule-status {
  flex: 0 0 auto;
  padding: 2px 6px;
  color: var(--psg-success-dark-2);
  background: var(--psg-success-light-9);
  border-radius: var(--psg-radius-xs);
  font-family: var(--psg-font-mono);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: .04em;
  text-transform: uppercase;
}

.rule-status--muted {
  color: var(--psg-text-muted);
  background: var(--psg-surface-muted);
}

.rule-detail-line {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 7px;
  color: var(--psg-text-secondary);
  font-size: 12px;
  line-height: 1.45;
}

.rule-detail-group {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 5px;
}

.detail-label {
  color: var(--psg-text-muted);
}

.detail-value {
  color: var(--psg-text-secondary);
  font-weight: 600;
}

.keyword-value {
  max-width: min(360px, 42vw);
  overflow: hidden;
  padding: 2px 6px;
  color: var(--psg-primary);
  background: var(--psg-primary-muted);
  border-radius: var(--psg-radius-xs);
  font-family: var(--psg-font-mono);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail-arrow {
  color: var(--psg-text-muted);
  font-family: var(--psg-font-mono);
}

.rule-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;

  @media (max-width: 620px) {
    width: 100%;
    padding-left: 50px;
  }
}

.icon-action,
.close-editor {
  display: inline-grid;
  width: 32px;
  height: 32px;
  padding: 0;
  place-items: center;
  color: var(--psg-text-secondary);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--psg-radius-sm);
  cursor: pointer;
  transition: background-color 140ms ease, border-color 140ms ease, color 140ms ease;

  &:hover {
    color: var(--psg-text);
    background: var(--psg-surface-muted);
    border-color: var(--psg-border);
  }

  &:active {
    transform: translateY(1px);
  }
}

.icon-action--danger:hover {
  color: var(--psg-danger);
  background: var(--psg-danger-muted);
  border-color: var(--psg-danger-light-7);
}

.editor-section {
  margin-top: 16px;
  scroll-margin-top: 20px;
}

.editor-header {
  align-items: center;
}

.editor-header .eyebrow {
  margin-bottom: 7px;
}

.close-editor {
  flex: 0 0 auto;
}

.editor-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 20px;
}

.field-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;

  @media (max-width: 620px) {
    grid-template-columns: 1fr;
  }
}

.field-block {
  display: flex;
  flex-direction: column;
  gap: 7px;
  min-width: 0;
}

.field-label {
  color: var(--psg-text-secondary);
  font-family: var(--psg-font-mono);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.field-control {
  width: 100%;
}

.enabled-field {
  display: flex;
  align-items: center;
  gap: 11px;
  min-height: 40px;
  padding: 8px 12px;
  background: var(--psg-surface-muted);
  border: 1px solid var(--psg-border);
  border-radius: var(--psg-radius-sm);
  cursor: pointer;

  span {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  strong {
    color: var(--psg-text);
    font-size: 12px;
    font-weight: 700;
  }

  small {
    color: var(--psg-text-muted);
    font-size: 11px;
    line-height: 1.35;
  }
}

.editor-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  padding-top: 4px;
  border-top: 1px solid var(--psg-border);
}

.text-action {
  padding: 7px 8px;
  color: var(--psg-text-secondary);
  background: transparent;
  border: 0;
  border-radius: var(--psg-radius-xs);
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;

  &:hover {
    color: var(--psg-text);
    background: var(--psg-surface-muted);
  }
}
</style>
