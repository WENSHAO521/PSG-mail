<template>
  <div class="tab-panel">
    <div class="toolbar">
      <div class="roles-count">{{ $t('rolesCountLabel', { n: roles.length }) }}</div>
      <Icon class="icon" icon="psg:refresh" width="18" height="18" @click="refresh"/>
    </div>

    <div class="cards-area">
      <div class="loading" :class="tableLoading ? 'loading-show' : 'loading-hide'"
           :style="first ? 'background: transparent' : ''">
        <loading/>
      </div>
      <EmptyState v-if="!tableLoading && !first && roles.length === 0"
                  icon="psg:lock" :title="$t('emptyRolesTitle')" :description="$t('emptyRolesDesc')"
                  :cta-text="$t('addRoleTitle')" @cta="openAddRole"/>
      <div class="role-grid" v-else>
        <div class="role-card" v-for="role in roles" :key="role.roleId">
          <div class="role-card-head">
            <div class="role-card-name">
              <span>{{ role.name }}</span>
              <StatusBadge v-if="role.isDefault" variant="pill" tone="success" :label="$t('default')"/>
            </div>
            <MoreMenu>
              <el-dropdown-item @click="openRoleSet(role)">{{ $t('editRole') }}</el-dropdown-item>
              <el-dropdown-item v-if="!role.isDefault" @click="setDef(role)">{{ $t('default') }}</el-dropdown-item>
              <el-tooltip v-if="role.isDefault" :content="$t('defaultRoleProtectedTooltip')" placement="left">
                <el-dropdown-item class="danger is-disabled" divided disabled>{{ $t('delete') }}</el-dropdown-item>
              </el-tooltip>
              <el-dropdown-item v-else class="danger" divided @click="delRole(role)">{{ $t('delete') }}</el-dropdown-item>
            </MoreMenu>
          </div>
          <p class="role-card-desc" v-if="role.description">{{ role.description }}</p>
          <div class="role-card-meta">
            <span>{{ $t('permissionsCountLabel', { n: (role.permIds || []).length }) }}</span>
            <span v-if="role.userCount != null"> · {{ $t('usersCountLabel', { n: role.userCount }) }}</span>
          </div>
        </div>
      </div>
    </div>

    <el-drawer v-model="roleFormShow" direction="rtl" size="min(420px, 100vw)"
               :close-on-click-modal="false" @closed="resetForm">
      <template #header>
        <span class="drawer-title">{{ dialogType.title }}</span>
        <el-popover width="340" :title="t('featDesc')" placement="bottom">
          <template #reference>
            <Icon class="warning" icon="psg:warning" width="18" height="18"/>
          </template>
          <div style="font-weight: bold;margin-bottom: 2px;">{{ t('emailInterception') }}</div>
          <div>{{ t('emailInterceptionDesc') }}</div>
          <div style="font-weight: bold;margin-top: 10px;margin-bottom: 2px;">{{ t('availableDomains') }}</div>
          <div>{{ t('availableDomainsDesc') }}</div>
        </el-popover>
      </template>
      <div class="drawer-body">
        <el-input class="dialog-input" v-model="form.name" type="text" :maxlength="12" :placeholder="$t('roleName')"
                  autocomplete="off"/>
        <el-input class="dialog-input" v-model="form.description" :maxlength="30" type="text"
                  :placeholder="$t('description')" autocomplete="off"/>
        <el-input-tag class="dialog-input" tag-type="warning" v-model="form.banEmail"
                      @add-tag="banEmailAddTag" type="text" :placeholder="$t('emailInterception')" autocomplete="off"/>
        <el-select
            class="dialog-input"
            v-model="form.availDomain"
            multiple
            filterable
            allow-create
            default-first-option
            :reserve-keyword="false"
            tag-type="success"
            :placeholder="$t('availableDomains')"
            @change="availDomainChange"
        >
          <el-option
              v-for="item in domainOptions"
              :key="item.value"
              :label="item.label"
              :value="item.value"
          />
        </el-select>
        <div class="dialog-input">
          <el-input-number :placeholder="$t('order')" :min="0" :max="9999" v-model.number="form.sort"
                           controls-position="right" autocomplete="off"/>
        </div>
        <el-radio-group v-model="expand" size="small" @change="expandChange" class="perm-expand">
          <el-radio-button :label="$t('expand')" :value="true"/>
          <el-radio-button :label="$t('collapse')" :value="false"/>
        </el-radio-group>
        <el-tree
            :expand-on-click-node="false"
            :check-on-click-node="false"
            ref="tree"
            :data="treeList"
            show-checkbox
            node-key="permId"
            :default-expand-all="expand"
            :props="{ label: 'name' }"
        >
          <template #default="{ node, data }">
            <div>
              <span>{{ node.label }}</span>
              <span class="send-num" v-if="data.permKey === 'email:send'" @click.stop>
                <el-input-number v-if="form.sendType === 'day' || form.sendType === 'count'" v-model="form.sendCount" controls-position="right" :min="0" :max="99999" size="small"
                                 :placeholder="$t('total')">
                </el-input-number>
                  <el-select v-model="form.sendType" placeholder="Select" size="small"
                             :style="`width: ${ locale === 'zh' ? 65 : 85 }px;margin-left: 5px;`">
                    <el-option :label="$t('total')" value="count"/>
                    <el-option :label="$t('daily')" value="day"/>
                    <el-option :label="$t('internal')" value="internal"/>
                    <el-option :label="$t('btnBan')" value="ban"/>
                  </el-select>
              </span>
              <span class="send-num" v-if="data.permKey === 'account:add'" @click.stop>
                <el-input-number v-model="form.accountCount" controls-position="right" :min="0" :max="99999"
                                 size="small" :placeholder="$t('total')">
                </el-input-number>
              </span>
            </div>
          </template>
        </el-tree>
      </div>
      <template #footer>
        <el-button @click="roleFormShow = false">{{ $t('cancel') }}</el-button>
        <el-button type="primary" :loading="permLoading" @click="roleFormClick">{{ $t('save') }}</el-button>
      </template>
    </el-drawer>
  </div>
</template>

<script setup>
import {Icon} from "@iconify/vue";
import {defineExpose, nextTick, reactive, ref} from "vue";
import {roleAdd, roleDelete, rolePermTree, roleRoleList, roleSet, roleSetDef} from "@/request/role.js";
import loading from '@/components/loading/index.vue';
import StatusBadge from "./components/StatusBadge.vue";
import MoreMenu from "./components/MoreMenu.vue";
import EmptyState from "./components/EmptyState.vue";
import {useRoleStore} from "@/store/role.js";
import {useUserStore} from "@/store/user.js";
import {useSettingStore} from "@/store/setting.js";
import {isEmail, isDomain} from "@/utils/verify-utils.js";
import {useI18n} from "vue-i18n";

const {domainList} = useSettingStore();
const {t, locale} = useI18n();
const userStore = useUserStore();
const roleStore = useRoleStore();
const roleFormShow = ref(false)
const treeList = reactive([])
const roles = ref([])
const tree = ref({})
const permLoading = ref(false)
const tableLoading = ref(false)
const first = ref(true)

const dialogType = reactive({
  title: '',
  type: ''
})

const form = reactive({
  name: null,
  description: null,
  banEmail: [],
  sendType: 'count',
  sendCount: 0,
  accountCount: 0,
  sort: 0,
  isDefault: 0,
  availDomain: []
})

let domainOptions = []

const expand = ref(false)

let chooseRole = {}

refresh()

rolePermTree().then(tree => {
  treeList.push(...tree)
})

domainOptions = domainList.map(domain => {
  const cleanDomain = domain.replace(/^@/, '');
  return {label: cleanDomain, value: cleanDomain};
});


function availDomainChange() {
  const index = form.availDomain.findIndex(domain => {
    return !domainOptions.map(option => option.value).includes(domain)
  })
  if (index > -1) {
    form.availDomain.splice(index, 1)
  }
}

function banEmailAddTag(val) {
  const emails = Array.from(new Set(
      val.split(/[,，]/).map(item => item.trim()).filter(item => item)
  ));

  form.banEmail.splice(form.banEmail.length - 1, 1)

  emails.forEach(email => {
    if ((isEmail(email) || isDomain(email) || email === '*') && !form.banEmail.includes(email)) {
      form.banEmail.push(email)
    }
  })
}


function roleFormClick() {
  if (dialogType.type === 'add') {
    addRole()
  } else {
    setRole()
  }
}

function setDef(role) {
  roleSetDef(role.roleId).then(() => {
    ElMessage({
      message: t('saveSuccessMsg'),
      type: "success",
      plain: true
    })
    getRoleList()
  })
}

function delRole(role) {
  if (role.isDefault) return
  ElMessageBox.confirm(t('delConfirm', {msg: role.name}), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('confirm'),
    type: 'warning'
  }).then(() => {
    roleDelete(role.roleId).then(() => {
      ElMessage({
        message: t('copySuccessMsg'),
        type: "success",
        plain: true
      })
      getRoleList()
      userStore.refreshUserList()
      roleStore.refreshSelect()
    })
  });
}

function expandChange(e) {
  if (e) {
    const nodes = tree.value?.store.nodesMap;
    for (const key in nodes) {
      nodes[key].expanded = true;
    }
  } else {
    const nodes = tree.value?.store.nodesMap;
    for (const key in nodes) {
      nodes[key].expanded = false;
    }
  }

}

function setRole() {

  if (!form.name) {
    ElMessage({
      message: t('emptyRoleNameMsg'),
      type: "error",
      plain: true
    })
    return
  }

  const params = {...form, roleId: chooseRole.roleId}
  const checkedId = tree.value.getCheckedKeys()
  const halfId = tree.value.getHalfCheckedKeys()
  params.permIds = [...checkedId, ...halfId]

  permLoading.value = true
  roleSet(params).then(() => {
    ElMessage({
      message: t('saveSuccessMsg'),
      type: "success",
      plain: true
    })

    const names = roles.value.map(role => role.name)

    if (!names.includes(params.name)) {
      roleStore.refreshSelect()
    }

    roleFormShow.value = false
    getRoleList()
  }).finally(() => {
    permLoading.value = false
  })
}

function resetForm() {
  form.name = null
  form.description = null
  form.sort = 0
  form.sendType = 'count'
  form.sendCount = 0
  form.accountCount = 0
  form.banEmail = []
  form.availDomain = []
  tree.value.setCheckedKeys([])
}

function openRoleSet(role) {
  chooseRole = role
  dialogType.title = t('changeRoleTitle')
  dialogType.type = 'set'
  roleFormShow.value = true
  form.sort = role.sort
  form.name = role.name
  form.description = role.description
  form.sendType = role.sendType
  form.sendCount = role.sendCount
  form.accountCount = role.accountCount
  form.banEmail = role.banEmail
  form.availDomain = role.availDomain
  nextTick(() => {
    tree.value.setCheckedKeys(role.permIds)
  })
}


function openAddRole() {
  dialogType.title = t('addRoleTitle')
  dialogType.type = 'add'
  roleFormShow.value = true
}

function addRole() {
  const params = {...form}
  const checkedId = tree.value.getCheckedKeys()
  const halfId = tree.value.getHalfCheckedKeys()
  params.permIds = [...checkedId, ...halfId]

  permLoading.value = true
  roleAdd(params).then(() => {
    ElMessage({
      message: t('addSuccessMsg'),
      type: "success",
      plain: true
    })
    roleFormShow.value = false
    getRoleList()
    roleStore.refreshSelect()
  }).finally(() => {
    permLoading.value = false
  })
}


function refresh() {
  tableLoading.value = true
  roles.value = []
  getRoleList()
}

function getRoleList() {
  roleRoleList().then(list => {
    roles.value = list
  }).finally(() => {
    tableLoading.value = false
    setTimeout(() => {
      first.value = false
    }, 200)
  })
}

defineExpose({ openCreate: openAddRole })
</script>
<style scoped lang="scss">

.tab-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.toolbar {
  padding: 0 12px;
  height: 44px;
  display: flex;
  align-items: center;
  gap: 4px;
  background: var(--psg-surface);
  border-radius: var(--psg-radius-md);
  border: 1px solid var(--psg-border);
  flex-shrink: 0;

  .roles-count {
    flex: 1;
    font-size: 13px;
    font-weight: 600;
    color: var(--psg-text-secondary);
  }

  .icon {
    cursor: pointer;
    color: var(--psg-text-muted);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border: 1px solid transparent;
    border-radius: var(--psg-radius-sm);
    flex-shrink: 0;
    transition: border-color 0.10s, color 0.10s, background 0.10s;

    @media (hover: hover) {
      &:hover {
        border-color: transparent;
        background: var(--psg-surface-active);
        color: var(--psg-text);
      }
    }
  }
}

.cards-area {
  position: relative;
  min-height: 140px;
}

.role-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 14px;
}

.role-card {
  background: var(--psg-surface);
  border: 1px solid var(--psg-border);
  border-radius: var(--psg-radius-md);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  transition: border-color 0.16s ease;

  @media (hover: hover) {
    &:hover { border-color: var(--psg-border-strong); }
  }
}

.role-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.role-card-name {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 700;
  color: var(--psg-text);
  min-width: 0;

  span:first-child {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

.role-card-desc {
  margin: 0;
  font-size: 13px;
  color: var(--psg-text-secondary);
  line-height: 1.5;
}

.role-card-meta {
  font-size: 12px;
  color: var(--psg-text-muted);
  font-weight: 600;
}

.warning {
  position: relative;
  left: 5px;
  top: 2px;
  color: var(--psg-text-muted);
  cursor: pointer;
}

.drawer-title { font-size: 18px; font-weight: 700; }

.drawer-body {
  .dialog-input { margin-bottom: 15px; }
}

.send-num {
  margin-left: 10px;

  .el-input-number {
    width: 95px;
  }
}

.perm-expand {
  margin-bottom: 5px;
  position: relative;
  bottom: 5px;
}

.loading {
  position: absolute;
  inset: 0;
  min-height: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--psg-surface);
  z-index: 2;
}

.loading-show {
  transition: all 200ms ease 200ms;
  opacity: 1;
}

.loading-hide {
  pointer-events: none;
  transition: all 200ms;
  opacity: 0;
}
</style>
