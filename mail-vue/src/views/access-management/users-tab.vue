<template>
  <div class="tab-panel">
    <div class="toolbar">
      <div class="search">
        <el-input
            v-model="params.email"
            class="search-input"
            :placeholder="$t('searchByEmail')"
            @keyup.enter="search"
        >
        </el-input>
      </div>
      <el-select v-model="params.status" placeholder="Select" class="status-select"
                 :style="`width: ${locale === 'en' ? 95 : 80 }px`" @change="search">
        <el-option :key="-1" :label="$t('all')" :value="-1"/>
        <el-option :key="0" :label="$t('active')" :value="0"/>
        <el-option :key="1" :label="$t('banned')" :value="1"/>
        <el-option :key="-2" :label="$t('deleted')" :value="-2"/>
      </el-select>
      <Icon class="icon" @click="changeTimeSort" icon="psg:sort"
            v-if="params.timeSort === 1" width="20" height="20"/>
      <Icon class="icon" @click="changeTimeSort" icon="psg:sort" v-else width="20"
            height="20" style="transform: scaleY(-1)"/>
      <Icon class="icon" icon="psg:refresh" width="18" height="18" @click="refresh"/>
    </div>

    <transition name="fade">
      <div class="selection-bar" v-if="selectedRows.length">
        <span>{{ selectedRows.length }}</span>
        <el-button size="small" type="danger" plain @click="delUser">
          {{ $t('deleteSelected', { n: selectedRows.length }) }}
        </el-button>
      </div>
    </transition>

    <div class="table-card" v-if="!isCardView">
      <div class="loading" :class="tableLoading ? 'loading-show' : 'loading-hide'"
           :style="first ? 'background: transparent' : ''">
        <loading/>
      </div>
      <EmptyState v-if="!tableLoading && loadError" class="empty-slot"
                  icon="psg:warning" :title="$t('loadFailedUsers')" :cta-text="$t('retry')" @cta="refresh"/>
      <EmptyState v-else-if="!tableLoading && !first && users.length === 0 && !hasFilters" class="empty-slot"
                  icon="psg:group" :title="$t('emptyUsersTitle')" :description="$t('emptyUsersDesc')"
                  :cta-text="$t('addUser')" @cta="openAdd"/>
      <EmptyState v-else-if="!tableLoading && !first && users.length === 0" class="empty-slot"
                  icon="psg:search" :title="$t('searchEmptyTitle')" :cta-text="$t('clearFilters')" @cta="clearFilters"/>
      <el-table
          v-else
          :data="users"
          :preserve-expanded-content="preserveExpanded"
          style="width: 100%;"
          ref="tableRef"
          @cell-contextmenu="handleContextmenu"
          @selection-change="onSelectionChange"
          :cell-class-name="cellClassName"
      >
        <el-table-column width="40" type="selection" :selectable="row => row.type !== 0"/>
        <el-table-column :label="$t('user')" :min-width="220" show-overflow-tooltip :tooltip-formatter="tableRowFormatter">
          <template #default="props">
            <div class="user-cell">
              <div class="user-avatar" :style="{ background: avatarBg(props.row.email) }">
                {{ avatarLetter(props.row.accountName || props.row.oauthName, props.row.email) }}
              </div>
              <div class="user-cell-text">
                <div class="user-cell-name">{{ props.row.accountName || props.row.oauthName || props.row.email }}</div>
                <div class="user-cell-email">{{ props.row.email }}</div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column v-if="statusShow" min-width="90px" :label="$t('tabStatus')">
          <template #default="props">
            <StatusBadge v-if="props.row.isDel === 1" tone="neutral" :label="$t('deleted')"/>
            <StatusBadge v-else-if="props.row.status === 0" tone="success" :label="$t('active')"/>
            <StatusBadge v-else-if="props.row.status === 1" tone="danger" :label="$t('banned')"/>
          </template>
        </el-table-column>
        <el-table-column :label="$t('tabReceived')" prop="receiveEmailCount" min-width="80"/>
        <el-table-column v-if="sendNumShow" :label="$t('tabSent')" prop="sendEmailCount" min-width="80"/>
        <el-table-column v-if="accountNumShow" :label="$t('tabMailboxes')" prop="accountCount" min-width="90"/>
        <el-table-column v-if="typeShow" :label="$t('roleLabel')" min-width="140">
          <template #default="props">
            <StatusBadge variant="pill" :tone="props.row.type === 0 ? 'success' : 'neutral'"
                          :label="toRoleName(props.row.type)"/>
          </template>
        </el-table-column>
        <el-table-column :label="$t('action')" width="60">
          <template #default="props">
            <MoreMenu v-if="!(props.row.type === 0 && userStore.user.type !== 0)">
              <el-dropdown-item @click="openDetails(props.row)">{{ $t('details') }}</el-dropdown-item>
              <el-dropdown-item @click="openSetName(props.row)">{{ $t('setUsername') }}</el-dropdown-item>
              <el-dropdown-item @click="openSetPwd(props.row)">{{ $t('chgPwd') }}</el-dropdown-item>
              <el-dropdown-item @click="openSetType(props.row)">{{ $t('perm') }}</el-dropdown-item>
              <el-dropdown-item @click="openAccountList(props.row.userId)">{{ $t('account') }}</el-dropdown-item>
              <template v-if="props.row.type !== 0">
                <el-dropdown-item v-if="props.row.isDel !== 1" @click="setStatus(props.row)" divided>
                  {{ setStatusName(props.row) }}
                </el-dropdown-item>
                <el-dropdown-item v-else @click="restore(props.row)" divided>{{ $t('restore') }}</el-dropdown-item>
                <el-dropdown-item class="danger" @click="delOneUser(props.row)">{{ $t('adminDeleteUser') }}</el-dropdown-item>
              </template>
            </MoreMenu>
          </template>
        </el-table-column>
      </el-table>
    </div><!-- /table-card -->

    <div class="card-list" v-else>
      <div class="loading" :class="tableLoading ? 'loading-show' : 'loading-hide'"
           :style="first ? 'background: transparent' : ''">
        <loading/>
      </div>
      <EmptyState v-if="!tableLoading && loadError"
                  icon="psg:warning" :title="$t('loadFailedUsers')" :cta-text="$t('retry')" @cta="refresh"/>
      <EmptyState v-else-if="!tableLoading && !first && users.length === 0 && !hasFilters"
                  icon="psg:group" :title="$t('emptyUsersTitle')" :description="$t('emptyUsersDesc')"
                  :cta-text="$t('addUser')" @cta="openAdd"/>
      <EmptyState v-else-if="!tableLoading && !first && users.length === 0"
                  icon="psg:search" :title="$t('searchEmptyTitle')" :cta-text="$t('clearFilters')" @cta="clearFilters"/>
      <div class="user-card" v-for="row in users" :key="row.userId">
        <div class="user-card-head">
          <div class="user-avatar" :style="{ background: avatarBg(row.email) }">
            {{ avatarLetter(row.accountName || row.oauthName, row.email) }}
          </div>
          <div class="user-cell-text">
            <div class="user-cell-name">{{ row.accountName || row.oauthName || row.email }}</div>
            <div class="user-cell-email">{{ row.email }}</div>
          </div>
          <MoreMenu v-if="!(row.type === 0 && userStore.user.type !== 0)" aria-label="User actions">
            <el-dropdown-item @click="openDetails(row)">{{ $t('details') }}</el-dropdown-item>
            <el-dropdown-item @click="openSetName(row)">{{ $t('setUsername') }}</el-dropdown-item>
            <el-dropdown-item @click="openSetPwd(row)">{{ $t('chgPwd') }}</el-dropdown-item>
            <el-dropdown-item @click="openSetType(row)">{{ $t('perm') }}</el-dropdown-item>
            <el-dropdown-item @click="openAccountList(row.userId)">{{ $t('account') }}</el-dropdown-item>
            <template v-if="row.type !== 0">
              <el-dropdown-item v-if="row.isDel !== 1" @click="setStatus(row)" divided>{{ setStatusName(row) }}</el-dropdown-item>
              <el-dropdown-item v-else @click="restore(row)" divided>{{ $t('restore') }}</el-dropdown-item>
              <el-dropdown-item class="danger" @click="delOneUser(row)">{{ $t('adminDeleteUser') }}</el-dropdown-item>
            </template>
          </MoreMenu>
        </div>
        <div class="user-card-badges">
          <StatusBadge v-if="row.isDel === 1" tone="neutral" :label="$t('deleted')"/>
          <StatusBadge v-else-if="row.status === 0" tone="success" :label="$t('active')"/>
          <StatusBadge v-else-if="row.status === 1" tone="danger" :label="$t('banned')"/>
          <StatusBadge variant="pill" :tone="row.type === 0 ? 'success' : 'neutral'" :label="toRoleName(row.type)"/>
        </div>
        <div class="user-card-stats">
          <span>{{ $t('tabReceived') }} {{ row.receiveEmailCount }}</span>
          <span>{{ $t('tabSent') }} {{ row.sendEmailCount }}</span>
          <span>{{ $t('tabMailboxes') }} {{ row.accountCount }}</span>
        </div>
      </div>
    </div><!-- /card-list -->

    <div class="pagination" v-if="total > 10">
      <el-pagination
          :size="pageSize"
          :current-page="params.num"
          :page-size="params.size"
          :pager-count="pagerCount"
          :page-sizes="[10, 15, 20, 25, 30, 50]"
          background
          :layout="layout"
          :total="total"
          @size-change="sizeChange"
          @current-change="numChange"
      />
      <el-pagination
          v-if="phonePageShow"
          :size="pageSize"
          :current-page="params.num"
          :page-size="params.size"
          :pager-count="pagerCount"
          :page-sizes="[10, 15, 20, 25, 30, 50]"
          background
          layout="sizes, total"
          :total="total"
          @size-change="sizeChange"
          @current-change="numChange"
      />
    </div>

    <!-- dialogs -->
    <el-dialog class="dialog" v-model="setPwdShow" :title="$t('changePassword')" width="min(400px, calc(100vw - 32px))" @closed="resetUserForm">
      <div class="dialog-box">
        <el-input v-model="userForm.password" type="password" :placeholder="$t('newPassword')" autocomplete="off">
        </el-input>
        <el-button class="btn" type="primary" :loading="settingLoading" @click="updatePwd"
        >{{ $t('save') }}
        </el-button>
      </div>
    </el-dialog>
    <el-dialog class="dialog" v-model="setNameShow" :title="$t('setUsername')" width="min(400px, calc(100vw - 32px))">
      <div class="dialog-box">
        <el-input v-model="setNameValue" :placeholder="$t('username')" autocomplete="off" maxlength="30" show-word-limit @keydown.enter="submitSetName"/>
        <el-button class="btn" type="primary" :loading="setNameLoading" @click="submitSetName">{{ $t('save') }}</el-button>
      </div>
    </el-dialog>
    <el-dialog class="dialog" v-model="setTypeShow" :title="$t('changePerm')" width="min(400px, calc(100vw - 32px))" @closed="resetUserForm">
      <div class="dialog-box">
        <el-input disabled :model-value="$t('admin')" v-if="userForm.type === 0"/>
        <el-select v-else v-model="userForm.type" placeholder="Select">
          <el-option v-for="item in roleList" :label="item.name" :value="item.roleId" :key="item.roleId"/>
        </el-select>
        <el-button :disabled="userForm.type === 0" class="btn" :loading="settingLoading" type="primary" @click="setType"
        >{{ $t('save') }}
        </el-button>
      </div>
    </el-dialog>
    <el-dialog v-model="showAdd" :title="$t('addUser')" width="min(400px, calc(100vw - 32px))">
      <div class="container">
        <el-input v-model="addForm.email" type="text" :placeholder="$t('emailAccount')" autocomplete="off">
          <template #append>
            <div @click.stop="openSelect">
              <el-select
                  ref="mySelect"
                  v-model="addForm.suffix"
                  :placeholder="$t('select')"
                  class="select"
              >
                <el-option
                    v-for="item in domainList"
                    :key="item"
                    :label="item"
                    :value="item"
                />
              </el-select>
              <div>
                <span>{{ addForm.suffix }}</span>
                <Icon class="setting-icon" icon="psg:chevron-down" width="20" height="20"/>
              </div>
            </div>
          </template>
        </el-input>
        <el-input type="password" v-model="addForm.password" :placeholder="$t('password')"/>
        <el-select v-model="addForm.type" :placeholder="$t('perm')">
          <el-option v-for="item in roleList" :label="item.name" :value="item.roleId" :key="item.roleId"/>
        </el-select>
        <el-button class="btn" type="primary" @click="submit" :loading="addLoading"
        >{{ $t('add') }}
        </el-button>
      </div>
    </el-dialog>
    <el-dialog class="account-dialog" v-model="accountShow" :title="t('userAccount')" @closed="resetAccountList" >
      <el-table :data="accountList" style="height: 480px" v-loading="accountLoading" element-loading-background="transparent" :empty-text="accountLoading ? '' : null">
        <el-table-column property="email" :label="t('emailAccount')" >
          <template #default="props">
            <div class="email-row">{{ props.row.email }}</div>
          </template>
        </el-table-column>
        <el-table-column property="address" :label="t('tabStatus')"  :width="locale === 'en' ? 75 : 65" >
          <template #default="props">
            <el-tag type="primary" disable-transitions v-if="props.row.isDel === 0">{{$t('active')}}</el-tag>
            <el-tag type="info" disable-transitions v-if="props.row.isDel === 1">{{$t('deleted')}}</el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('action')" :width="locale === 'en' ? 75 : 65" >
          <template #default="props">
            <el-dropdown trigger="click">
              <el-button type="primary" size="small">{{t('action')}}</el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item @click="deleteAccount(props.row)">{{ $t('delete') }}</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </template>
        </el-table-column>
      </el-table>
      <div class="account-pagination">
        <el-pagination
            :disabled="accountLoading"
            background

            layout="prev, pager, next"
            :pager-count="3"
            :total="accountParams.total"
            @current-change="accountCurChange"
        />
      </div>
    </el-dialog>
    <el-dialog class="account-dialog" v-model="detailsShow" :title="t('userDetails')"  >
      <div class="details">
        <div v-if="userDetails.username"><span class="details-item-title">LinuxDo:</span>
          <el-avatar :src="userDetails.avatar" :size="30" class="linuxdo-avatar"  />
          <span style="margin: 0 10px">{{ $t('username') }}：{{userDetails.username}}</span>
          <span>
                    {{ $t('trustLevel') }}：<el-tag type="success">{{userDetails.trustLevel}}</el-tag>
                  </span>
        </div>
        <div v-if="!sendNumShow"><span
            class="details-item-title">{{ $t('tabSent') }}:</span>{{ userDetails.sendEmailCount }}
        </div>
        <div v-if="!accountNumShow"><span class="details-item-title">{{ $t('tabMailboxes') }}:</span>{{
            userDetails.accountCount
          }}
        </div>
        <div><span class="details-item-title">{{ $t('tabRegisteredAt') }}:</span>{{
            tzDayjs(userDetails.createTime).format('YYYY-MM-DD HH:mm')
          }}
        </div>
        <div v-if="!typeShow"><span class="details-item-title">{{ $t('perm') }}:</span>
          {{ toRoleName(userDetails.type) }}
        </div>
        <div v-if="!statusShow">
          <span class="details-item-title">{{ $t('tabStatus') }}:</span>
          <el-tag disable-transitions v-if="userDetails.isDel === 1" type="info">{{ $t('deleted') }}</el-tag>
          <el-tag disable-transitions v-else-if="userDetails.status === 0" type="primary">{{ $t('active') }}
          </el-tag>
          <el-tag disable-transitions v-else-if="userDetails.status === 1" type="danger">{{ $t('banned') }}
          </el-tag>
        </div>
        <div><span class="details-item-title">{{ $t('registrationIp') }}:</span>{{
            userDetails.createIp || $t('unknown')
          }}
        </div>
        <div><span class="details-item-title">{{ $t('recentIP') }}:</span>{{
            userDetails.activeIp || $t('unknown')
          }}
        </div>
        <div><span class="details-item-title">{{ $t('recentActivity') }}:</span>{{
            userDetails.activeTime ? tzDayjs(userDetails.activeTime).format('YYYY-MM-DD') : $t('unknown')
          }}
        </div>
        <div><span
            class="details-item-title">{{ $t('loginDevice') }}:</span>{{ userDetails.device || $t('unknown') }}
        </div>
        <div><span class="details-item-title">{{ $t('loginSystem') }}:</span>{{ userDetails.os || $t('unknown') }}
        </div>
        <div><span
            class="details-item-title">{{ $t('browserLogin') }}:</span>{{ userDetails.browser || $t('unknown') }}
        </div>
        <div>
          <span class="details-item-title">{{ $t('sendEmail') }}:</span>
          <span>{{ formatSendCount(userDetails) }}</span>
          <el-tag style="margin-left: 10px" v-if="userDetails.sendAction.hasPerm">
            {{ formatSendType(userDetails) }}
          </el-tag>
          <el-button size="small" style="margin-left: 10px"
                     v-if="userDetails.sendAction.hasPerm && userDetails.sendAction.sendCount"
                     @click="resetSendCount(userDetails)" type="primary">{{ $t('reset') }}
          </el-button>
        </div>
      </div>
    </el-dialog>
    <el-dropdown
        :show-timeout="0"
        :hide-timeout="0"
        ref="dropdownRef"
        @visible-change="visibleChange"
        :virtual-ref="triggerRef"
        :show-arrow="false"
        :popper-options="{
      modifiers: [{ name: 'offset', options: { offset: [0, 0] } }],
    }"
        virtual-triggering
        trigger="contextmenu"
        placement="bottom-start"
    >
      <template #dropdown>
        <el-dropdown-menu>
          <el-dropdown-item @click="openDetails(rightClickUser)">
            <div class="right-dropdown-item">
              <Icon icon="psg:user" width="20" height="20"/>
              <span>{{ t('userDetails') }}</span>
            </div>
          </el-dropdown-item>
          <el-dropdown-item @click="openSetName(rightClickUser)">
            <div class="right-dropdown-item">
              <icon icon="psg:user" width="21" height="21" />
              <span>{{ t('setUsername') }}</span>
            </div>
          </el-dropdown-item>
          <el-dropdown-item @click="openSetPwd(rightClickUser)">
            <div class="right-dropdown-item">
              <icon icon="solar:fingerprint-bold-duotone" width="22" height="22" />
              <span>{{t('changePassword')}}</span>
            </div>
          </el-dropdown-item>
          <el-dropdown-item @click="openSetType(rightClickUser)">
            <div class="right-dropdown-item">
              <icon icon="psg:lock" width="21" height="21" />
              <span>{{ t('setRole') }}</span>
            </div>
          </el-dropdown-item>
          <el-dropdown-item @click="openAccountList(rightClickUser.userId)" >
            <div class="right-dropdown-item" >
              <Icon icon="psg:mail" width="20" height="20" />
              <span>{{ t('userEmail') }}</span>
            </div>
          </el-dropdown-item>
          <el-dropdown-item v-if="rightClickUser.type !== 0" divided>
            <div class="right-dropdown-item" v-if="rightClickUser.isDel !== 1" @click="setStatus(rightClickUser)" >
              <Icon icon="psg:refresh" v-if="rightClickUser.status" width="19" height="19" />
              <Icon icon="psg:shield" v-else width="19" height="19" />
              <span>{{ setRightStatusName(rightClickUser) }}</span>
            </div>
            <div class="right-dropdown-item" v-else @click="restore(rightClickUser)">
              <Icon icon="psg:refresh" width="19" height="19" />
              <span>{{ t('restoreUser') }}</span>
            </div>
          </el-dropdown-item>
          <el-dropdown-item v-if="rightClickUser.type !== 0" class="danger" @click="delOneUser(rightClickUser)" >
            <div class="right-dropdown-item" >
              <Icon icon="psg:trash" width="18" height="18" />
              <span>{{ t('adminDeleteUser') }}</span>
            </div>
          </el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>
  </div>
</template>

<script setup>
import {defineExpose, h, onMounted, onUnmounted, reactive, ref, watch} from 'vue'
import {
  userList,
  userDelete,
  userSetPwd,
  userSetStatus,
  userSetType,
  userAdd,
  userRestSendCount,
  userRestore,
  userDeleteAccount,
  userAllAccount,
  userSetName
} from '@/request/user.js'
import {roleSelectUse} from "@/request/role.js";
import {Icon} from "@iconify/vue";
import loading from "@/components/loading/index.vue";
import StatusBadge from "./components/StatusBadge.vue";
import MoreMenu from "./components/MoreMenu.vue";
import EmptyState from "./components/EmptyState.vue";
import {tzDayjs} from "@/utils/day.js";
import {avatarBg, avatarLetter} from "@/utils/avatar.js";
import {useSettingStore} from "@/store/setting.js";
import {isEmail} from "@/utils/verify-utils.js";
import {useRoleStore} from "@/store/role.js";
import {useUserStore} from "@/store/user.js";
import {useI18n} from 'vue-i18n';

const {t, locale} = useI18n();
const roleStore = useRoleStore()
const userStore = useUserStore()
const settingStore = useSettingStore()
const preserveExpanded = ref(false)
const sendNumShow = ref(true)
const accountNumShow = ref(true)
const statusShow = ref(true)
const typeShow = ref(true)
const phonePageShow = ref(false)
const isCardView = ref(false)
const detailsShow = ref(false);
const layout = ref('prev, pager, next,  sizes, total')
const pageSize = ref('')
const users = ref([])
const tableRef = ref({})
const userDetails = ref({})
const total = ref(0)
const first = ref(true)
const accountLoading = ref(false)
const dropdownRef = ref(null);
const dropdownShow = ref(false);
const rightClickUser = ref({});
const selectedRows = ref([])
const position = ref(
    DOMRect.fromRect({
      x: 0,
      y: 0,
    })
)

const triggerRef = ref({
  getBoundingClientRect() {
    return position.value;
  }
})
const domainList = settingStore.domainList

const addForm = reactive({
  email: '',
  suffix: settingStore.domainList[0],
  password: '',
  type: null,
})

const params = reactive({
  email: '',
  num: 1,
  size: 15,
  timeSort: 0,
  status: -1
})
let chooseUser = {}
const userForm = reactive({
  password: null,
  type: -1,
  userId: 0,
})

const showAdd = ref(false)
const accountShow = ref(false)
const addLoading = ref(false);
const setTypeShow = ref(false)
const setPwdShow = ref(false)
const setNameShow = ref(false)
const setNameValue = ref('')
const setNameUserId = ref(0)
const setNameLoading = ref(false)
const pagerCount = ref(10)
const settingLoading = ref(false)
const tableLoading = ref(true)
const roleList = reactive([])
const mySelect = ref({})
const accountList = reactive([])
const accountParams = reactive({
  size: 10,
  num: 0,
  total: 0,
  userId: 0,
})

const hasFilters = ref(false)
const loadError = ref(false)

roleSelectUse().then(list => {
  roleList.length = 0
  roleList.push(...list)
})

const paramsStar = localStorage.getItem('user-params')
if (paramsStar) {
  const localParams = JSON.parse(paramsStar)
  params.num = localParams.num
  params.size = localParams.size
  params.timeSort = localParams.timeSort
  params.status = localParams.status
}

watch(() => params, () => {
  localStorage.setItem('user-params', JSON.stringify(params))
  hasFilters.value = !!params.email || params.status !== -1
}, {
  deep: true
})

watch(() => roleStore.refresh, () => {
  roleSelectUse().then(list => {
    roleList.length = 0
    roleList.push(...list)
  })
})

watch(() => userStore.refreshList, () => {
  getUserList(false)
})

getUserList()

function onSelectionChange(rows) {
  selectedRows.value = rows
}

const onWheel = () => { if (dropdownShow.value) dropdownRef.value.handleClose() }

function visibleChange(e) {
  dropdownShow.value = e;
  if (!e) {
    rightClickUser.value.checkedClass = '';
  }
}

function cellClassName({ row }) {
  return row.checkedClass;
}

const handleContextmenu = (row, column, cell, event) => {

  if (row.type === 0 && userStore.user.type !== 0) {
    return
  }

  rightClickUser.value.checkedClass = '';

  const { clientX, clientY } = event
  position.value = DOMRect.fromRect({
    x: clientX,
    y: clientY,
  })
  event.preventDefault()
  dropdownRef.value?.handleOpen()

  row.checkedClass = 'checked-row';
  rightClickUser.value = row;
}

function deleteAccount(account) {
  ElMessageBox.confirm(t('delConfirm', {msg: account.email}), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {
    userDeleteAccount(account.accountId).then(() => {
      getAccountList()
      ElMessage({
        message: t('delSuccessMsg'),
        type: "success",
        plain: true
      })
    })
  });
}
function accountCurChange(e) {
  accountParams.num = e
  getAccountList()
}

function resetAccountList() {
  accountList.length = 0
  accountParams.num = 0
  accountParams.size = 10
  accountParams.total = 0
}

function openAccountList(userId) {
  accountParams.userId = userId
  getAccountList(true)
  accountShow.value = true
}

function openDetails(user) {
  userDetails.value = user;
  detailsShow.value = true;
}

function getAccountList(loading = false) {
  accountLoading.value = loading
  userAllAccount(accountParams.userId, accountParams.num, accountParams.size)
    .then(({ list, total }) => {
      accountList.length = 0
      accountList.push(...list)
      accountParams.total = total
    })
    .finally(() => {
      accountLoading.value = false
    })
}

function setStatusName(user) {
  if (user.isDel === 1) return t('restore')
  if (user.status === 0) return t('btnBan')
  if (user.status === 1) return t('enable')
}

function setRightStatusName(user) {
  if (user.isDel === 1) return t('adminDeleteUser')
  if (user.status === 0) return t('banUser')
  if (user.status === 1) return t('enableUser')
}

const tableRowFormatter = (data) => {
  return data.row.email
}

const openSelect = () => {
  mySelect.value.toggleMenu()
}

function resetAddForm() {
  addForm.email = ''
  addForm.suffix = settingStore.domainList[0]
  addForm.type = null
  addForm.password = ''
}

function openAdd() {
  showAdd.value = true
}

function clearFilters() {
  params.email = ''
  params.status = -1
  params.num = 1
  getUserList()
}

function submit() {

  if (!addForm.email) {
    ElMessage({
      message: t('emptyEmailMsg'),
      type: "error",
      plain: true
    })
    return
  }

  if (!isEmail(addForm.email + addForm.suffix)) {
    ElMessage({
      message: t('notEmailMsg'),
      type: "error",
      plain: true
    })
    return
  }

  if (!addForm.password) {
    ElMessage({
      message: t('emptyPwdMsg'),
      type: "error",
      plain: true
    })
    return
  }

  if (addForm.password.length < 6) {
    ElMessage({
      message: t('pwdLengthMsg'),
      type: "error",
      plain: true
    })
    return
  }

  if (!addForm.type) {
    ElMessage({
      message: t('emptyRole'),
      type: "error",
      plain: true
    })
    return
  }

  addLoading.value = true
  const form = {...addForm}
  form.email = form.email + form.suffix
  userAdd(form).then(() => {
    addLoading.value = false
    showAdd.value = false
    ElMessage({
      message: t('addSuccessMsg'),
      type: "success",
      plain: true
    })
    resetAddForm()
    getUserList(false)
  }).finally(res => {
    addLoading.value = false
  })
}


function formatSendType(user) {
  if (user.sendAction.sendType === 'day') return t('daily')
  if (user.sendAction.sendType === 'count') return t('total')
  if (user.sendAction.sendType === 'ban') return t('sendBanned')
  if (user.sendAction.sendType === 'internal') return t('sendInternal')
}

function formatSendCount(user) {

  if (!user.sendAction.hasPerm) {
    return t('unauthorized')
  }

  if (!user.sendAction.sendCount) {
    return t('unlimited');
  }

  let count = user.sendCount + '/' + user.sendAction.sendCount

  return count
}

function toRoleName(type) {

  if (type === 0) {
    return t('admin')
  }

  const index = roleList.findIndex(role => role.roleId === type)
  if (index > -1) {
    return roleList[index].name
  }
  return ""
}

function resetSendCount(user) {

  ElMessageBox.confirm(t('reSendConfirm', {msg: user.email}), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {
    userRestSendCount(user.userId).then(() => {
      ElMessage({
        message: t('reSuccessMsg'),
        type: "success",
        plain: true
      })
      user.sendCount = 0
    })
  });
}

function delUser() {
  const userIds = selectedRows.value.map(row => row.userId);
  if (userIds.length === 0) {
    return;
  }
  ElMessageBox.confirm(t('delUsersConfirm'), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {
    userDelete(userIds).then(() => {
      ElMessage({
        message: t('delSuccessMsg'),
        type: "success",
        plain: true
      })
      tableRef.value.clearSelection?.()
      getUserList(true)
    })
  });
}

function delOneUser(user) {
  ElMessageBox.confirm(t('delConfirm', {msg: user.email}), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {
    userDelete([user.userId]).then(() => {
      ElMessage({
        message: t('delSuccessMsg'),
        type: "success",
        plain: true
      })
      getUserList(true)
    })
  });
}

function restore(user) {

  const type = ref(0)

  ElMessageBox.confirm(null, {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    message: () => h('div', [
      h('div', {class: 'mb-2'}, t('restoreConfirm', {msg: user.email}))
    ]),
    type: 'warning'
  }).then(() => {
    userRestore(user.userId, type.value).then(() => {
      user.isDel = 0
      ElMessage({
        message: t('restoreSuccessMsg'),
        type: "success",
        plain: true
      })
    })
  });
}

function setStatus(user) {
  httpSetStatus(user);
}

function httpSetStatus(user) {
  let status = user.status ? 0 : 1
  userSetStatus({status: status, userId: user.userId}).then(() => {
    user.status = status
    ElMessage({
      message: t('saveSuccessMsg'),
      type: "success",
      plain: true
    })
  })
}

function setType() {
  settingLoading.value = true
  userSetType({type: userForm.type, userId: userForm.userId}).then(() => {
    chooseUser.type = userForm.type
    setTypeShow.value = false
    ElMessage({
      message: t('saveSuccessMsg'),
      type: "success",
      plain: true
    })

  }).finally(() => {
    settingLoading.value = false
  })
}


function resetUserForm() {
  userForm.password = null
  userForm.userId = 0
}

function search() {
  params.num = 1
  getUserList()
}

function updatePwd() {

  if (!userForm.password) {
    ElMessage({
      message: t('emptyPwdMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  if (userForm.password.length < 6) {
    ElMessage({
      message: t('pwdLengthMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  settingLoading.value = true
  userSetPwd({password: userForm.password, userId: userForm.userId}).then(() => {
    setPwdShow.value = false
    ElMessage({
      message: t('saveSuccessMsg'),
      type: "success",
      plain: true
    })
  }).finally(() => {
    settingLoading.value = false
  })
}

function openSetType(user) {
  chooseUser = user
  userForm.userId = user.userId
  userForm.type = user.type
  setTypeShow.value = true
}

function openSetPwd(user) {
  userForm.userId = user.userId
  setPwdShow.value = true
}

function openSetName(user) {
  setNameUserId.value = user.userId
  setNameValue.value = user.accountName || user.oauthName || ''
  setNameShow.value = true
}

function submitSetName() {
  if (!setNameValue.value.trim()) {
    ElMessage({ message: t('emptyUserNameMsg'), type: 'error', plain: true })
    return
  }
  setNameLoading.value = true
  userSetName(setNameUserId.value, setNameValue.value.trim()).then(() => {
    ElMessage({ message: t('saveSuccessMsg'), type: 'success', plain: true })
    setNameShow.value = false
    const row = users.value?.find(u => u.userId === setNameUserId.value)
    if (row) row.accountName = setNameValue.value.trim()
  }).catch(() => {}).finally(() => { setNameLoading.value = false })
}

function refresh() {
  params.email = ''
  params.num = 1
  params.status = -1
  params.timeSort = 0
  getUserList();
  roleSelectUse().then(list => {
    roleList.length = 0
    roleList.push(...list)
  })
}

function changeTimeSort() {
  params.num = 1
  params.timeSort = params.timeSort ? 0 : 1
  getUserList()
}

function numChange(num) {
  params.num = num
  getUserList()
}

function sizeChange(size) {
  params.size = size
  getUserList()
}

function getUserList(loading = true) {

  tableLoading.value = loading
  loadError.value = false
  const newParams = {...params}

  if (newParams.status === -2) {
    delete newParams.status
    newParams.isDel = 1
  }
  userList(newParams).then(data => {
    users.value = data.list.map(item => ({...item, checkedClass: ''}))
    total.value = data.total
    }).catch(() => {
    loadError.value = true
  }).finally(() => {
    tableLoading.value = false
    setTimeout(() => {
      first.value = false
    }, 200)
  })
}

onMounted(() => { adjustWidth(); window.addEventListener('resize', adjustWidth); window.addEventListener('wheel', onWheel) })
onUnmounted(() => { window.removeEventListener('resize', adjustWidth); window.removeEventListener('wheel', onWheel) })

function adjustWidth() {
  const width = window.innerWidth
  isCardView.value = width < 768
  statusShow.value = width > 1090
  accountNumShow.value = width > 650
  sendNumShow.value = width > 900
  typeShow.value = width > 990
  pagerCount.value = width < 768 ? 7 : 11
  layout.value = width < 768 ? 'pager' : 'prev, pager, next,sizes, total'
  phonePageShow.value = width < 768
  pageSize.value = width < 380 ? 'small' : ''
}

defineExpose({ openCreate: openAdd })
</script>

<style>
.el-message-box__container {
  align-items: start !important;
}

.el-message-box__message {
  word-break: break-all;
}
</style>
<style scoped lang="scss">

:deep(.el-table .checked-row) {
  background: var(--psg-surface-active);
}

.tab-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.toolbar {
  padding: 0 12px;
  height: 44px;
  display: flex;
  gap: 4px;
  flex-wrap: nowrap;
  align-items: center;
  background: var(--psg-surface);
  border-radius: var(--psg-radius-md);
  border: 1px solid var(--psg-border);
  flex-shrink: 0;

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
    width: min(220px, calc(100vw - 260px));
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
    transition: border-color 0.10s, color 0.10s;

    @media (hover: hover) {
      &:hover {
        border-color: transparent;
        background: var(--psg-surface-active);
        color: var(--psg-text);
      }
    }
  }
}

.selection-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  background: var(--psg-surface-muted);
  border: 1px solid var(--psg-border);
  border-radius: var(--psg-radius-md);
  font-size: 13px;
  font-weight: 600;
  color: var(--psg-text);
}

.fade-enter-active, .fade-leave-active { transition: opacity 0.14s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

.container {
  display: grid;
  grid-template-columns: 1fr;
  gap: 15px;
}

.user-cell {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.user-cell-text {
  min-width: 0;
  flex: 1;
}

.user-cell-name {
  font-weight: 600;
  color: var(--psg-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.user-cell-email {
  font-size: 12px;
  color: var(--psg-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.user-avatar {
  flex-shrink: 0;
  width: 30px;
  height: 30px;
  border-radius: var(--psg-radius-xs);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  font-family: 'IBM Plex Sans', 'Noto Sans SC', sans-serif;
}

.table-card {
  position: relative;
  width: 100%;
  min-height: 120px;
  background: var(--psg-surface);
  border-radius: var(--psg-radius-md);
  border: 1px solid var(--psg-border);
  overflow: hidden;
}

.card-list {
  position: relative;
  min-height: 120px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.user-card {
  background: var(--psg-surface);
  border: 1px solid var(--psg-border);
  border-radius: var(--psg-radius-md);
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.user-card-head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.user-card-badges {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.user-card-stats {
  display: flex;
  gap: 14px;
  font-size: 12.5px;
  color: var(--psg-text-secondary);
}

.details {
  padding: 0 10px 10px 10px;
  display: grid;
  gap: 10px;
  .details-item-title {
    white-space: pre;
    color: var(--psg-text-secondary);
    font-weight: bold;
    padding-right: 10px;
  }
}

:deep(.linuxdo-avatar) {
  position: relative !important;
  top: 10px;
}

.account-pagination {
  display: flex;
  justify-content: end;
  width: 100%;
}

.pagination {
  margin-top: 4px;
  margin-bottom: 20px;
  padding-right: 30px;
  width: 100%;
  display: flex;
  flex-direction: column;
  justify-content: end;
  gap: 10px;
  @media (max-width: 767px) {
    padding-right: 10px;
  }

  .el-pagination {
    align-self: end;
  }
}

.email-row {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.status-select :deep(.el-select__wrapper) {
  height: 30px;
  min-height: 30px;
  box-shadow: none !important;
  border: 1px solid var(--psg-border);
  border-radius: var(--psg-radius-sm);
  transition: border-color 0.12s;
  &:hover { border-color: var(--psg-border-strong); }
  &.is-focused { border-color: var(--psg-primary); }
}

.dialog {
  .dialog-box {
    .el-button {
      width: 100%;
      margin-top: 15px;
    }
  }
}

:deep(.el-dialog) {
  width: 400px !important;
  @media (max-width: 440px) {
    width: calc(100% - 40px) !important;
    margin-right: 20px !important;
    margin-left: 20px !important;
  }
}

:deep(.account-dialog) {
  width: 500px !important;
  @media (max-width: 540px) {
    width: calc(100% - 40px) !important;
    margin-right: 20px !important;
    margin-left: 20px !important;
  }
}

.select {
  position: absolute;
  right: 30px;
  width: 100px;
  opacity: 0;
  pointer-events: none;
}

.empty-slot {
  position: relative;
}

.loading {
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--psg-surface);
  left: 0;
  z-index: 2;
  top: 0;
  width: 100%;
  height: 100%;
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

.setting-icon {
  position: relative;
  top: 6px;
}

.right-dropdown-item {
  display: flex;
  gap: 10px;
}

.btn {
  width: 100%;
}

:deep(.el-input-group__append) {
  padding: 0 !important;
  padding-left: 8px !important;
  background: var(--psg-surface);
}

:deep(.el-table) {
  @media (pointer: coarse) {
    user-select: none;
  }
}

:deep(.el-table__inner-wrapper:before) {
  background: var(--psg-surface);
}

:deep(.el-message-box__container) {
  align-items: start;
}
</style>
