<template>
  <div class="tools-page">

    <!-- ── Templates section ── -->
    <div class="section">
      <div class="section-label">{{ $t('templates') }}</div>
      <div class="tools-area">
        <div class="item-list" v-if="tplList.length">
          <div class="list-item" v-for="tpl in tplList" :key="tpl.templateId">
            <div class="item-info">
              <span class="item-name">{{ tpl.name }}</span>
              <span class="item-sub" v-if="tpl.subject">— {{ tpl.subject }}</span>
            </div>
            <div class="item-actions">
              <span class="text-link" @click="openEditTpl(tpl)">{{ $t('change') }}</span>
              <span class="text-link remove" @click="deleteTpl(tpl.templateId)">{{ $t('delete') }}</span>
            </div>
          </div>
        </div>
        <div v-else class="empty-hint">{{ $t('noTemplates') }}</div>
        <el-button size="small" @click="openAddTpl">{{ $t('addTemplate') }}</el-button>
      </div>
    </div>

    <!-- ── Contact Groups section ── -->
    <div class="section">
      <div class="section-label">{{ $t('contactGroups') }}</div>
      <div class="tools-area">
        <div class="item-list" v-if="groupList.length">
          <div class="list-item" v-for="g in groupList" :key="g.groupId">
            <div class="item-info">
              <span class="item-name">{{ g.name }}</span>
              <span class="item-sub">{{ g.emails.join(', ') }}</span>
            </div>
            <div class="item-actions">
              <span class="text-link" @click="openEditGroup(g)">{{ $t('change') }}</span>
              <span class="text-link remove" @click="deleteGroup(g.groupId)">{{ $t('delete') }}</span>
            </div>
          </div>
        </div>
        <div v-else class="empty-hint">{{ $t('noGroups') }}</div>
        <el-button size="small" @click="openAddGroup">{{ $t('addGroup') }}</el-button>
      </div>
    </div>

    <!-- Template dialog -->
    <el-dialog v-model="tplShow" :title="tplForm.templateId ? $t('editTemplate') : $t('addTemplate')" width="520">
      <div style="display:flex;flex-direction:column;gap:10px">
        <el-input v-model="tplForm.name" :placeholder="$t('templateName')"/>
        <el-input v-model="tplForm.subject" :placeholder="$t('templateSubject')"/>
        <div style="height:200px;border:1px solid var(--psg-border);border-radius: var(--psg-radius-sm);overflow:hidden">
          <tinyEditor ref="tplEditorRef" :def-value="tplForm.content" editor-id="tools-tpl-editor"
            toolbar="bold italic underline | forecolor | link | code" height="200px"
            @change="(html) => tplForm.content = html"/>
        </div>
        <el-button type="primary" :loading="tplLoading" @click="saveTpl">{{ $t('save') }}</el-button>
      </div>
    </el-dialog>

    <!-- Contact Group dialog -->
    <el-dialog v-model="groupShow" :title="groupForm.groupId ? $t('addGroup') : $t('addGroup')" width="460">
      <div style="display:flex;flex-direction:column;gap:10px">
        <el-input v-model="groupForm.name" :placeholder="$t('groupName')"/>
        <el-input-tag v-model="groupForm.emails" :placeholder="$t('emailAccount')" tag-type="primary"/>
        <el-button type="primary" :loading="groupLoading" @click="saveGroup">{{ $t('save') }}</el-button>
      </div>
    </el-dialog>

  </div>
</template>

<script setup>
import { reactive, ref, onMounted, defineOptions } from 'vue'
import { useI18n } from 'vue-i18n'
import tinyEditor from '@/components/tiny-editor/index.vue'
import { templateList, templateAdd, templateUpdate, templateDelete } from '@/request/template.js'
import { contactGroupList, contactGroupAdd, contactGroupUpdate, contactGroupDelete } from '@/request/contact-group.js'

defineOptions({ name: 'tools' })

const { t } = useI18n()

// ── Templates ─────────────────────────────────────────────
const tplList = ref([])
const tplShow = ref(false)
const tplLoading = ref(false)
const tplEditorRef = ref(null)
const tplForm = reactive({ templateId: null, name: '', subject: '', content: '' })

// ── Groups ────────────────────────────────────────────────
const groupList = ref([])
const groupShow = ref(false)
const groupLoading = ref(false)
const groupForm = reactive({ groupId: null, name: '', emails: [] })

onMounted(() => {
  templateList().then(list => tplList.value = list).catch(() => {})
  contactGroupList().then(list => groupList.value = list).catch(() => {})
})

// Template CRUD
function openAddTpl() {
  Object.assign(tplForm, { templateId: null, name: '', subject: '', content: '' })
  tplShow.value = true
}
function openEditTpl(tpl) {
  Object.assign(tplForm, { templateId: tpl.templateId, name: tpl.name, subject: tpl.subject, content: tpl.content })
  tplShow.value = true
}
async function saveTpl() {
  tplLoading.value = true
  try {
    const html = tplEditorRef.value?.getContent?.() ?? tplForm.content
    if (tplForm.templateId) {
      await templateUpdate(tplForm.templateId, tplForm.name, tplForm.subject, html)
      const idx = tplList.value.findIndex(t => t.templateId === tplForm.templateId)
      if (idx > -1) tplList.value[idx] = { ...tplList.value[idx], name: tplForm.name, subject: tplForm.subject, content: html }
    } else {
      const newTpl = await templateAdd(tplForm.name, tplForm.subject, html)
      tplList.value.unshift(newTpl)
    }
    tplShow.value = false
    ElMessage({ message: t('templateSaved'), type: 'success', plain: true })
  } finally { tplLoading.value = false }
}
async function deleteTpl(templateId) {
  await templateDelete(templateId)
  tplList.value = tplList.value.filter(t => t.templateId !== templateId)
  ElMessage({ message: t('templateDeleted'), type: 'success', plain: true })
}

// Group CRUD
function openAddGroup() {
  Object.assign(groupForm, { groupId: null, name: '', emails: [] })
  groupShow.value = true
}
function openEditGroup(g) {
  Object.assign(groupForm, { groupId: g.groupId, name: g.name, emails: [...g.emails] })
  groupShow.value = true
}
async function saveGroup() {
  groupLoading.value = true
  try {
    if (groupForm.groupId) {
      await contactGroupUpdate(groupForm.groupId, groupForm.name, groupForm.emails)
      const idx = groupList.value.findIndex(g => g.groupId === groupForm.groupId)
      if (idx > -1) groupList.value[idx] = { ...groupList.value[idx], name: groupForm.name, emails: [...groupForm.emails] }
    } else {
      const ng = await contactGroupAdd(groupForm.name, groupForm.emails)
      groupList.value.unshift(ng)
    }
    groupShow.value = false
    ElMessage({ message: t('groupSaved'), type: 'success', plain: true })
  } finally { groupLoading.value = false }
}
async function deleteGroup(groupId) {
  await contactGroupDelete(groupId)
  groupList.value = groupList.value.filter(g => g.groupId !== groupId)
  ElMessage({ message: t('groupDeleted'), type: 'success', plain: true })
}
</script>

<style lang="scss" scoped>
.tools-page {
  max-width: 640px;
  margin: 0 auto;
  padding: 24px 20px;
  display: flex;
  flex-direction: column;
  gap: 32px;
}

.section {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.section-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--psg-text-secondary);
  border-bottom: 2px solid var(--psg-primary);
  padding-bottom: 6px;
}

.tools-area {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.item-list {
  border: 1px solid var(--psg-border);
  border-radius: var(--psg-radius-sm);
  overflow: hidden;
}

.list-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid var(--psg-border);
  transition: background 0.1s;
  &:last-child { border-bottom: none; }
  &:hover { background: var(--psg-surface-muted); }

  .item-info {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;

    .item-name {
      font-size: 13px;
      font-weight: 600;
      color: var(--psg-text);
    }
    .item-sub {
      font-size: 12px;
      color: var(--psg-text-secondary);
      margin-left: 6px;
    }
  }

  .item-actions {
    display: flex;
    gap: 12px;
    flex-shrink: 0;
    margin-left: 14px;
    font-size: 12.5px;
  }
}

.empty-hint {
  font-size: 13px;
  color: var(--psg-text-secondary);
  padding: 4px 0;
}

.text-link {
  cursor: pointer;
  color: var(--psg-text-secondary);
  &:hover { color: var(--psg-text); }
  &.remove:hover { color: var(--psg-danger); }
}
</style>
