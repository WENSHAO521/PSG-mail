<template>
  <div class="page-outer">

    <div class="page-main-only">
        <!-- Toolbar -->
        <div class="list-toolbar">
          <div class="toolbar-stats">
            <span class="stat-item">
              <span class="stat-num">{{ groupList.length }}</span>
              <span class="stat-lbl">{{ $t('groupUnit') }}</span>
            </span>
            <span class="stat-sep">·</span>
            <span class="stat-item">
              <span class="stat-num">{{ totalContacts }}</span>
              <span class="stat-lbl">{{ $t('contactUnit') }}</span>
            </span>
          </div>
          <el-button class="add-btn" @click="openAdd">
            <Icon icon="solar:add-circle-linear" width="13" height="13"/>
            {{ $t('addGroup') }}
          </el-button>
        </div>

        <div v-if="!groupList.length" class="empty-state">
          <Icon icon="solar:users-group-rounded-linear" width="32" height="32" class="empty-icon"/>
          <div class="empty-title">{{ $t('noGroups') }}</div>
          <div class="empty-desc">{{ $t('noGroupsDesc') }}</div>
        </div>

        <div v-else class="group-list">
          <div class="group-card" v-for="g in groupList" :key="g.groupId">

            <div class="card-head" @click="toggleExpand(g.groupId)">
              <div class="card-left">
                <div class="group-avatar">{{ (g.name || '?')[0].toUpperCase() }}</div>
                <div class="card-info">
                  <div class="group-name">{{ g.name }}</div>
                  <div class="group-count">
                    {{ g.contacts.length }}&thinsp;{{ g.contacts.length === 1 ? $t('memberSingle') : $t('memberPlural') }}
                  </div>
                </div>
              </div>
              <div class="card-right" @click.stop>
                <div class="card-actions">
                  <button class="act-btn" :title="$t('change')" @click="openEdit(g)">
                    <Icon icon="solar:pen-linear" width="14" height="14"/>
                  </button>
                  <button class="act-btn danger" :title="$t('delete')" @click="deleteGroup(g.groupId)">
                    <Icon icon="solar:trash-bin-trash-linear" width="14" height="14"/>
                  </button>
                </div>
                <span class="chevron" :class="{ open: expandedIds.has(g.groupId) }">
                  <Icon icon="solar:alt-arrow-down-linear" width="13" height="13"/>
                </span>
              </div>
            </div>

            <transition name="slide">
              <div v-if="expandedIds.has(g.groupId)" class="member-list">
                <div v-if="!g.contacts.length" class="member-empty">{{ $t('noContacts') }}</div>
                <div class="member-row" v-for="(c, i) in g.contacts" :key="i">
                  <div class="member-dot">{{ (c.name || c.email || '?')[0].toUpperCase() }}</div>
                  <div class="member-info">
                    <span class="member-name" v-if="c.name">{{ c.name }}</span>
                    <span class="member-email" :class="{ solo: !c.name }">{{ c.email }}</span>
                  </div>
                </div>
              </div>
            </transition>

          </div>
        </div>
      </div>

    <!-- Drawer -->
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
              <Icon icon="solar:add-circle-linear" width="12" height="12"/>
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
                <Icon icon="solar:close-circle-linear" width="13" height="13"/>
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
import { contactGroupList, contactGroupAdd, contactGroupUpdate, contactGroupDelete } from '@/request/contact-group.js'

defineOptions({ name: 'groups' })

const { t } = useI18n()
const groupList = ref([])
const drawerShow = ref(false)
const groupLoading = ref(false)
const expandedIds = ref(new Set())
const groupForm = reactive({ groupId: null, name: '', contacts: [] })

const totalContacts = computed(() => groupList.value.reduce((s, g) => s + g.contacts.length, 0))

onMounted(() => {
  contactGroupList().then(list => groupList.value = list).catch(() => {})
})

function toggleExpand(groupId) {
  if (expandedIds.value.has(groupId)) expandedIds.value.delete(groupId)
  else expandedIds.value.add(groupId)
  expandedIds.value = new Set(expandedIds.value)
}

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

async function deleteGroup(groupId) {
  try {
    await contactGroupDelete(groupId)
    groupList.value = groupList.value.filter(g => g.groupId !== groupId)
    expandedIds.value.delete(groupId)
    expandedIds.value = new Set(expandedIds.value)
    ElMessage({ message: t('groupDeleted'), type: 'success', plain: true })
  } catch {}
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

/* Full-width main (no sidebar) */
.page-main-only {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 900px;
}

.page-main { display: flex; flex-direction: column; gap: 16px; }

.list-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 16px;
  background: var(--psg-surface);
  border-radius: var(--psg-radius-md);
  border: 1px solid var(--psg-border);
  min-height: 52px;
}

.toolbar-stats {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.stat-item {
  display: flex;
  align-items: baseline;
  gap: 4px;
}

.stat-num {
  font-size: 22px;
  font-weight: 900;
  letter-spacing: -0.04em;
  color: var(--psg-text);
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

.stat-lbl {
  font-size: 11px;
  color: var(--psg-text-secondary);
  font-weight: 500;
}

.stat-sep {
  font-size: 16px;
  color: var(--psg-border);
  font-weight: 300;
  line-height: 1;
}

.add-btn {
  font-size: 13px; font-weight: 600;
  height: 34px; padding: 0 14px;
  border-radius: var(--psg-radius-sm) !important;
  flex-shrink: 0;

  :deep(svg) { margin-right: 6px; }
}

.empty-state {
  display: flex; flex-direction: column;
  align-items: flex-start; gap: 6px; padding: 32px 0;
}
.empty-icon { color: var(--psg-text-secondary); opacity: 0.35; }
.empty-title { font-size: 14px; font-weight: 700; color: var(--psg-text); }
.empty-desc  { font-size: 12.5px; color: var(--psg-text-secondary); }

/* Group list */
.group-list {
  background: var(--psg-surface);
  border-radius: var(--psg-radius-md);
  border: 1px solid var(--psg-border);
  overflow: hidden;
}

.group-card {
  border-bottom: 1px solid var(--psg-border);
  &:last-child { border-bottom: none; }
}

.card-head {
  display: flex; align-items: center;
  justify-content: space-between;
  padding: 13px 16px; cursor: pointer;
  transition: background 0.12s ease;

  @media (hover: hover) {
    .card-actions { opacity: 0; }
    &:hover {
      background: var(--psg-surface-muted);
      .card-actions { opacity: 1; }
    }
  }

  @media (max-width: 480px) {
    padding: 10px 12px;
  }
}

.card-left {
  display: flex; align-items: center;
  gap: 12px; flex: 1; min-width: 0;
}

.group-avatar {
  width: 32px; height: 32px; border-radius: var(--psg-radius-sm);
  background: var(--psg-surface-muted);
  border: 1px solid var(--psg-border);
  color: var(--psg-text); font-size: 13px; font-weight: 800;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}

.card-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; }

.group-name {
  font-size: 13.5px; font-weight: 700;
  color: var(--psg-text);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

.group-count { font-size: 11.5px; color: var(--psg-text-secondary); }

.card-right {
  display: flex; align-items: center; gap: 2px;
  flex-shrink: 0; margin-left: 12px;
}

.card-actions {
  display: flex; gap: 2px; flex-shrink: 0;
  transition: opacity 0.14s;
}

.act-btn {
  display: flex; align-items: center; justify-content: center;
  min-width: 32px; height: 32px;
  border: none; background: transparent;
  border-radius: var(--psg-radius-sm); cursor: pointer;
  color: var(--psg-text-secondary);
  transition: background 0.10s, color 0.10s;

  &:hover { background: var(--psg-surface-muted); color: var(--psg-text); }
  &.danger:hover { background: var(--psg-danger-muted); color: var(--psg-danger); }
}

.chevron {
  display: flex; align-items: center; justify-content: center;
  width: 22px; height: 22px;
  color: var(--psg-text-secondary);
  transition: transform 0.20s cubic-bezier(0.22,1,0.36,1);
  &.open { transform: rotate(180deg); }
}

/* Expanded members */
.member-list {
  padding: 8px 16px 12px 62px;
  display: flex; flex-direction: column; gap: 2px;
  border-top: 1px solid var(--psg-border);
  background: var(--psg-canvas);
}

.member-empty { font-size: 12.5px; color: var(--psg-text-secondary); padding: 4px 0; }

.member-row { display: flex; align-items: center; gap: 10px; padding: 4px 0; }

.member-dot {
  width: 24px; height: 24px; border-radius: var(--psg-radius-sm);
  background: var(--psg-surface-muted);
  border: 1px solid var(--psg-border);
  color: var(--psg-text-secondary); font-size: 9.5px; font-weight: 800;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}

.member-info { display: flex; align-items: baseline; gap: 8px; min-width: 0; }

.member-name {
  font-size: 12.5px; font-weight: 600;
  color: var(--psg-text);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  flex-shrink: 0;
}

.member-email {
  font-size: 11.5px; font-family: 'IBM Plex Mono', monospace;
  color: var(--psg-text-secondary);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  &.solo { font-size: 13px; }
}

.slide-enter-active { transition: opacity 0.20s ease, transform 0.20s ease; }
.slide-leave-active { transition: opacity 0.14s ease, transform 0.14s ease; }
.slide-enter-from { opacity: 0; transform: translateY(-5px); }
.slide-leave-to   { opacity: 0; transform: translateY(-3px); }

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
  &:hover { border-color: var(--psg-border); color: var(--psg-text); }
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
