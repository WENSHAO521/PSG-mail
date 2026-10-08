<template>
  <div class="sig-manager">
    <!-- Signature list + editor, Gmail style: pick on the left, edit on the right. -->
    <div class="card-body sig-body">
      <aside class="sig-list">
        <div class="sig-list-head">
          <span class="sig-list-count">{{ $t('signatureCount', { n: items.length, max: MAX }) }}</span>
          <button type="button" class="sig-add-btn" :disabled="items.length >= MAX" @click="addSignature">
            <Icon icon="psg:add-circle" width="16" height="16" />{{ $t('signatureNew') }}
          </button>
        </div>
        <div v-if="!items.length" class="sig-empty">{{ $t('signatureEmpty') }}</div>
        <ul v-else class="sig-items" role="listbox" :aria-label="$t('signature')">
          <li v-for="item in items" :key="item.id" role="option" :aria-selected="item.id === activeId"
              class="sig-item" :class="{ 'is-active': item.id === activeId }" @click="select(item.id)">
            <span class="sig-item-name">{{ displayName(item) }}</span>
            <span v-if="item.id === newId" class="sig-badge">{{ $t('signatureBadgeNew') }}</span>
            <span v-if="item.id === replyId" class="sig-badge">{{ $t('signatureBadgeReply') }}</span>
            <button type="button" class="sig-item-del" :title="$t('delete')" :aria-label="$t('delete')"
                    @click.stop="remove(item.id)">
              <Icon icon="psg:trash" width="15" height="15" />
            </button>
          </li>
        </ul>
      </aside>

      <section class="sig-editor" v-show="active">
        <el-input v-model="nameDraft" class="sig-name-input" :maxlength="60"
                  :placeholder="$t('signatureNamePlaceholder')" @input="onNameInput" />
        <div class="editor-shell">
          <tinyEditor
            ref="editorRef"
            :def-value="editorValue"
            editor-id="signature-editor"
            toolbar="bold italic underline | forecolor | link | code"
            height="220px"
            :placeholder="$t('signaturePlaceholder')"
            @change="onEditorChange"
          />
        </div>
      </section>
      <section v-if="!active" class="sig-editor sig-editor--empty">
        <Icon icon="psg:edit" width="28" height="28" />
        <span>{{ $t('signatureEmptyHint') }}</span>
      </section>
    </div>

    <!-- Defaults -->
    <div class="card-body list-body sig-defaults">
      <div class="sig-default-row">
        <div>
          <div class="toggle-label">{{ $t('signatureDefaultNew') }}</div>
          <div class="card-desc">{{ $t('signatureDefaultNewDesc') }}</div>
        </div>
        <el-select v-model="newId" class="sig-default-select" :placeholder="$t('signatureNone')">
          <el-option :label="$t('signatureNone')" :value="''" />
          <el-option v-for="item in items" :key="item.id" :label="displayName(item)" :value="item.id" />
        </el-select>
      </div>
      <div class="sig-default-row">
        <div>
          <div class="toggle-label">{{ $t('signatureDefaultReply') }}</div>
          <div class="card-desc">{{ $t('signatureDefaultReplyDesc') }}</div>
        </div>
        <el-select v-model="replyId" class="sig-default-select" :placeholder="$t('signatureNone')">
          <el-option :label="$t('signatureNone')" :value="''" />
          <el-option v-for="item in items" :key="item.id" :label="displayName(item)" :value="item.id" />
        </el-select>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onActivated } from 'vue'
import { Icon } from '@iconify/vue'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import tinyEditor from '@/components/tiny-editor/index.vue'
import { useUserStore } from '@/store/user.js'

const MAX = 20

const { t } = useI18n()
const userStore = useUserStore()

const items = ref([])
const newId = ref('')
const replyId = ref('')
const activeId = ref('')
const nameDraft = ref('')
const editorValue = ref('')
const editorRef = ref(null)
const saving = ref(false)

const active = computed(() => items.value.find(i => i.id === activeId.value) || null)

function displayName(item) {
  return item.name || t('signatureUntitled')
}

function load() {
  const sigs = userStore.user.signatures
  if (sigs && Array.isArray(sigs.items)) {
    items.value = sigs.items.map(i => ({ ...i }))
    newId.value = sigs.newId || ''
    replyId.value = sigs.replyId || ''
  } else {
    items.value = userStore.signatureList.map(i => ({ ...i }))
    newId.value = items.value[0]?.id || ''
    replyId.value = items.value[0]?.id || ''
  }
  select(items.value[0]?.id || '', { flush: false })
}

// Writes what's in the editor back to the signature being edited.
function flush() {
  const cur = active.value
  if (!cur) return
  const html = editorRef.value?.getContent?.()
  if (typeof html === 'string') cur.html = html
}

function select(id, { flush: doFlush = true } = {}) {
  if (doFlush) flush()
  activeId.value = id
  const cur = active.value
  nameDraft.value = cur?.name || ''
  editorValue.value = cur?.html || ''
}

function newSigId() {
  return 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

function addSignature() {
  if (items.value.length >= MAX) return
  flush()
  const item = { id: newSigId(), name: t('signatureDefaultName', { n: items.value.length + 1 }), html: '' }
  items.value.push(item)
  // The first signature becomes the default for both, like Gmail.
  if (items.value.length === 1) { newId.value = item.id; replyId.value = item.id }
  select(item.id, { flush: false })
}

function remove(id) {
  const idx = items.value.findIndex(i => i.id === id)
  if (idx < 0) return
  items.value.splice(idx, 1)
  if (newId.value === id) newId.value = ''
  if (replyId.value === id) replyId.value = ''
  if (activeId.value === id) {
    select(items.value[Math.min(idx, items.value.length - 1)]?.id || '', { flush: false })
  }
}

function onNameInput(v) {
  if (active.value) active.value.name = v
}

function onEditorChange(html) {
  if (active.value) active.value.html = html
}

async function save() {
  flush()
  saving.value = true
  try {
    await userStore.saveSignatures({
      items: items.value.map(({ id, name, html }) => ({ id, name: (name || '').trim(), html: html || '' })),
      newId: newId.value || null,
      replyId: replyId.value || null,
    })
    ElMessage({ message: t('signatureSaved'), type: 'success', plain: true })
  } finally {
    saving.value = false
  }
}

onMounted(load)
onActivated(load)

defineExpose({ save, saving })
</script>

<style scoped>
.card-body {
  padding: 20px 22px;
  margin-bottom: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  background: var(--psg-surface-muted);
  border-radius: var(--psg-radius-lg);
}

.sig-body {
  flex-direction: row;
  align-items: stretch;
  gap: 0;
  padding: 0;
  overflow: hidden;
  min-height: 320px;
}

.sig-list {
  width: 240px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--psg-border);
}

.sig-list-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 12px 12px 10px 16px;
  border-bottom: 1px solid var(--psg-border);
}

.sig-list-count {
  font-size: 12px;
  color: var(--psg-text-muted);
  white-space: nowrap;
}

.sig-add-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 30px;
  padding: 0 10px;
  border: 0;
  border-radius: var(--psg-radius-sm);
  background: var(--psg-surface);
  color: var(--psg-text);
  font: inherit;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  transition: background .12s ease, color .12s ease;

  &:hover:not(:disabled) { background: var(--psg-primary-muted); color: var(--psg-primary); }
  &:disabled { opacity: .5; cursor: not-allowed; }
}

.sig-items {
  list-style: none;
  margin: 0;
  padding: 6px;
  overflow-y: auto;
  max-height: 420px;
}

.sig-item {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 38px;
  padding: 0 6px 0 10px;
  border-radius: var(--psg-radius-sm);
  font-size: 13.5px;
  color: var(--psg-text);
  cursor: pointer;
  transition: background .12s ease;

  &:hover { background: var(--psg-surface-active); }
  &.is-active { background: var(--psg-menu-active-bg); color: var(--psg-menu-active-text); font-weight: 600; }
  &:hover .sig-item-del, &.is-active .sig-item-del { opacity: 1; }
}

.sig-item-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sig-badge {
  flex-shrink: 0;
  padding: 1px 6px;
  border-radius: var(--psg-radius-full);
  background: var(--psg-primary-muted);
  color: var(--psg-primary);
  font-size: 10.5px;
  font-weight: 600;
}

.sig-item-del {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  flex-shrink: 0;
  border: 0;
  border-radius: var(--psg-radius-xs);
  background: transparent;
  color: var(--psg-text-muted);
  cursor: pointer;
  opacity: 0;
  transition: opacity .12s ease, background .12s ease, color .12s ease;

  &:hover { background: var(--psg-danger-muted); color: var(--psg-danger); }
  @media (hover: none) { opacity: 1; }
}

.sig-empty {
  padding: 24px 16px;
  font-size: 13px;
  color: var(--psg-text-muted);
}

.sig-editor {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px 18px 18px;
}

.sig-editor--empty {
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--psg-text-muted);
  font-size: 13px;
}

.sig-name-input :deep(.el-input__wrapper) { min-height: 40px; }
.sig-name-input :deep(.el-input__inner) { font-weight: 600; }

:where(.sig-editor) :deep(.sig-name-input .el-input__wrapper:not(.is-focus)) {
  background-color: var(--psg-surface) !important;
}

/* Same field skin as the name input above (and every other Mist field):
   a borderless surface well that picks up the 2px accent ring on focus. */
.editor-shell {
  border-radius: var(--psg-radius-sm);
  background: var(--psg-surface);
  overflow: hidden;
  height: 220px;
  transition: box-shadow .14s ease;

  &:focus-within { box-shadow: 0 0 0 2px var(--psg-primary); }
}

.sig-defaults { padding: 0; gap: 0; overflow: hidden; }

.sig-default-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 22px;
  border-bottom: 1px solid var(--psg-border);
  &:last-child { border-bottom: 0; }

  .card-desc { margin: 0; }
}

.toggle-label {
  font-size: 14px;
  font-weight: 700;
  color: var(--psg-text);
  margin-bottom: 4px;
}

.card-desc {
  font-size: 13px;
  line-height: 1.6;
  color: var(--psg-text-secondary);
}

.sig-default-select { width: 220px; flex-shrink: 0; }

@media (max-width: 767px) {
  .sig-body { flex-direction: column; }
  .sig-list { width: auto; border-right: 0; border-bottom: 1px solid var(--psg-border); }
  .sig-items { max-height: 220px; }
  .sig-editor { padding: 14px; }
  .sig-default-row { flex-direction: column; align-items: stretch; gap: 10px; padding: 14px 16px; }
  .sig-default-select { width: 100%; }
}
</style>
