import { ElMessage } from 'element-plus'
import { emailRestore } from '@/request/email.js'
import { useEmailStore } from '@/store/email.js'
import { useSettingStore } from '@/store/setting.js'
import { undoToast } from '@/utils/undo-toast.js'

// Deleting mail normally just moves it to Deleted, which can be undone, so
// it gets a "Moved to Deleted · Undo" toast instead of a confirmation box.
// Only when the admin turned on Sync Delete (0 = mail is erased at once) is
// a confirmation still needed.
export function deleteIsUndoable() {
  return Number(useSettingStore().settings.syncDelete) !== 0
}

export function trashUndoToast(t, emailIds) {
  const emailStore = useEmailStore()
  undoToast(t('movedToTrashMsg'), t('undo'), () => {
    emailRestore(emailIds)
      .then(() => emailStore.activeList?.refreshList())
      .catch(() => ElMessage({ message: t('operationFailMsg'), type: 'error', plain: true }))
  })
}
