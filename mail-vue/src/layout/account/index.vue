<template>
  <div class="account-box">
    <div class="head-opt">
      <span class="head-count">{{ noLoading ? $t('accountTotal', { n: accounts.length }, accounts.length) : '' }}</span>
      <button type="button" class="icon-btn" :title="$t('refresh')" :aria-label="$t('refresh')" @click="refresh">
        <Icon icon="psg:refresh" width="16" height="16"/>
      </button>
      <button v-perm="'account:add'" type="button" class="add-btn" @click="add">
        <Icon icon="psg:add-circle" width="16" height="16"/>
        <span>{{ $t('addAccount') }}</span>
      </button>
    </div>
    <el-scrollbar class="scrollbar" ref="scrollbarRef">
      <div v-infinite-scroll="getAccountList" :infinite-scroll-distance="600" :infinite-scroll-immediate="false">
        <div class="item" :class="itemBg(item.accountId)" v-for="(item, index) in accounts" :key="item.accountId"
             @click="changeAccount(item)">
          <div class="item-avatar">
            <img v-if="accountPhoto(item)" :src="accountPhoto(item)" class="avatar-photo"/>
            <span v-else>{{ emailInitial(item.email, item.name) }}</span>
          </div>
          <div class="item-info">
            <div class="item-name-row">
              <span class="item-name">{{ item.name || item.email }}</span>
              <span v-if="accountStore.currentAccountId === item.accountId" class="item-badge">{{ $t('accountCurrent') }}</span>
              <span v-if="item.allReceive" class="item-badge item-badge-accent">{{ $t('accountAllReceive') }}</span>
            </div>
            <div class="item-email" v-if="item.name">{{ item.email }}</div>
          </div>
          <div class="item-actions" @click.stop>
            <el-tooltip :content="$t('accountAllReceiveTip')" placement="top" :show-after="400">
              <button type="button" class="action-icon" :class="{ 'action-active': item.allReceive }"
                      :aria-label="$t('accountAllReceiveTip')" :aria-pressed="!!item.allReceive" @click="setAllReceive(item)">
                <Icon icon="psg:mail" width="16" height="16"/>
              </button>
            </el-tooltip>
            <el-tooltip :content="$t('copy')" placement="top" :show-after="400">
              <button type="button" class="action-icon" :aria-label="$t('copy')" @click.stop="copyAccount(item.email)">
                <Icon icon="psg:copy" width="16" height="16"/>
              </button>
            </el-tooltip>
            <el-dropdown v-if="!showNullSetting(item)" trigger="click">
              <button type="button" class="action-icon" :aria-label="$t('more')">
                <Icon icon="psg:more" width="16" height="16"/>
              </button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item v-if="hasPerm('email:send')" @click="openSetName(item)">{{ $t('rename') }}</el-dropdown-item>
                  <el-dropdown-item v-if="item.accountId !== userStore.user.account.accountId" @click="setAsTop(item, index)">{{ $t('pin') }}</el-dropdown-item>
                  <el-dropdown-item v-if="item.accountId !== userStore.user.account.accountId && hasPerm('account:delete')"
                                    @click="remove(item)">{{ $t('delete') }}</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </div>

        <!-- Initial Loading Skeleton -->
        <template v-if="loading">
          <el-skeleton v-for="i in skeletonRows" :key="i" animated>
            <template #template>
              <div class="item" style="pointer-events:none">
                <el-skeleton-item variant="image" style="width:36px;height:36px;border-radius: var(--psg-radius-sm);flex-shrink:0"/>
                <div style="flex:1;min-width:0">
                  <el-skeleton-item variant="p" style="width:75%;height:13px"/>
                </div>
                <div style="display:flex;gap:5px">
                  <el-skeleton-item variant="text" style="width:17px;height:17px"/>
                  <el-skeleton-item variant="text" style="width:17px;height:17px"/>
                </div>
              </div>
            </template>
          </el-skeleton>
        </template>

        <!-- Follow Loading Skeleton -->
        <template v-if="accounts.length > 0 && !noLoading">
          <el-skeleton animated>
            <template #template>
              <div class="item" style="pointer-events:none">
                <el-skeleton-item variant="image" style="width:36px;height:36px;border-radius: var(--psg-radius-sm);flex-shrink:0"/>
                <div style="flex:1;min-width:0">
                  <el-skeleton-item variant="p" style="width:75%;height:13px"/>
                </div>
              </div>
            </template>
          </el-skeleton>
        </template>

        <div class="empty" v-if="noLoading && accounts.length === 0">
          <el-empty :description="$t('noMessagesFound')"/>
        </div>
      </div>

    </el-scrollbar>
    <el-dialog v-model="showAdd" :title="$t('addAccount')" width="420">
      <el-tabs v-model="addTab" class="add-tabs">

        <!-- Tab 1: Create new email -->
        <el-tab-pane :label="$t('createNewEmail')" name="create">
          <div class="container">
            <el-input v-model="addForm.email" ref="addRef" type="text" :placeholder="$t('emailAccount')" autocomplete="off">
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
                  <div class="suffix-trigger">
                    <span>{{ addForm.suffix }}</span>
                    <Icon icon="psg:chevron-down" width="16" height="16"/>
                  </div>
                </div>
              </template>
            </el-input>
            <el-button class="btn" type="primary" @click="submit" :loading="addLoading">
              {{ $t('add') }}
            </el-button>
          </div>
          <div
              class="add-email-turnstile"
              :class="verifyShow ? 'turnstile-show' : 'turnstile-hide'"
              :data-sitekey="settingStore.settings.siteKey"
              data-callback="onTurnstileSuccess"
              data-error-callback="onTurnstileError"
          >
            <span style="font-size: 12px;color: var(--psg-danger)" v-if="botJsError">{{ $t('verifyModuleFailed') }}</span>
          </div>
        </el-tab-pane>

        <!-- Tab 2: Bind registered email -->
        <el-tab-pane :label="$t('bindExistingEmail')" name="bind">
          <div class="container">
            <el-input v-model="bindForm.email" type="text" :placeholder="$t('emailAccount')" autocomplete="off"/>
            <el-input v-model="bindForm.password" type="password" :placeholder="$t('bindEmailPassword')" autocomplete="off"/>
            <p class="bind-tip">{{ $t('bindEmailTip') }}</p>
            <el-button class="btn" type="primary" @click="submitBind" :loading="bindLoading">
              {{ $t('add') }}
            </el-button>
          </div>
        </el-tab-pane>

      </el-tabs>
    </el-dialog>
    <el-dialog v-model="setNameShow" :title="$t('changeUserName')">
      <div class="container">
        <el-input v-model="accountName" type="text" :placeholder="$t('username')" autocomplete="off">
        </el-input>
        <el-button class="btn" type="primary" @click="setName" :loading="setNameLoading"
        >{{ $t('save') }}
        </el-button>
      </div>
    </el-dialog>
  </div>
</template>
<script setup>
import {Icon} from "@iconify/vue";
import {computed, nextTick, reactive, ref, watch} from "vue";
import {
  accountList,
  accountAdd,
  accountDelete,
  accountSetName,
  accountSetAllReceive,
  accountSetAsTop,
  accountBind
} from "@/request/account.js";
import {sleep} from "@/utils/time-utils.js"
import {isEmail} from "@/utils/verify-utils.js";
import {useSettingStore} from "@/store/setting.js";
import {useAccountStore} from "@/store/account.js";
import {useEmailStore} from "@/store/email.js";
import {useUserStore} from "@/store/user.js";
import {storedAvatar} from "@/utils/avatar.js";
import {useAvatarCacheStore} from "@/store/avatar-cache.js";
import {hasPerm} from "@/perm/perm.js"
import {useI18n} from "vue-i18n";
import {AccountAllReceiveEnum} from "@/enums/account-enum.js";

const {t} = useI18n();
const userStore = useUserStore();
const avatarCache = useAvatarCacheStore();

function accountPhoto(item) {
    // 1. Server avatar (cross-device, reactive — fetches lazily)
    // 2. localStorage cache (instant on same device)
    // 3. userStore.avatar for the currently active account
    return avatarCache.get(item.email)
        || storedAvatar(item.email)
        || (item.accountId === userStore.user.account?.accountId ? userStore.avatar : '')
}
const accountStore = useAccountStore();
const settingStore = useSettingStore();
const emailStore = useEmailStore();
const showAdd = ref(false)
const addLoading = ref(false)
const addTab = ref('create')
const bindLoading = ref(false)
const bindForm = reactive({ email: '', password: '' })
const domainList = computed(() => settingStore.domainList)
const accounts = reactive([])
const noLoading = ref(false)
const loading = ref(false)
const followLoading = ref(false);
const verifyShow = ref(false)
const setNameShow = ref(false)
const setNameLoading = ref(false)
const accountName = ref(null)
const addRef = ref({})
const scrollbarRef = ref({})
let account = null
let turnstileId = null
const botJsError = ref(false)
let verifyToken = ''
let verifyErrorCount = 0
let first = true
const addForm = reactive({
  email: '',
  suffix: settingStore.domainList[0]
})
let skeletonRows = 10
const queryParams = {
  size: 30
}

const mySelect = ref()

if (hasPerm('account:query')) {
  getAccountList()
}
userStore.loadAvatar()

watch(() => accountStore.changeUserAccountName, () => {
  accounts[0].name = accountStore.changeUserAccountName
})

watch(() => settingStore.domainList, (list) => {
  if (!addForm.suffix && list.length > 0) {
    addForm.suffix = list[0]
  }
}, {immediate: true})


const openSelect = () => {
  mySelect.value.toggleMenu()
}

window.onTurnstileError = (e) => {
  if (verifyErrorCount >= 4) {
    return
  }
  verifyErrorCount++
  console.warn('人机验加载失败', e)
  setTimeout(() => {
    nextTick(() => {
      if (!turnstileId) {
        turnstileId = window.turnstile.render('.add-email-turnstile')
      } else {
        window.turnstile.reset(turnstileId);
      }
    })
  }, 1500)
};

window.onTurnstileSuccess = (token) => {
  verifyToken = token;
};

function getSkeletonRows() {
  if (accounts.length > 20) return skeletonRows = 20
  if (accounts.length === 0) return skeletonRows = 1
  skeletonRows = accounts.length
}

function setName() {

  let name = accountName.value

  if (name === account.name) {
    setNameShow.value = false
    return
  }

  if (!name) {
    ElMessage({
      message: t('emptyUserNameMsg'),
      type: 'error',
      plain: true,
    })
    return;
  }

  setNameLoading.value = true
  accountSetName(account.accountId, name).then(() => {
    account.name = name
    setNameShow.value = false

    if (account.accountId === userStore.user.account.accountId) {
      userStore.user.name = name
    }

    ElMessage({
      message: t('saveSuccessMsg'),
      type: "success",
      plain: true
    })
  }).finally(() => {
    setNameLoading.value = false
  })
}

function openSetName(accountItem) {
  accountName.value = accountItem.name
  account = accountItem
  setNameShow.value = true
}

function setAllReceive(account) {
  let allReceiveAccount = accounts.find(account => account.allReceive === AccountAllReceiveEnum.ENABLED);
  if (allReceiveAccount && allReceiveAccount.accountId !== account.accountId) allReceiveAccount.allReceive = AccountAllReceiveEnum.DISABLED;
  account.allReceive = account.allReceive === AccountAllReceiveEnum.DISABLED ? AccountAllReceiveEnum.ENABLED : AccountAllReceiveEnum.DISABLED;
  accountSetAllReceive(account.accountId).then(() => {
    if (account.allReceive === AccountAllReceiveEnum.ENABLED) {
      ElMessage({
        message: t('setSuccess'),
        type: 'success',
        plain: true,
      })
    }
    changeAccount(account);
    emailStore.emailScroll?.refreshList();
    emailStore.sendScroll?.refreshList();
  }).catch(() => {
    account.allReceive = account.allReceive === AccountAllReceiveEnum.DISABLED ? AccountAllReceiveEnum.ENABLED : AccountAllReceiveEnum.DISABLED;
    if (allReceiveAccount) allReceiveAccount.allReceive = AccountAllReceiveEnum.ENABLED;
  })
}


function showNullSetting(item) {
  return !hasPerm('email:send') && !(item.accountId !== userStore.user.account.accountId && hasPerm('account:delete'))
}

function itemBg(accountId) {
  return accountStore.currentAccountId === accountId ? 'item-choose' : ''
}



function remove(account) {
  ElMessageBox.confirm(t('delConfirm', {msg: account.email}), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {
    accountDelete(account.accountId).then(() => {
      const index = accounts.findIndex(item => item.accountId === account.accountId);
      accounts.splice(index, 1);
      if (accounts.length < queryParams.size) {
        getAccountList()
      }
      ElMessage({
        message: t('delSuccessMsg'),
        type: 'success',
        plain: true,
      })
    }).catch(() => {})
  });
}

function refresh() {
  if (loading.value) {
    return
  }
  loading.value = false
  followLoading.value = false
  noLoading.value = false
  queryParams.accountId = 0
  queryParams.lastSort = null
  getSkeletonRows();
  scrollbarRef.value.setScrollTop(0)
  accounts.splice(0, accounts.length)
  getAccountList()
}

function changeAccount(account) {
  accountStore.currentAccountId = account.accountId
  accountStore.currentAccount = account
}

function add() {
  addForm.suffix = addForm.suffix || settingStore.domainList[0]
  addTab.value = 'create'
  showAdd.value = true
  setTimeout(() => {
    addRef.value.focus()
  }, 100)
}

async function submitBind() {
  if (!bindForm.email || !bindForm.password) return
  bindLoading.value = true
  try {
    const accountRow = await accountBind(bindForm.email, bindForm.password)
    showAdd.value = false
    bindForm.email = ''
    bindForm.password = ''
    accounts.length = 0
    noLoading.value = false
    await getAccountList()
    accountStore.setCurrentAccount(accountRow)
    emailStore.emailScroll?.refreshList?.()
  } catch(e) {
    // error shown by axios interceptor
  } finally {
    bindLoading.value = false
  }
}

function setAsTop(account, index) {
  accountSetAsTop(account.accountId).then(() => {
    ElMessage({
      message: t('setSuccess'),
      type: 'success',
      plain: true,
    })

    const [item] = accounts.splice(index, 1);
    accounts.splice(1, 0, item);

  }).catch(() => {});
}

function emailInitial(email, name) {
  if (name && name.trim()) return name.trim()[0].toUpperCase()
  return (email || '').charAt(0).toUpperCase()
}

async function copyAccount(account) {
  try {
    await navigator.clipboard.writeText(account);
    ElMessage({
      message: t('copySuccessMsg'),
      type: 'success',
      plain: true,
    })
  } catch (err) {
    console.error(`${t('copyFailMsg')}:`, err);
    ElMessage({
      message: t('copyFailMsg'),
      type: 'error',
      plain: true,
    })
  }
}

function getAccountList() {

  if (loading.value || followLoading.value || noLoading.value) return;

  if (accounts.length === 0) {
    loading.value = true
  } else {
    followLoading.value = true
  }

  let start = Date.now();

  const accountId = accounts.length > 0 ? accounts.at(-1).accountId : 0;
  const lastSort = accounts.length > 0 ? accounts.at(-1).sort : null;

  accountList(accountId, queryParams.size, lastSort).then(async list => {

    let end = Date.now();
    let duration = end - start;
    if (duration < 300) {
      await sleep(300 - duration)
    }

    if (list.length < queryParams.size) {
      noLoading.value = true
    }
    if (accounts.length === 0) {
      accountStore.currentAccount = list[0]
    }

    accounts.push(...list)

    loading.value = false
    followLoading.value = false
    first = false
  }).catch(() => {
    loading.value = false
    followLoading.value = false
  })
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

  if (addForm.email.length < settingStore.settings.minEmailPrefix) {
    ElMessage({
      message: t('minEmailPrefix', {msg: settingStore.settings.minEmailPrefix}),
      type: 'error',
      plain: true,
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

  if (!verifyToken && (settingStore.settings.addEmailVerify === 0 || (settingStore.settings.addEmailVerify === 2 && settingStore.settings.addVerifyOpen))) {
    if (!verifyShow.value) {
      verifyShow.value = true
      nextTick(() => {
        if (!turnstileId) {
          try {
            turnstileId = window.turnstile.render('.add-email-turnstile')
          } catch (e) {
            botJsError.value = true
            console.log('人机验证js加载失败')
          }
        } else {
          window.turnstile.reset('.add-email-turnstile')
        }
      })
    } else if (!botJsError.value) {
      ElMessage({
        message: t('botVerifyMsg'),
        type: "error",
        plain: true
      })
    }
    return;
  }

  addLoading.value = true
  accountAdd(addForm.email + addForm.suffix, verifyToken).then(account => {
    addLoading.value = false
    showAdd.value = false
    addForm.email = ''
    accounts.push(account)
    verifyToken = ''
    settingStore.settings.addVerifyOpen = account.addVerifyOpen
    ElMessage({
      message: t('addSuccessMsg'),
      type: "success",
      plain: true
    })
    verifyShow.value = false
    userStore.refreshUserInfo()
  }).catch(res => {
    if (res.code === 400) {
      verifyToken = ''
      if (turnstileId) {
        window.turnstile.reset(turnstileId)
      } else {
        nextTick(() => {
          turnstileId = window.turnstile.render('.add-email-turnstile')
        })
      }
      verifyShow.value = true
    }
    addLoading.value = false
  })
}
</script>
<style>
path[fill="#ffdda1"] {
  fill: #ffdd7d;
}
</style>
<style scoped lang="scss">
.account-box {
  height: 100%;
  overflow: hidden;

  /* ── Toolbar: count on the left, refresh + add on the right ── */
  .head-opt {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 56px;
    padding: 10px 16px 10px 22px;
    border-bottom: 1px solid var(--psg-border);

    .head-count {
      flex: 1;
      min-width: 0;
      font-size: 13px;
      color: var(--psg-text-secondary);
    }

    .icon-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      padding: 0;
      border: 0;
      border-radius: var(--psg-radius-full);
      background: transparent;
      color: var(--psg-text-secondary);
      cursor: pointer;
      transition: background 0.12s, color 0.12s;
      @media (hover: hover) {
        &:hover { background: var(--psg-surface-active); color: var(--psg-text); }
      }
    }

    .add-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      height: 32px;
      padding: 0 14px;
      border: 0;
      border-radius: var(--psg-radius-full);
      background: var(--psg-primary);
      color: var(--psg-on-primary);
      font: inherit;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: filter 0.12s;
      @media (hover: hover) {
        &:hover { filter: brightness(1.06); }
      }
    }

    .icon-btn:focus-visible,
    .add-btn:focus-visible {
      outline: 2px solid var(--psg-focus);
      outline-offset: 2px;
    }
  }

  .scrollbar {
    width: 100%;
    height: calc(100% - 56px);
    overflow: auto;

    .empty {
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100%;
    }
  }

  .btn {
    width: 100%;
    margin-top: 15px;
  }

  /* ── Mailbox row — same rhythm as the label / backup rows ── */
  .item {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 14px 16px 14px 22px;
    border-bottom: 1px solid var(--psg-border);
    cursor: pointer;
    transition: background 0.12s ease;
    &:last-child { border-bottom: 0; }
    @media (hover: hover) {
      &:hover { background: color-mix(in srgb, var(--psg-surface-active) 55%, transparent); }
    }
  }

  /* ── Avatar ── */
  .avatar-photo {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .item-avatar {
    flex-shrink: 0;
    width: 36px;
    height: 36px;
    border-radius: var(--psg-radius-sm);
    background: var(--psg-primary);
    color: var(--psg-on-primary);
    font-weight: 700;
    font-size: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    user-select: none;
    overflow: hidden;
  }

  /* ── Name + badges, address below ── */
  .item-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;

    .item-name-row {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
    }

    .item-name {
      min-width: 0;
      font-size: 14px;
      font-weight: 600;
      color: var(--psg-text);
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    .item-badge {
      flex-shrink: 0;
      padding: 1px 8px;
      border-radius: var(--psg-radius-full);
      background: var(--psg-surface-active);
      color: var(--psg-text-secondary);
      font-size: 11px;
      font-weight: 600;
      line-height: 18px;
    }

    .item-badge-accent {
      background: color-mix(in srgb, var(--psg-primary) 16%, transparent);
      color: var(--psg-primary);
    }

    .item-email {
      font-size: 12px;
      color: var(--psg-text-secondary);
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
  }

  /* ── Actions: always visible (touch has no hover) ── */
  .item-actions {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 2px;

    .action-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      padding: 0;
      border: 0;
      border-radius: var(--psg-radius-full);
      background: transparent;
      color: var(--psg-text-secondary);
      cursor: pointer;
      transition: color 0.12s, background 0.12s;
      @media (hover: hover) {
        &:hover { color: var(--psg-text); background: var(--psg-surface-active); }
      }
      &:focus-visible { outline: 2px solid var(--psg-focus); outline-offset: 1px; }
    }

    .action-active {
      color: var(--psg-primary);
    }
  }

  /* ── Current mailbox: badge carries it; keep a light wash ── */
  .item-choose {
    background: color-mix(in srgb, var(--psg-surface-active) 40%, transparent);
  }

  @media (max-width: 560px) {
    .head-opt { padding: 10px 12px 10px 16px; }
    .item { gap: 12px; padding: 12px 8px 12px 16px; }
    .item-actions { gap: 0; }
  }
}

.suffix-trigger {
  display: flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
  cursor: pointer;
}

/* ── Unified email + domain input in dialogs ── */
:deep(.el-input.el-input-group) {

  /* Input wrapper: only left/top/bottom border, no right */
  .el-input__wrapper {
    border-top:    1px solid var(--psg-border) !important;
    border-bottom: 1px solid var(--psg-border) !important;
    border-left:   1px solid var(--psg-border) !important;
    border-right:  none !important;
    border-radius: var(--psg-radius-sm) !important;
    box-shadow: none !important;
    background: var(--psg-surface) !important;
    transition: border-color 0.15s !important;
  }

  /* Focus: ink border ring */
  .el-input__wrapper.is-focus {
    border-color: var(--psg-focus) !important;
    box-shadow: none !important;
  }

  /* Append: top/right/bottom border, left is the divider */
  .el-input-group__append {
    border-top:    1px solid var(--psg-border) !important;
    border-right:  1px solid var(--psg-border) !important;
    border-bottom: 1px solid var(--psg-border) !important;
    border-left:   1px solid var(--psg-border) !important;
    border-radius: var(--psg-radius-sm) !important;
    box-shadow: none !important;
    background: var(--psg-canvas) !important;
    padding: 0 12px !important;
    font-size: 13px !important;
    font-weight: 500 !important;
    color: var(--psg-text-secondary) !important;
    white-space: nowrap;
  }
}

/* Focus-within: ink border on append too */
:deep(.el-input.el-input-group:focus-within) {
  .el-input-group__append {
    border-top-color:    var(--psg-focus) !important;
    border-right-color:  var(--psg-focus) !important;
    border-bottom-color: var(--psg-focus) !important;
  }
}

:deep(.el-dialog) {
  width: 400px !important;
  border-radius: var(--psg-radius-sm) !important;

  @media (max-width: 440px) {
    width: calc(100% - 40px) !important;
    margin-right: 20px !important;
    margin-left: 20px !important;
  }
}

/* Add email / rename dialog body */
.container {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-bottom: 4px;

  .btn {
    width: 100%;
    margin-top: 4px;
  }

  /* Standalone el-input (no append group) — match grouped input style */
  :deep(.el-input:not(.el-input-group)) {
    .el-input__wrapper {
      border: 1px solid var(--psg-border) !important;
      border-radius: var(--psg-radius-sm) !important;
      box-shadow: none !important;
      background: var(--psg-surface) !important;
      transition: border-color 0.15s !important;
    }
    .el-input__wrapper.is-focus {
      border-color: var(--psg-focus) !important;
      box-shadow: none !important;
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

:deep(.el-pagination .el-select) {
  width: 100px;
  background: var(--psg-surface);
}

.add-email-turnstile {
  margin-top: 15px;
}

.turnstile-show {
  opacity: 1;
}

.turnstile-hide {
  opacity: 0;
  pointer-events: none;
  position: fixed;
}

.bind-tip {
  font-size: 11.5px;
  color: var(--psg-text-secondary);
  line-height: 1.5;
  margin: -2px 0 0;
}

.add-tabs {
  :deep(.el-tabs__header) { margin-bottom: 14px; }
}

</style>
