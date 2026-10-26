import { toRaw } from 'vue'
import { draftList, draftSave, draftDelete } from '@/request/draft.js'
import { userDraftStore } from '@/store/draft.js'
import db from '@/db/db.js'

// Drafts live on the server so they follow the user to every browser and
// device. Saving sends the compose form; attachments that are new go up with
// their content once and come back as references, which the form then keeps.

function isEmpty(form) {
  return !form.content && !form.subject && !(form.receiveEmail?.length > 0)
}

// Saves the form as a draft (new, or replacing form.draftId) and returns the
// saved draft; an empty form deletes its draft instead and returns null.
export async function saveDraft(form) {
  const data = { ...toRaw(form) }
  data.receiveEmail = [...(data.receiveEmail || [])]
  data.cc = [...(data.cc || [])]
  data.bcc = [...(data.bcc || [])]
  data.attachments = (toRaw(form.attachments) || []).map(a => ({ ...toRaw(a) }))
  if (isEmpty(data)) {
    if (data.draftId) await deleteDrafts([data.draftId])
    return null
  }
  const saved = await draftSave(data)
  userDraftStore().refreshList++
  return saved
}

export async function deleteDrafts(draftIds) {
  const ids = (draftIds || []).filter(Boolean)
  if (!ids.length) return
  await draftDelete(ids)
  userDraftStore().refreshList++
}

export async function listDrafts(timeSort = 0) {
  await migrateLocalDrafts()
  const list = await draftList()
  return timeSort ? [...list].reverse() : list
}

// Drafts saved by earlier versions in this browser's IndexedDB are moved to
// the server once, then removed locally. A draft that fails to upload stays
// local and is retried next time.
let migrating = null
function migrateLocalDrafts() {
  if (!migrating) migrating = (async () => {
    try {
      const local = db.value?.draft
      if (!local) return
      const drafts = await local.orderBy('createTime').toArray()
      for (const draft of drafts) {
        try {
          const att = await db.value.att.get(draft.draftId)
          const { draftId, ...rest } = draft
          if (!isEmpty(rest)) await draftSave({ ...rest, attachments: att?.attachments || [] })
          await local.delete(draftId)
          await db.value.att.delete(draftId)
        } catch {}
      }
    } catch {}
  })().finally(() => { migrating = null })
  return migrating
}
