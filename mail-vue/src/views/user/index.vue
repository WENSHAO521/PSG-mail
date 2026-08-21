<template>
  <div class="page-outer">
    <div class="space-y">
    <div class="page-header">
      <div>
        <h1 class="page-title">{{ $t('allUsers') }}</h1>
        <p class="page-subtitle">{{ $t('userManagementDesc') }}</p>
      </div>
      <el-button type="primary" class="create-user-btn" @click="openAdd">
        <Icon icon="solar:user-plus-linear" width="16" height="16"/>
        {{ $t('addUser') }}
      </el-button>
    </div>
    <div class="header-actions">
      <div class="search">
        <el-input
            v-model="params.email"
            class="search-input"
            :placeholder="$t('searchByEmail')"
        >
        </el-input>
      </div>
      <el-select v-model="params.status" placeholder="Select" class="status-select"
                 :style="`width: ${locale === 'en' ? 95 : 80 }px`">
        <el-option :key="-1" :label="$t('all')" :value="-1"/>
        <el-option :key="0" :label="$t('active')" :value="0"/>
        <el-option :key="1" :label="$t('banned')" :value="1"/>
        <el-option :key="-2" :label="$t('deleted')" :value="-2"/>
      </el-select>
      <Icon class="icon" icon="solar:magnifer-linear" @click="search" width="18" height="18"/>
      <Icon class="icon" @click="changeTimeSort" icon="solar:sort-by-time-linear"
            v-if="params.timeSort === 1" width="20" height="20"/>
      <Icon class="icon" @click="changeTimeSort" icon="solar:sort-by-time-linear" v-else width="20"
            height="20" style="transform: scaleY(-1)"/>
      <Icon class="icon" icon="solar:refresh-linear" width="18" height="18" @click="refresh"/>
      <Icon class="icon icon-danger" icon="solar:trash-bin-trash-linear" width="18" height="18" @click="delUser"/>
    </div>
    <div class="table-card">
      <div>
        <div class="loading" :class="tableLoading ? 'loading-show' : 'loading-hide'"
             :style="first ? 'background: transparent' : ''">
          <loading/>
        </div>
        <el-table
            @filter-change="tableFilter"
            :empty-text="first ? '' : null"
            :data="users"
            :preserve-expanded-content="preserveExpanded"
            style="width: 100%;"
            ref="tableRef"
            @cell-contextmenu="handleContextmenu"
            :cell-class-name="cellClassName"
        >
          <el-table-column :width="expandWidth" type="selection" :selectable="row => row.type !== 0" />
          <el-table-column show-overflow-tooltip :tooltip-formatter="tableRowFormatter" :label="$t('tabEmailAddress')"
                           :min-width="emailWidth">
            <template #default="props">
              <div class="user-email-cell">
                <div class="user-avatar" :style="{ background: avatarBg(props.row.email) }">
                  {{ avatarLetter(props.row.accountName || props.row.oauthName, props.row.email) }}
                </div>
                <div class="email-row">{{ props.row.email }}</div>
                <el-tag type="warning" v-if="props.row.username">L</el-tag>
              </div>
            </template>
          </el-table-column>
          <el-table-column :label="$t('username')" width="150" show-overflow-tooltip>
            <template #default="{ row }">
              <span class="user-name-cell">{{ row.accountName || row.oauthName || '—' }}</span>
            </template>
          </el-table-column>
          <el-table-column :formatter="formatterReceive" label-class-name="receive" column-key="receive"
                           :filtered-value="filteredValue" :filters="filters" :width="receiveWidth"
                           :label="$t('tabReceived')"
                           prop="receiveEmailCount"/>
          <el-table-column :formatter="formatterSend" label-class-name="send" column-key="send"
                           :filtered-value="filteredValue" :filters="filters" v-if="sendNumShow" :label="$t('tabSent')"
                           prop="sendEmailCount"/>
          <el-table-column :formatter="formatterAccount" label-class-name="account" column-key="account"
                           :filtered-value="filteredValue" :filters="filters" v-if="accountNumShow"
                           :label="$t('tabMailboxes')"
                           prop="accountCount"/>
          <el-table-column v-if="createTimeShow" :label="$t('tabRegisteredAt')" min-width="160" prop="createTime">
            <template #default="props">
              {{ tzDayjs(props.row.createTime).format('YYYY-MM-DD HH:mm') }}
            </template>
          </el-table-column>
          <el-table-column v-if="statusShow" min-width="90px" :label="$t('tabStatus')" prop="status">
            <template #default="props">
              <div class="status-dot-cell" v-if="props.row.isDel === 1">
                <span class="status-dot status-dot--muted"></span>{{ $t('deleted') }}
              </div>
              <div class="status-dot-cell" v-else-if="props.row.status === 0">
                <span class="status-dot status-dot--active"></span>{{ $t('active') }}
              </div>
              <div class="status-dot-cell" v-else-if="props.row.status === 1">
                <span class="status-dot status-dot--danger"></span>{{ $t('banned') }}
              </div>
            </template>
          </el-table-column>
          <el-table-column v-if="typeShow" :label="$t('tabRole')" min-width="140" prop="type">
            <template #default="props">
              <div class="role-pill" :class="{ 'role-pill--admin': props.row.type === 0 }">
                {{ toRoleName(props.row.type) }}
              </div>
            </template>
          </el-table-column>
          <el-table-column :label="$t('tabSetting')" :width="settingWidth">
            <template #default="props">
              <el-button size="small" type="primary" v-if="(props.row.type === 0 && userStore.user.type !== 0)" >{{ $t('action') }}</el-button>
              <el-dropdown v-else >
                <el-button size="small" type="primary">{{ $t('action') }}</el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item @click="openSetPwd(props.row)" >{{ $t('chgPwd') }}</el-dropdown-item>
                    <el-dropdown-item @click="openSetName(props.row)" >{{ $t('setUsername') }}</el-dropdown-item>
                    <el-dropdown-item @click="openSetType(props.row)" >{{ $t('perm') }}</el-dropdown-item>
                    <template v-if="props.row.type !== 0">
                      <el-dropdown-item v-if="props.row.isDel !== 1" @click="setStatus(props.row)">
                        {{ setStatusName(props.row) }}
                      </el-dropdown-item>
                      <el-dropdown-item v-else @click="restore(props.row)">{{ $t('restore') }}</el-dropdown-item>
                    </template>
                    <el-dropdown-item @click="openAccountList(props.row.userId)" >{{ $t('account') }}</el-dropdown-item>
                    <el-dropdown-item @click="openDetails(props.row)" >{{ $t('details') }}</el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </template>
          </el-table-column>
        </el-table>
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
      </div>
    </div><!-- /table-card -->
    </div><!-- /space-y -->
  </div><!-- /page-outer -->
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
                <Icon class="setting-icon" icon="solar:alt-arrow-down-linear" width="20" height="20"/>
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
        <div v-if="!createTimeShow"><span class="details-item-title">{{ $t('tabRegisteredAt') }}:</span>{{
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
          <el-dropdown-item @click="openSetPwd(rightClickUser)">
            <template #default>
              <div class="right-dropdown-item">
                <icon icon="solar:fingerprint-bold-duotone" width="22" height="22" />
                <span>{{t('changePassword')}}</span>
              </div>
            </template>
          </el-dropdown-item>
          <el-dropdown-item @click="openSetName(rightClickUser)">
            <template #default>
              <div class="right-dropdown-item">
                <icon icon="solar:user-id-bold-duotone" width="21" height="21" />
                <span>{{ t('setUsername') }}</span>
              </div>
            </template>
          </el-dropdown-item>
          <el-dropdown-item @click="openSetType(rightClickUser)">
            <template #default>
              <div class="right-dropdown-item">
                <icon icon="solar:lock-keyhole-linear" width="21" height="21" />
                <span>{{ t('setRole') }}</span>
              </div>
            </template>
          </el-dropdown-item>
          <el-dropdown-item v-if="rightClickUser.type !== 0">
            <template #default>
              <div class="right-dropdown-item" v-if="rightClickUser.isDel !== 1" @click="setStatus(rightClickUser)" >
                <Icon icon="solar:refresh-linear" v-if="rightClickUser.status" style="margin-left: 1px;margin-right: 1px" width="19" height="19" />
                <Icon icon="solar:shield-cross-linear" v-else style="margin-left: 1px;margin-right: 1px" width="19" height="19" />
                <span>{{ setRightStatusName(rightClickUser) }}</span>
              </div>
              <div class="right-dropdown-item" v-else @click="restore(rightClickUser)">
                <Icon icon="solar:refresh-linear" style="margin-left: 1px;margin-right: 1px" width="19" height="19" />
                <span>{{ t('restoreUser') }}</span>
              </div>
            </template>
          </el-dropdown-item>
          <el-dropdown-item @click="openAccountList(rightClickUser.userId)" >
            <template #default>
              <div class="right-dropdown-item" >
                <Icon icon="solar:mailbox-linear" width="20" height="20" />
                <span>{{ t('userEmail') }}</span>
              </div>
            </template>
          </el-dropdown-item>
          <el-dropdown-item @click="openDetails(rightClickUser)" >
            <template #default>
              <div class="right-dropdown-item" >
                <Icon icon="solar:user-linear" width="20" height="20" />
                <span>{{ t('userDetails') }}</span>
              </div>
            </template>
          </el-dropdown-item>
          <el-dropdown-item v-if="rightClickUser.type !== 0" @click="delOneUser(rightClickUser)" >
            <template #default>
              <div class="right-dropdown-item" >
                <Icon icon="solar:trash-bin-trash-linear" width="18" height="18" style="margin-left: 1px;margin-right: 1px" />
                <span>{{ t('adminDeleteUser') }}</span>
              </div>
            </template>
          </el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>
</template>

<script setup>
import {defineOptions, h, onMounted, onUnmounted, reactive, ref, watch} from 'vue'
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
import {tzDayjs} from "@/utils/day.js";
import {avatarBg, avatarLetter} from "@/utils/avatar.js";
import {useSettingStore} from "@/store/setting.js";
import {isEmail} from "@/utils/verify-utils.js";
import {useRoleStore} from "@/store/role.js";
import {useUserStore} from "@/store/user.js";
import {useI18n} from 'vue-i18n';

defineOptions({
  name: 'user'
})

const {t, locale} = useI18n();
const roleStore = useRoleStore()
const userStore = useUserStore()
const settingStore = useSettingStore()
const filteredValue = ['normal', 'del']
const filters = [{text: t('active'), value: 'normal'}, {text: t('deleted'), value: 'del'}]
const preserveExpanded = ref(false)
const emailWidth = ref(230)
const expandWidth = ref(40)
const settingWidth = ref(null)
const sendNumShow = ref(true)
const accountNumShow = ref(true)
const createTimeShow = ref(true)
const statusShow = ref(true)
const typeShow = ref(true)
const receiveWidth = ref(null)
const phonePageShow = ref(false)
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

const filterItem = reactive({
  send: ['normal', 'del'],
  account: ['normal', 'del'],
  receive: ['normal', 'del']
})

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

function tableFilter(e) {

  if (e.send) filterItem.send = e.send
  if (e.account) filterItem.account = e.account
  if (e.receive) filterItem.receive = e.receive

}

function formatterSend(e) {

  if (filterItem.send.length === 2) {
    return e.sendEmailCount + e.delSendEmailCount
  }

  if (filterItem.send.includes('normal')) {
    return e.sendEmailCount
  }

  if (filterItem.send.includes('del')) {
    return e.delSendEmailCount
  }

  return 0
}

function formatterAccount(e) {

  if (filterItem.account.length === 2) {
    return e.accountCount + e.delAccountCount
  }

  if (filterItem.account.includes('normal')) {
    return e.accountCount
  }

  if (filterItem.account.includes('del')) {
    return e.delAccountCount
  }

  return 0
}

function formatterReceive(e) {


  if (filterItem.receive.length === 2) {
    return e.receiveEmailCount + e.delReceiveEmailCount
  }

  if (filterItem.receive.includes('normal')) {
    return e.receiveEmailCount
  }

  if (filterItem.receive.includes('del')) {
    return e.delReceiveEmailCount
  }

  return 0
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

function delUser(user) {
  const rows = tableRef.value.getSelectionRows();
  const userIds = rows.map(row => row.userId);
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
      // h(ElRadioGroup, {
      //   modelValue: type.value,
      //   'onUpdate:modelValue': (val) => (type.value = val),
      // }, [
      //   h(ElRadio, {label: 'option1', value: 0}, t('normalRestore')),
      //   h(ElRadio, {label: 'option2', value: 1}, t('allRestore')),
      // ])
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
  const newParams = {...params}

  if (newParams.status === -2) {
    delete newParams.status
    newParams.isDel = 1
  }
  userList(newParams).then(data => {
    users.value = data.list.map(item => ({...item, checkedClass: ''}))
    total.value = data.total
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
  statusShow.value = width > 1090
  createTimeShow.value = width > 1367
  accountNumShow.value = width > 650
  sendNumShow.value = width > 685
  typeShow.value = width > 767
  emailWidth.value = width > 480 ? 160 : null
  settingWidth.value = width < 480 ? (locale.value === 'en' ? 85 : 75) : null
  expandWidth.value = width < 480 ? 30 : 35
  pagerCount.value = width < 768 ? 7 : 11
  receiveWidth.value = width < 480 ? 90 : null
  layout.value = width < 768 ? 'pager' : 'prev, pager, next,sizes, total'
  phonePageShow.value = width < 768
  pageSize.value = width < 380 ? 'small' : ''
}

</script>

<style>
.el-message-box__container {
  align-items: start !important;
}

.el-message-box__message {
  word-break: break-all;
}

.el-table-filter__content {
  min-width: 0;
}
</style>
<style lang="scss" scoped>

:deep(.el-table .checked-row) {
  background: var(--psg-surface-active);
}

.page-outer {
  max-width: 1240px;
  margin: 0 auto;
  padding: 24px 32px 56px;
  @media (max-width: 960px)  { padding: 20px 24px 40px; }
  @media (max-width: 640px)  { padding: 16px 16px 32px; }
}

.space-y {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

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

.create-user-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
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

.header-actions {
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
    width: min(160px, calc(100vw - 260px));
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
      &.icon-danger:hover {
        border-color: transparent;
        background: var(--psg-danger-muted);
        color: var(--psg-danger);
      }
    }
  }
}

.container {
  display: grid;
  grid-template-columns: 1fr;
  gap: 15px;
}

.type {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.user-email-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.user-avatar {
  flex-shrink: 0;
  width: 26px;
  height: 26px;
  border-radius: var(--psg-radius-full);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  font-family: 'IBM Plex Sans', 'Noto Sans SC', sans-serif;
}

.status-dot-cell {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
  color: var(--psg-text);
}

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: var(--psg-radius-full);
  flex-shrink: 0;

  &--active { background: var(--psg-primary); }
  &--danger { background: var(--psg-danger); }
  &--muted  { background: var(--psg-text-muted); }
}

.role-pill {
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: var(--psg-radius-full);
  font-size: 12px;
  font-weight: 600;
  color: var(--psg-text-secondary);
  background: var(--psg-surface-muted);
  white-space: nowrap;

  &--admin {
    color: var(--psg-text);
    background: var(--psg-surface-active);
    font-weight: 700;
  }
}

.choose-star {
  color: var(--psg-primary)
}

.table-card {
  position: relative;
  width: 100%;
  background: var(--psg-surface);
  border-radius: var(--psg-radius-md);
  border: 1px solid var(--psg-border);
  overflow: hidden;
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
  margin-top: 15px;
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

.user-name-cell {
  font-weight: 600;
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

.select {
  position: absolute;
  right: 30px;
  width: 100px;
  opacity: 0;
  pointer-events: none;
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

:deep(.el-pagination .el-select) {
  width: 100px;
  background: var(--psg-surface);
}

:deep(.el-input-group__append) {
  padding: 0 !important;
  padding-left: 8px !important;
  background: var(--psg-surface);
}

:deep(.cell) {
  white-space: normal;
  overflow: visible;
  text-overflow: clip;
}

:deep(.receive .cell) {
  white-space: nowrap;
}

:deep(.send .cell) {
  white-space: nowrap;
}

:deep(.account .cell) {
  white-space: nowrap;
}

:deep(.el-table) {
  @media (pointer: coarse) {
    /* 触屏 */
    user-select: none;
  }
}

:deep(.el-table th.el-table__cell>.cell.highlight) {
  color: #909399;
}

:deep(.el-table__inner-wrapper:before) {
  background: var(--psg-surface);
}

:deep(.el-message-box__container) {
  align-items: start;
}
</style>
