<template>
  <div class="tab-panel">
    <div class="summary-line">{{ $t('validKeysCount', { n: validCount }) }}</div>

    <div class="toolbar">
      <div class="search">
        <el-input v-model="params.code" class="search-input" :placeholder="$t('searchRegKeyDesc')" @keyup.enter="search"/>
      </div>
      <div class="status-pills">
        <button type="button" class="pill" :class="{ active: statusFilter === 'all' }" @click="statusFilter = 'all'">{{ $t('all') }}</button>
        <button type="button" class="pill" :class="{ active: statusFilter === 'valid' }" @click="statusFilter = 'valid'">{{ $t('valid') }}</button>
        <button type="button" class="pill" :class="{ active: statusFilter === 'exhausted' }" @click="statusFilter = 'exhausted'">{{ $t('exhausted') }}</button>
        <button type="button" class="pill" :class="{ active: statusFilter === 'expired' }" @click="statusFilter = 'expired'">{{ $t('expired') }}</button>
      </div>
      <MoreMenu aria-label="More">
        <el-dropdown-item @click="clearNotUse">{{ $t('clearUnusedKeys') }}</el-dropdown-item>
      </MoreMenu>
    </div>

    <div class="keys-body">
      <div class="loading" :class="regKeyLoading ? 'loading-show' : 'loading-hide'" :style="regKeyFirst ? 'background: transparent' : ''">
        <loading/>
      </div>
      <EmptyState v-if="!regKeyLoading && loadError"
                  icon="psg:warning" :title="$t('loadFailedKeys')" :cta-text="$t('retry')" @cta="() => getList(true)"/>
      <EmptyState v-else-if="!regKeyLoading && !regKeyFirst && regKeyData.length === 0 && !hasFilters"
                  icon="psg:key" :title="$t('emptyKeysTitle')" :description="$t('emptyKeysDesc')"
                  :cta-text="$t('createFirstKey')" @cta="openAdd"/>
      <EmptyState v-else-if="!regKeyLoading && !regKeyFirst && filteredKeys.length === 0"
                  icon="psg:search" :title="$t('searchEmptyTitle')" :cta-text="$t('clearFilters')" @cta="clearFiltersFn"/>
      <div class="code-box" v-else>
        <div class="code-item" v-for="item in filteredKeys" :key="item.regKeyId">
          <div class="code-item-head">
            <span class="code" @click="copyCode(item.code)">{{ item.code }}</span>
            <MoreMenu aria-label="Key actions">
              <el-dropdown-item @click="copyCode(item.code)">{{ $t('copy') }}</el-dropdown-item>
              <el-dropdown-item @click="openHistory(item)">{{ $t('history') }}</el-dropdown-item>
              <el-dropdown-item class="danger" divided @click="deleteRegKey(item)">{{ $t('delete') }}</el-dropdown-item>
            </MoreMenu>
          </div>
          <StatusBadge :tone="keyStatus(item) === 'valid' ? 'success' : 'neutral'"
                        :label="keyStatus(item) === 'valid' ? $t('valid') : keyStatus(item) === 'exhausted' ? $t('exhausted') : $t('expired')"/>
          <div class="info-row">
            <span class="info-label">{{ $t('remainingUses') }}</span>
            <span>{{ item.count }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">{{ $t('roleDesc') }}</span>
            <el-tag>{{ item.roleName }}</el-tag>
          </div>
          <div class="info-row">
            <span class="info-label">{{ $t('validUntil') }}</span>
            <span v-if="item.expireTime">{{ formatExpireTime(item.expireTime) }}</span>
            <span v-else>{{ $t('expired') }}</span>
          </div>
          <div class="info-row" v-if="item.createTime">
            <span class="info-label">{{ $t('createdAt') }}</span>
            <span>{{ formatUserCreateTime(item) }}</span>
          </div>
        </div>
      </div>
    </div><!-- /keys-body -->

    <el-drawer v-model="showAdd" direction="rtl" size="min(400px, 100vw)" :title="$t('createKey')"
               :close-on-click-modal="false" @closed="resetForm">
      <div class="container">
        <el-input v-model="addForm.code" :placeholder="$t('regKey')">
          <template #suffix>
            <Icon @click.stop="genCode" class="gen-code" icon="psg:refresh" width="24" height="24"/>
          </template>
        </el-input>
        <el-select v-model="addForm.roleId" :placeholder="$t('roleDesc')">
          <el-option v-for="item in roleList" :label="item.name" :value="item.roleId" :key="item.roleId"/>
        </el-select>
        <el-date-picker
            v-model="addForm.expireTime"
            type="date"
            :placeholder="$t('validUntil')"
        />
        <el-input-number v-model="addForm.count" :min="1" :max="99999"/>
      </div>
      <template #footer>
        <el-button @click="showAdd = false">{{ $t('cancel') }}</el-button>
        <el-button type="primary" @click="submit" :loading="addLoading">{{ $t('createKey') }}</el-button>
      </template>
    </el-drawer>

    <el-dialog class="history-list" v-model="showRegKeyHistory" :title="$t('useHistory')">
      <div class="loading" :class="historyLoading ? 'loading-show' : 'loading-hide'">
        <loading/>
      </div>
      <el-table v-if="!historyLoading" :data="historyList" :fit="true" style="height: 100%">
        <el-table-column :min-width="emailColumnWidth" property="email" :label="$t('user')"
                         :show-overflow-tooltip="true"/>
        <el-table-column :width="createTimeColumnWidth" :formatter="formatUserCreateTime" property="createTime"
                         :label="$t('date')" fixed="right" :show-overflow-tooltip="true"/>
      </el-table>
    </el-dialog>
  </div>
</template>

<script setup>
import {computed, defineExpose, reactive, ref, watch} from "vue"
import {Icon} from "@iconify/vue";
import loading from "@/components/loading/index.vue";
import StatusBadge from "./components/StatusBadge.vue";
import MoreMenu from "./components/MoreMenu.vue";
import EmptyState from "./components/EmptyState.vue";
import {useSettingStore} from "@/store/setting.js";
import {roleSelectUse} from "@/request/role.js";
import {useRoleStore} from "@/store/role.js";
import {regKeyAdd, regKeyList, regKeyClearNotUse, regKeyDelete, regKeyHistory} from "@/request/reg-key.js";
import {getTextWidth} from "@/utils/text.js";
import dayjs from "dayjs";
import {tzDayjs} from "@/utils/day.js";
import {useI18n} from "vue-i18n";

const roleStore = useRoleStore();
const settingStore = useSettingStore();
const params = reactive({
  code: '',
})

const {t} = useI18n()
const roleList = reactive([])
const addLoading = ref(false)
const showAdd = ref(false)
const regKeyLoading = ref(true)
const regKeyFirst = ref(true)
const showRegKeyHistory = ref(false)
const historyList = reactive([])
const emailColumnWidth = ref(0)
const createTimeColumnWidth = ref(0)
const historyLoading = ref(false)
const statusFilter = ref('all')
const loadError = ref(false)

const addForm = reactive({
  code: '',
  count: 1,
  roleId: null,
  expireTime: null
})

const regKeyData = reactive([])

const hasFilters = computed(() => !!params.code || statusFilter.value !== 'all')

function keyStatus(item) {
  if (!item.expireTime) return 'expired'
  if (!item.count) return 'exhausted'
  return 'valid'
}

const validCount = computed(() => regKeyData.filter(item => keyStatus(item) === 'valid').length)

const filteredKeys = computed(() => {
  if (statusFilter.value === 'all') return regKeyData
  return regKeyData.filter(item => keyStatus(item) === statusFilter.value)
})

function clearFiltersFn() {
  params.code = ''
  statusFilter.value = 'all'
  getList(true)
}

getList(true)

roleSelectUse().then(list => {
  roleList.length = 0
  roleList.push(...list)
})

watch(() => roleStore.refresh, () => {
  roleSelectUse().then(list => {
    roleList.length = 0
    roleList.push(...list)
  })
})

function openHistory(regKey) {

  historyList.length = 0
  historyLoading.value = true
  regKeyHistory(regKey.regKeyId).then(list => {

    historyList.push(...list)
    if (list.length > 0) {

      const email = list.reduce((a, b) =>
          compareByLengthAndUpperCase(a, b, 'email')
      ).email;

      emailColumnWidth.value = getTextWidth(email) + 30
      emailColumnWidth.value = emailColumnWidth.value < 300 ? emailColumnWidth.value : 300
      const createTime = list.reduce((a, b) =>
          compareByLengthAndUpperCase(a, b, 'createTime')
      ).createTime;
      createTimeColumnWidth.value = getTextWidth(createTime)
    }

  }).finally(() => {
    historyLoading.value = false
  })

  showRegKeyHistory.value = true
}

const compareByLengthAndUpperCase = (a, b, key) => {
  const getUpperCaseCount = (str) => (str.match(/[A-Z]/g) || []).length;
  if (a[key].length === b[key].length) {
    return getUpperCaseCount(a[key]) > getUpperCaseCount(b[key]) ? a : b;
  }
  return a[key].length > b[key].length ? a : b;
};

function formatUserCreateTime(regKey) {
  const createTime = tzDayjs(regKey.createTime);
  const currentYear = dayjs().year();
  const expireYear = createTime.year();

  if (settingStore.lang === 'en') {

    if (expireYear === currentYear) {
      return createTime.format('MMM D, HH:mm');
    } else {
      return createTime.format('MMM D, YYYY HH:mm');
    }

  } else {

    if (expireYear === currentYear) {
      return createTime.format('M月D日 HH:mm');
    } else {
      return createTime.format('YYYY年M月D日 HH:mm');
    }

  }

}

function formatExpireTime(expireTime) {
  const expireDate = tzDayjs(expireTime);
  const currentYear = dayjs().year();
  const expireYear = expireDate.year();

  if (settingStore.lang === 'en') {

    return expireYear === currentYear
        ? expireDate.format('MMM D')
        : expireDate.format('MMM D, YYYY');

  } else {

    return expireYear === currentYear
        ? expireDate.format('M月D日')
        : expireDate.format('YYYY年M月D日');

  }
}

function search() {
  getList(true)
}

function getList(showLoading = false) {
  if (showLoading) {
    regKeyLoading.value = true
  }
  loadError.value = false
  regKeyList(params).then(list => {
    regKeyData.length = 0
    regKeyData.push(...list)
    regKeyLoading.value = false
    setTimeout(() => {
      regKeyFirst.value = false
    },200)
  }).catch(() => {
    loadError.value = true
    regKeyLoading.value = false
    setTimeout(() => {
      regKeyFirst.value = false
    }, 200)
  })
}

async function copyCode(code) {
  try {
    await navigator.clipboard.writeText(code);
    ElMessage({
      message: t('copySuccessMsg'),
      type: 'success',
      plain: true,
    })
  } catch (err) {
    console.error('copy failed:', err);
    ElMessage({
      message: t('copyFailMsg'),
      type: 'error',
      plain: true,
    })
  }
}

function genCode() {
  addForm.code = generateRandomCode()
}

function generateRandomCode(length = 8) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function clearNotUse() {
  ElMessageBox.confirm(t('clearRegKey'), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {
    regKeyClearNotUse().then(() => {
      ElMessage({
        message: t('clearSuccess'),
        type: 'success',
        plain: true,
      })
      getList()
    })
  });
}

function submit() {

  if (!addForm.code) {
    ElMessage({
      message: t('emptyRegKeyMsg'),
      type: "error",
      plain: true
    })
    return
  }

  if (!addForm.roleId) {
    ElMessage({
      message: t('emptyRole'),
      type: "error",
      plain: true
    })
    return
  }

  if (!addForm.expireTime) {
    ElMessage({
      message: t('emptyTimeMsg'),
      type: "error",
      plain: true
    })
    return
  }

  if (!addForm.count) {
    ElMessage({
      message: t('emptyCountMsg'),
      type: "error",
      plain: true
    })
    return
  }

  addLoading.value = true
  regKeyAdd(addForm).then(() => {
    showAdd.value = false
    resetForm()
    ElMessage({
      message: t('addSuccessMsg'),
      type: "success",
      plain: true
    })
    getList()
  }).finally(() => {
    addLoading.value = false
  })
}

function deleteRegKey(regKey) {
  ElMessageBox.confirm(t('delConfirm', {msg: regKey.code}), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {
    regKeyDelete([regKey.regKeyId]).then(() => {
      getList()
      ElMessage({
        message: t('delSuccessMsg'),
        type: "success",
        plain: true
      })
    })
  });
}

function resetForm() {
  addForm.code = ''
}

function openAdd() {
  genCode()
  showAdd.value = true
}

defineExpose({ openCreate: openAdd })
</script>

<style scoped lang="scss">
.tab-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.summary-line {
  font-size: 13px;
  font-weight: 600;
  color: var(--psg-text-secondary);
  padding: 0 2px;
}

.toolbar {
  padding: 8px 12px;
  min-height: 44px;
  display: flex;
  gap: 8px;
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
    width: min(220px, calc(100vw - 200px));
  }
}

.status-pills {
  display: flex;
  gap: 4px;
  flex-wrap: nowrap;
  overflow-x: auto;
  margin-left: auto;

  .pill {
    flex-shrink: 0;
    padding: 5px 12px;
    font-size: 12.5px;
    font-weight: 600;
    font-family: var(--psg-font-sans);
    color: var(--psg-text-secondary);
    background: transparent;
    border: 1px solid var(--psg-border);
    border-radius: var(--psg-radius-xs);
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.12s, color 0.12s, border-color 0.12s;

    @media (hover: hover) {
      &:not(.active):hover { border-color: var(--psg-border-strong); color: var(--psg-text); }
    }

    &.active {
      background: var(--psg-primary-muted);
      border-color: transparent;
      color: var(--psg-primary);
    }
  }
}

.keys-body {
  position: relative;
  min-height: 140px;

  .code-box {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 14px;

    .code-item {
      background: var(--psg-surface);
      border-radius: var(--psg-radius-md);
      border: 1px solid var(--psg-border);
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      transition: border-color 0.16s ease;

      @media (hover: hover) {
        &:hover { border-color: var(--psg-border-strong); }
      }

      .code-item-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }

      .code {
        font-weight: 700;
        font-family: var(--psg-font-mono);
        font-size: 14px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        cursor: pointer;
        color: var(--psg-text);
      }

      .info-row {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 12.5px;
        color: var(--psg-text-secondary);
      }

      .info-label {
        color: var(--psg-text-muted);
      }
    }
  }
}

:deep(.history-list.el-dialog) {
  min-height: 300px;
  width: 500px !important;
  @media (max-width: 540px) {
    width: calc(100% - 40px) !important;
    margin-right: 20px !important;
    margin-left: 20px !important;
  }
}

.history-list .loading {
  position: absolute;
  top: 10px;
  z-index: 0;
  background: rgba(255, 255, 255, 0);
}

:deep(.history-list .el-dialog__header) {
  padding-bottom: 5px;
}

:deep(.el-scrollbar__view) {
  height: calc(100% - 80px);
}

.loading {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
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

.container {
  display: grid;
  grid-template-columns: 1fr;
  gap: 15px;
  padding: 0 20px;
}

.gen-code {
  color: var(--psg-text-secondary);
  cursor: pointer;
}

:deep(.el-table__inner-wrapper:before) {
  background: var(--psg-surface);
}
</style>
