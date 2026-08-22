<template>
  <div class="page-outer">
    <div class="space-y">

      <!-- Page header -->
      <div class="page-header">
        <div>
          <h1 class="page-title">{{ $t('contactGroups') }}</h1>
          <p class="page-subtitle">{{ $t('groupsDesc') }}</p>
          <p class="page-stats" v-if="groupList.length">
            {{ groupList.length }}&thinsp;{{ $t('groupUnit') }} · {{ totalContacts }}&thinsp;{{ $t('contactUnit') }}
          </p>
        </div>
        <el-button type="primary" class="create-btn" @click="openAdd">
          <Icon icon="psg:add-circle" width="16" height="16"/>
          {{ $t('addGroup') }}
        </el-button>
      </div>

      <!-- Toolbar -->
      <div class="header-actions" v-if="groupList.length">
        <div class="search">
          <el-input v-model="searchQuery" class="search-input" :placeholder="$t('searchGroupsPlaceholder')">
            <template #prefix><Icon icon="psg:search" width="14" height="14"/></template>
          </el-input>
        </div>
      </div>

      <!-- Empty states -->
      <div v-if="!groupList.length" class="empty-state">
        <Icon icon="psg:group" width="30" height="30" class="empty-icon"/>
        <div class="empty-title">{{ $t('noGroups') }}</div>
        <div class="empty-desc">{{ $t('noGroupsDesc') }}</div>
        <el-button type="primary" class="empty-btn" @click="openAdd">
          <Icon icon="psg:add-circle" width="14" height="14"/>
          {{ $t('addGroup') }}
        </el-button>
      </div>

      <div v-else-if="!filteredGroups.length" class="empty-state">
        <Icon icon="psg:file-search" width="30" height="30" class="empty-icon"/>
        <div class="empty-title">{{ $t('noMatchingGroups') }}</div>
        <div class="empty-desc">{{ $t('noMatchingGroupsDesc') }}</div>
      </div>

      <!-- Card grid -->
      <div v-else class="grp-grid">
        <div class="grp-card" v-for="g in filteredGroups" :key="g.groupId">
          <div class="grp-card-head">
            <div class="grp-head-left">
              <div class="grp-avatar">{{ (g.name || '?')[0].toUpperCase() }}</div>
              <div class="grp-info">
                <div class="grp-name" :title="g.name">{{ g.name }}</div>
                <div class="grp-count">
                  {{ g.contacts.length }}&thinsp;{{ g.contacts.length === 1 ? $t('memberSingle') : $t('memberPlural') }}
                </div>
              </div>
            </div>
            <el-dropdown trigger="click" @command="cmd => handleCommand(cmd, g)">
              <button class="more-btn" @click.stop>
                <Icon icon="psg:settings" width="16" height="16"/>
              </button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="edit">{{ $t('editGroup') }}</el-dropdown-item>
                  <el-dropdown-item command="duplicate">{{ $t('duplicateGroup') }}</el-dropdown-item>
                  <el-dropdown-item command="delete" divided class="danger-item">{{ $t('delete') }}</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>

          <div class="member-preview" v-if="g.contacts.length">
            <div class="member-preview-row" v-for="(c, i) in g.contacts.slice(0, 3)" :key="i">
              <span class="dot"></span>
              <span class="member-preview-text">{{ c.name || c.email }}</span>
            </div>
            <div class="member-more" v-if="g.contacts.length > 3">+{{ g.contacts.length - 3 }}</div>
          </div>
          <div class="member-preview-empty" v-else>{{ $t('noContacts') }}</div>

          <div class="grp-footer">
            <button class="grp-action" @click="openEdit(g)">
              <Icon icon="psg:user" width="13" height="13"/>
              {{ $t('viewMembers') }}
            </button>
            <el-button type="primary" class="send-btn" :disabled="!g.contacts.length" @click="sendToGroup(g)">
              <Icon icon="psg:send" width="12" height="12"/>
              {{ $t('sendEmailToGroup') }}
            </el-button>
          </div>
        </div>
      </div>
    </div>

    <!-- Drawer: edit group / view + manage members -->
    <el-drawer
      v-model="drawerShow"
      :title="groupForm.groupId ? $t('editGroup') : $t('addGroup')"
      direction="rtl"
      size="440px"
      :close-on-click-modal="false"
    >
      <div class="drawer-body">
        <div class="drawer-field">
          <label class="drawer-label">{{ $t('groupName') }}</label>
          <el-input v-model="groupForm.name" :placeholder="$t('groupName')" size="large"/>
        </div>
        <div class="drawer-field">
          <div class="members-head">
            <label class="drawer-label">{{ $t('contactMembers') }}</label>
            <button class="add-member-btn" @click="addContact">
              <Icon icon="psg:add-circle" width="12" height="12"/>
              {{ $t('addContact') }}
            </button>
          </div>
          <div v-if="!groupForm.contacts.length" class="members-empty">{{ $t('noContacts') }}</div>
          <div class="member-editor" v-else>
            <div class="editor-row" v-for="(c, i) in groupForm.contacts" :key="i">
              <div class="row-avatar">{{ ((c.name || c.email || String(i + 1))[0] || '#').toUpperCase() }}</div>
              <div class="row-fields">
                <el-input v-model="c.name" :placeholder="$t('namePlaceholder')" size="small" class="no-border-input"/>
                <el-input v-model="c.email" :placeholder="$t('emailAccount')" size="small" class="no-border-input mono-input"/>
              </div>
              <button class="remove-btn" @click="removeContact(i)">
                <Icon icon="psg:close-circle" width="13" height="13"/>
              </button>
            </div>
          </div>
        </div>
      </div>
      <template #footer>
        <div class="drawer-footer">
          <el-button @click="drawerShow = false">{{ $t('cancel') }}</el-button>
          <el-button type="primary" :loading="groupLoading" @click="saveGroup">{{ $t('save') }}</el-button>
        </div>
      </template>
    </el-drawer>
  </div>
</template>

<script setup>
import { reactive, ref, computed, onMounted, defineOptions } from 'vue'
import { useI18n } from 'vue-i18n'
import { Icon } from '@iconify/vue'
import { useUiStore } from '@/store/ui.js'
import { contactGroupList, contactGroupAdd, contactGroupUpdate, contactGroupDelete } from '@/request/contact-group.js'

defineOptions({ name: 'groups' })

const { t } = useI18n()
const uiStore = useUiStore()
const groupList = ref([])
const drawerShow = ref(false)
const groupLoading = ref(false)
const searchQuery = ref('')
const groupForm = reactive({ groupId: null, name: '', contacts: [] })

const totalContacts = computed(() => groupList.value.reduce((s, g) => s + g.contacts.length, 0))

const filteredGroups = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return groupList.value
  return groupList.value.filter(g =>
    (g.name || '').toLowerCase().includes(q) ||
    g.contacts.some(c => (c.name || '').toLowerCase().includes(q) || (c.email || '').toLowerCase().includes(q))
  )
})

onMounted(() => {
  contactGroupList().then(list => groupList.value = list).catch(() => {})
})

function addContact() { groupForm.contacts.push({ name: '', email: '' }) }
function removeContact(i) { groupForm.contacts.splice(i, 1) }

function openAdd() {
  Object.assign(groupForm, { groupId: null, name: '', contacts: [{ name: '', email: '' }] })
  drawerShow.value = true
}
function openEdit(g) {
  groupForm.groupId = g.groupId
  groupForm.name = g.name
  groupForm.contacts = g.contacts.map(c => ({ ...c }))
  drawerShow.value = true
}

async function saveGroup() {
  if (!groupForm.name.trim()) {
    ElMessage({ message: t('emptyUserNameMsg'), type: 'error', plain: true })
    return
  }
  const contacts = groupForm.contacts.filter(c => c.email.trim())
  groupLoading.value = true
  try {
    if (groupForm.groupId) {
      await contactGroupUpdate(groupForm.groupId, groupForm.name, contacts)
      const idx = groupList.value.findIndex(g => g.groupId === groupForm.groupId)
      if (idx > -1) groupList.value[idx] = { ...groupList.value[idx], name: groupForm.name, contacts }
    } else {
      const ng = await contactGroupAdd(groupForm.name, contacts)
      groupList.value.unshift(ng)
    }
    drawerShow.value = false
    ElMessage({ message: t('groupSaved'), type: 'success', plain: true })
  } finally { groupLoading.value = false }
}

function deleteGroup(g) {
  ElMessageBox.confirm(t('delConfirm', { msg: g.name }), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(async () => {
    try {
      await contactGroupDelete(g.groupId)
      groupList.value = groupList.value.filter(x => x.groupId !== g.groupId)
      ElMessage({ message: t('groupDeleted'), type: 'success', plain: true })
    } catch {}
  })
}

async function duplicateGroup(g) {
  try {
    const copy = await contactGroupAdd(g.name + t('duplicateSuffix'), g.contacts.map(c => ({ ...c })))
    groupList.value.unshift(copy)
    ElMessage({ message: t('groupDuplicated'), type: 'success', plain: true })
  } catch {}
}

function handleCommand(cmd, g) {
  if (cmd === 'edit') openEdit(g)
  else if (cmd === 'duplicate') duplicateGroup(g)
  else if (cmd === 'delete') deleteGroup(g)
}

// Sending to a group inserts every member as a recipient. Beyond a small
// count, addresses go into Bcc instead of To so members' emails aren't
// exposed to each other.
const BCC_THRESHOLD = 8

function sendToGroup(g) {
  const emails = [...new Set(g.contacts.map(c => c.email).filter(Boolean))]
  if (!emails.length) return
  const prefill = emails.length > BCC_THRESHOLD ? { bcc: emails } : { to: emails }
  uiStore.writerRef?.open?.(prefill)
  ElMessage({ message: t('recipientsAddedMsg', { count: emails.length }), type: 'success', plain: true })
}
</script>

<style lang="scss" scoped>
.page-outer {
  max-width: 1240px;
  margin: 0 auto;
  padding: 28px 32px 56px;

  @media (max-width: 960px)  { padding: 20px 24px 40px; }
  @media (max-width: 640px)  { padding: 16px 16px 32px; }
}

.space-y {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ── Page header ── */
.page-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--psg-border);
  flex-wrap: wrap;
}

.page-title {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  color: var(--psg-text);
}

.page-subtitle {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--psg-text-secondary);
}

.page-stats {
  margin: 8px 0 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--psg-text-secondary);
  font-variant-numeric: tabular-nums;
}

.create-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

/* ── Toolbar ── */
.header-actions {
  padding: 8px 12px;
  min-height: 44px;
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  align-items: center;
  background: var(--psg-surface);
  border-radius: var(--psg-radius-md);
  border: 1px solid var(--psg-border);

  :deep(.el-input__wrapper) {
    height: 30px;
    box-shadow: none !important;
    border: 1px solid var(--psg-border);
    border-radius: var(--psg-radius-sm);
    transition: border-color 0.12s;
    &:hover { border-color: var(--psg-border-strong); }
  }
  :deep(.el-input__wrapper.is-focus) {
    border-color: var(--psg-primary) !important;
  }

  .search-input {
    width: min(280px, calc(100vw - 200px));
    flex-shrink: 0;
  }
}

/* Empty state */
.empty-state {
  display: flex; flex-direction: column;
  align-items: flex-start; gap: 6px;
  padding: 40px 24px;
  background: var(--psg-surface);
  border: 1px solid var(--psg-border);
  border-radius: var(--psg-radius-md);
  max-width: 480px;
  margin: 8px auto 0;
  text-align: left;
}
.empty-icon { color: var(--psg-text-secondary); opacity: 0.4; }
.empty-title { font-size: 14.5px; font-weight: 700; color: var(--psg-text); }
.empty-desc  { font-size: 12.5px; color: var(--psg-text-secondary); line-height: 1.5; }
.empty-btn { margin-top: 10px; }

/* ── Card grid ── */
.grp-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
}

.grp-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: var(--psg-surface);
  border: 1px solid var(--psg-border);
  border-radius: var(--psg-radius-md);
  padding: 16px;
  transition: border-color 0.16s ease;

  @media (hover: hover) {
    &:hover { border-color: var(--psg-border-strong); }
  }
}

.grp-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.grp-head-left {
  display: flex; align-items: center;
  gap: 12px; flex: 1; min-width: 0;
}

.grp-avatar {
  width: 34px; height: 34px; border-radius: var(--psg-radius-sm);
  background: var(--psg-surface-muted);
  border: 1px solid var(--psg-border);
  color: var(--psg-text); font-size: 13px; font-weight: 800;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}

.grp-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; }

.grp-name {
  font-size: 14px; font-weight: 700;
  color: var(--psg-text);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

.grp-count { font-size: 11.5px; color: var(--psg-text-secondary); }

.more-btn {
  display: flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; flex-shrink: 0;
  border: none; background: transparent;
  border-radius: var(--psg-radius-sm); cursor: pointer;
  color: var(--psg-text-secondary);
  transition: background 0.10s, color 0.10s;
  &:hover { background: var(--psg-surface-muted); color: var(--psg-text); }
}

:deep(.danger-item) { color: var(--psg-danger) !important; }

/* Member preview */
.member-preview {
  display: flex; flex-direction: column; gap: 5px;
  padding: 10px 12px;
  background: var(--psg-canvas);
  border: 1px solid var(--psg-border);
  border-radius: var(--psg-radius-sm);
}

.member-preview-row {
  display: flex; align-items: center; gap: 8px;
  min-width: 0;
}

.dot {
  width: 5px; height: 5px; border-radius: 50%;
  background: var(--psg-text-muted);
  flex-shrink: 0;
}

.member-preview-text {
  font-size: 12.5px; color: var(--psg-text-secondary);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

.member-more {
  font-size: 11.5px; font-weight: 700;
  color: var(--psg-text-muted);
  padding-left: 13px;
}

.member-preview-empty {
  font-size: 12.5px; color: var(--psg-text-muted);
  padding: 10px 12px;
  background: var(--psg-canvas);
  border: 1px solid var(--psg-border);
  border-radius: var(--psg-radius-sm);
}

.grp-footer {
  display: flex; align-items: center; justify-content: space-between;
  gap: 8px;
  margin-top: auto;
  padding-top: 10px;
  border-top: 1px solid var(--psg-border);
}

.grp-action {
  display: inline-flex; align-items: center; gap: 5px;
  background: transparent; border: none; cursor: pointer;
  font-size: 12px; font-weight: 700;
  color: var(--psg-text-secondary); padding: 4px 0;
  font-family: inherit;
  transition: color 0.12s;
  &:hover { color: var(--psg-text); }
}

.send-btn {
  height: 30px; padding: 0 12px;
  font-size: 12px; font-weight: 700;
  border-radius: var(--psg-radius-sm) !important;
  :deep(svg) { margin-right: 5px; }

  /* Element Plus derives disabled-state colors from a primary-color ramp
     (light-5/7/8/9) that this app never remaps off the stock blue — only
     light-3 is overridden globally. Pin the disabled look to PSG neutrals
     directly rather than leaving it to fall through to that blue ramp. */
  &.is-disabled,
  &.is-disabled:hover {
    background: var(--psg-surface-active) !important;
    border-color: var(--psg-surface-active) !important;
    color: var(--psg-text-muted) !important;
  }
}

/* ── Drawer ── */
.drawer-body {
  display: flex; flex-direction: column; gap: 24px; padding: 4px 0 24px;
}

.drawer-field { display: flex; flex-direction: column; gap: 8px; }

.drawer-label {
  font-size: 10px; font-weight: 900;
  text-transform: uppercase; letter-spacing: 0.10em;
  color: var(--psg-text-secondary);
}

.members-head {
  display: flex; align-items: center; justify-content: space-between;
}

.add-member-btn {
  display: flex; align-items: center; gap: 4px;
  background: transparent;
  border: 1px solid var(--psg-border);
  border-radius: var(--psg-radius-sm); cursor: pointer;
  font-size: 12px; font-weight: 700;
  color: var(--psg-text-secondary); padding: 4px 10px;
  transition: border-color 0.12s, color 0.12s; font-family: inherit;
  &:hover { border-color: var(--psg-border-strong); color: var(--psg-text); }
}

.members-empty {
  font-size: 13px; color: var(--psg-text-secondary);
  padding: 12px 0; text-align: center;
}

.member-editor { display: flex; flex-direction: column; gap: 6px; margin-top: 2px; }

.editor-row {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 10px;
  border: 1px solid var(--psg-border);
  border-radius: var(--psg-radius-sm);
  background: var(--psg-canvas);
  transition: border-color 0.12s;
  &:focus-within { border-color: var(--psg-border-strong); }
}

.row-avatar {
  width: 28px; height: 28px; border-radius: var(--psg-radius-sm);
  background: var(--psg-surface-muted);
  border: 1px solid var(--psg-border);
  color: var(--psg-text); font-size: 11px; font-weight: 800;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}

.row-fields { flex: 1; display: flex; flex-direction: column; gap: 4px; min-width: 0; }

.no-border-input {
  :deep(.el-input__wrapper) {
    box-shadow: none !important; border: none !important;
    background: transparent; padding: 0 4px;
    &:hover, &.is-focus { box-shadow: none !important; }
  }
  :deep(.el-input__inner) { font-size: 12.5px; height: 22px; }
}

.mono-input {
  :deep(.el-input__inner) {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 12px; color: var(--psg-text-secondary);
  }
}

.remove-btn {
  display: flex; align-items: center; justify-content: center;
  width: 24px; height: 24px;
  border: none; background: transparent;
  border-radius: var(--psg-radius-sm); cursor: pointer;
  color: var(--psg-text-secondary); flex-shrink: 0;
  transition: background 0.10s, color 0.10s;
  &:hover { background: var(--psg-danger-muted); color: var(--psg-danger); }
}

.drawer-footer {
  display: flex; justify-content: flex-end; gap: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--psg-border);
}
</style>
