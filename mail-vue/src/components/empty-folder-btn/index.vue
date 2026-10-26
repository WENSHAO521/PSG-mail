<template>
  <button v-if="hasPerm('email:delete')" type="button" class="empty-folder-btn" :disabled="busy" @click="emptyFolder"
          :title="label" :aria-label="label">
    <Icon icon="psg:trash" width="13" height="13" />
    <span>{{ label }}</span>
  </button>
</template>

<script setup>
// "Empty Deleted" / "Empty Spam": erases the whole folder on the server, not
// just the rows loaded on screen. The server works in batches and says when
// more is left, so this keeps calling until the folder is empty.
import { computed, ref } from 'vue'
import { Icon } from '@iconify/vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { emailEmptyFolder } from '@/request/email.js'
import { hasPerm } from '@/perm/perm.js'

const props = defineProps({
  folder: { type: String, required: true }, // 'trash' | 'spam'
  accountId: Number,
  allReceive: Number,
})
const emit = defineEmits(['done'])
const { t } = useI18n()
const busy = ref(false)
const label = computed(() => t(props.folder === 'trash' ? 'emptyTrash' : 'emptySpam'))

async function emptyFolder() {
  try {
    await ElMessageBox.confirm(t(props.folder === 'trash' ? 'emptyTrashConfirm' : 'emptySpamConfirm'), {
      confirmButtonText: t('confirm'), cancelButtonText: t('cancel'), type: 'warning',
    })
  } catch { return }
  busy.value = true
  let deleted = 0
  try {
    for (let guard = 0; guard < 200; guard++) {
      const res = await emailEmptyFolder(props.folder, props.accountId, props.allReceive)
      deleted += res?.deleted || 0
      if (!res?.more) break
    }
    ElMessage({ message: t('emptyFolderDone', { n: deleted }), type: 'success', plain: true })
  } catch {
    ElMessage({ message: t('delFailMsg'), type: 'error', plain: true })
  } finally {
    busy.value = false
    emit('done')
  }
}
</script>

<style scoped>
.empty-folder-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 26px;
  padding: 0 10px;
  border: 1px solid var(--psg-border);
  border-radius: 13px;
  background: var(--psg-surface);
  color: var(--psg-danger);
  font-size: 12px;
  font-family: var(--psg-font-sans);
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
}
.empty-folder-btn:disabled { opacity: 0.6; cursor: default; }
/* Phones: icon only, so it fits beside the account chips. */
@media (max-width: 640px) {
  .empty-folder-btn { padding: 0 8px; }
  .empty-folder-btn span { display: none; }
}
@media (hover: hover) {
  .empty-folder-btn:hover:not(:disabled) { background: var(--psg-surface-muted); }
}
</style>
