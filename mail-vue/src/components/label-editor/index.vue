<template>
  <el-dialog v-model="visible" :title="editing ? $t('labelEdit') : $t('newLabel')" width="400" align-center>
    <div class="le-body">
      <el-input v-model="name" :placeholder="$t('newLabelPrompt')" maxlength="60" @keyup.enter="save" />
      <div class="le-swatches" role="radiogroup" :aria-label="$t('labelColor')">
        <button v-for="c in LABEL_COLORS" :key="c" type="button" role="radio" class="le-swatch"
                :class="{ active: color === c }" :style="{ background: c }" :aria-checked="color === c"
                @click="color = c" />
      </div>
    </div>
    <template #footer>
      <div class="le-footer">
        <el-button v-if="editing" type="danger" plain class="le-delete" @click="remove">{{ $t('labelDelete') }}</el-button>
        <el-button @click="visible = false">{{ $t('cancel') }}</el-button>
        <el-button type="primary" :loading="saving" @click="save">{{ $t('save') }}</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useLabelStore } from '@/store/label.js'
import { labelCreate, labelUpdate, labelDelete } from '@/request/label.js'
import { LABEL_COLORS } from '@/utils/label-colors.js'

const emit = defineEmits(['created', 'deleted'])
const { t } = useI18n()
const labelStore = useLabelStore()

const visible = ref(false)
const saving = ref(false)
const editing = ref(null)
const name = ref('')
const color = ref(LABEL_COLORS[0])

// Pass a label to edit it, or nothing to create one.
function open(label = null) {
  editing.value = label
  name.value = label?.name || ''
  color.value = label?.color || LABEL_COLORS[labelStore.labels.length % LABEL_COLORS.length]
  visible.value = true
}

async function save() {
  if (saving.value) return
  const trimmed = name.value.trim()
  if (!trimmed) { ElMessage({ message: t('labelNameRequired'), type: 'error', plain: true }); return }
  saving.value = true
  try {
    if (editing.value) {
      const updated = await labelUpdate(editing.value.labelId, { name: trimmed, color: color.value })
      labelStore.upsertLocal({ ...editing.value, ...updated })
      ElMessage({ message: t('labelUpdated'), type: 'success', plain: true })
    } else {
      const created = await labelCreate(trimmed, color.value)
      labelStore.upsertLocal(created)
      ElMessage({ message: t('labelCreated'), type: 'success', plain: true })
      emit('created', created)
    }
    visible.value = false
  } catch {
    ElMessage({ message: t('operationFailMsg'), type: 'error', plain: true })
  } finally {
    saving.value = false
  }
}

async function remove() {
  const label = editing.value
  try {
    await ElMessageBox.confirm(t('labelDeleteConfirm'), { confirmButtonText: t('confirm'), cancelButtonText: t('cancel'), type: 'warning' })
    await labelDelete(label.labelId)
    labelStore.removeLocal(label.labelId)
    visible.value = false
    ElMessage({ message: t('labelDeleted'), type: 'success', plain: true })
    emit('deleted', label)
  } catch (e) {
    if (e !== 'cancel') ElMessage({ message: t('operationFailMsg'), type: 'error', plain: true })
  }
}

defineExpose({ open })
</script>

<style scoped lang="scss">
.le-body { display: flex; flex-direction: column; gap: 16px; }

.le-swatches { display: flex; flex-wrap: wrap; gap: 10px; }

.le-swatch {
  width: 28px;
  height: 28px;
  padding: 0;
  border: 2px solid transparent;
  border-radius: 50%;
  background-clip: content-box;
  box-shadow: inset 0 0 0 3px var(--psg-surface);
  cursor: pointer;

  &.active { border-color: var(--psg-text); }
}

.le-footer { display: flex; justify-content: flex-end; gap: 8px; }
.le-delete { margin-right: auto; }
</style>
