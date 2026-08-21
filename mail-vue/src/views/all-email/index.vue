<template>
  <div class="email-list-box">
    <emailScroll ref="sysEmailScroll"
                 :get-emailList="getEmailList"
                 :email-delete="allEmailDelete"
                 :star-add="starAdd"
                 :star-cancel="starCancel"
                 :show-star="false"
                 show-user-info
                 show-status
                 actionLeft="4px"
                 :show-account-icon="false"
                 :time-sort="params.timeSort"
                 :item-height="65"
                 :hide-inline-search="true"
                 @jump="jumpContent"
                 @refresh-before="refreshBefore"
                 @right-search="rightSearch"
                 :type="'all-email'"
    >
      <template #first>
        <!-- ── Unified search group ── -->
        <div class="search-group">
          <!-- Type selector -->
          <div class="type-pill" @click.stop="openSelect">
            <el-select ref="mySelect" v-model="params.searchType" class="select">
              <el-option key="3" :label="$t('sender')" :value="'name'"/>
              <el-option key="4" :label="$t('subject')" :value="'subject'"/>
              <el-option key="1" :label="$t('user')" :value="'user'"/>
              <el-option key="2" :label="$t('selectEmail')" :value="'account'"/>
            </el-select>
            <span class="type-label">{{ selectTitle }}</span>
            <Icon icon="solar:alt-arrow-down-linear" width="13" height="13" class="type-arrow"/>
          </div>
          <!-- Content input -->
          <input v-model="searchValue" class="content-input"
                 :placeholder="$t('searchByContent')" @keydown.enter="search"/>
          <!-- Status filter -->
          <el-select v-model="params.type" class="status-select" @change="typeSelectChange">
            <el-option key="1" :label="$t('all')" value="all"/>
            <el-option key="3" :label="$t('received')" value="receive"/>
            <el-option key="2" :label="$t('sent')" value="send"/>
            <el-option key="4" :label="$t('selectDeleted')" value="delete"/>
            <el-option key="4" :label="$t('noRecipientTitle')" value="noone"/>
          </el-select>
        </div>
        <!-- ── Action icons ── -->
        <Icon class="icon" icon="solar:magnifer-linear" @click="search" width="16" height="16"/>
        <Icon class="icon" @click="changeTimeSort"
              icon="solar:sort-by-time-linear"
              :style="params.timeSort !== 0 ? 'transform:scaleY(-1)' : ''"
              width="17" height="17"/>
        <Icon class="icon icon-danger" icon="solar:broom-linear" width="16" height="16" @click="openBathDelete"/>
      </template>
    </emailScroll>
    <el-dialog v-model="showBathDelete" :title="$t('clearEmail')" width="335"
               @closed="closedClear">
      <div class="clear-email">
        <el-input v-model="clearParams.sendName" :placeholder="$t('sender')"/>
        <el-input v-model="clearParams.subject" :placeholder="$t('subject')"/>
        <el-input v-model="clearParams.sendEmail" :placeholder="$t('sendEmailAddress')"/>
        <el-input v-model="clearParams.toEmail" :placeholder="$t('toEmail')"/>
        <el-date-picker popper-class="my-date-picker"
                        v-model="clearTime"
                        type="daterange"
                        :teleported="false"
                        unlink-panels
                        :range-separator="t('to')"
                        size="default"
        />
        <div class="clear-button">
          <el-select v-model="clearParams.type" style="width: 200px">
            <el-option key="eq" :label="t('equal')" value="eq"/>
            <el-option key="left" :label="t('leading')" value="left"/>
            <el-option key="include" :label="t('include')" value="include"/>
          </el-select>
          <el-button :loading="clearLoading" type="primary" @click="batchDelete">{{ t('clear') }}</el-button>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import {starAdd, starCancel} from "@/request/star.js";
import emailScroll from "@/components/email-scroll/index.vue"
import {computed, defineOptions, reactive, ref, watch, onMounted, onUnmounted} from "vue";
import {useEmailStore} from "@/store/email.js";
import {useUiStore} from "@/store/ui.js";
import {
  allEmailList,
  allEmailDelete,
  allEmailBatchDelete,
  allEmailLatest
} from "@/request/all-email.js";
import {Icon} from "@iconify/vue";
import router from "@/router/index.js";
import {useI18n} from 'vue-i18n';
import {toUtc} from "@/utils/day.js";
import {sleep} from "@/utils/time-utils.js";
import {useSettingStore} from "@/store/setting.js";
import { useRoute } from 'vue-router'

defineOptions({
  name: 'all-email'
})

const route = useRoute()
const {t} = useI18n();
const emailStore = useEmailStore();
const uiStore = useUiStore();
const settingStore = useSettingStore();
const clearTime = ref('')
const sysEmailScroll = ref({})
const searchValue = ref('')
const mySelect = ref()
const showBathDelete = ref(false)
const clearLoading = ref(false)

let latestRunning = false
onMounted(() => {
  latestRunning = true
  latest();
})
onUnmounted(() => { latestRunning = false })

const openSelect = () => {
  mySelect.value.toggleMenu()
}

const params = reactive({
  timeSort: 0,
  type: 'receive',
  userEmail: null,
  accountEmail: null,
  name: null,
  subject: null,
  searchType: 'name'
})

const clearParams = reactive({
  subject: '',
  sendEmail: '',
  sendName: '',
  startTime: '',
  toEmail: '',
  endTime: '',
  type: 'eq',
})

function resetClearParams() {
  clearParams.subject = ''
  clearParams.sendEmail = ''
  clearParams.sendName = ''
  clearParams.startTime = ''
  clearParams.toEmail = ''
  clearParams.endTime = ''
}

function closedClear() {
  resetClearParams()
  clearParams.type = 'eq'
  clearParams.endTime = ''
  clearTime.value = null
}

const selectTitle = computed(() => {
  if (params.searchType === 'user') return t('user')
  if (params.searchType === 'account') return t('selectEmail')
  if (params.searchType === 'name') return t('sender')
  if (params.searchType === 'subject') return t('subject')
})

const paramsStar = localStorage.getItem('all-email-params')
if (paramsStar) {
  const locaParams = JSON.parse(paramsStar)
  params.type = locaParams.type
  params.timeSort = locaParams.timeSort
  params.status = locaParams.status
  params.searchType = locaParams.searchType
}

watch(() => params, () => {
  localStorage.setItem('all-email-params', JSON.stringify(params))
}, {
  deep: true
})

function openBathDelete() {
  showBathDelete.value = true
}

function batchDelete() {

  if (clearTime.value) {
    clearParams.startTime = toUtc(clearTime.value[0]).format("YYYY-MM-DD HH:mm:ss")
    clearParams.endTime = toUtc(clearTime.value[1]).add(1, 'day').format("YYYY-MM-DD HH:mm:ss")
  }

  if (!clearParams.sendEmail && !clearParams.sendName && !clearParams.subject && !clearParams.toEmail && !clearTime.value) {
    showBathDelete.value = false
    return
  }

  ElMessageBox.confirm(
      t('delAllConfirm'),
      {
        confirmButtonText: t('confirm'),
        cancelButtonText: t('cancel'),
        type: 'warning',
      }
  ).then(() => {
    clearLoading.value = true

    allEmailBatchDelete(clearParams).then(() => {
      ElMessage({
        message: t('clearSuccess'),
        type: "success",
        plain: true
      })
      resetClearParams()
      sysEmailScroll.value.refreshList();
    }).finally(() => {
      clearLoading.value = false
    })
  })
}

function rightSearch(type, value) {
  params.searchType = type;
  searchValue.value = value;
  search();
}

function refreshBefore() {
  searchValue.value = null
  params.timeSort = 0
  params.type = 'receive'
  params.userEmail = null
  params.accountEmail = null
  params.name = null
  params.subject = null
  params.searchType = 'name'
}

function search() {

  params.userEmail = null
  params.accountEmail = null
  params.name = null
  params.subject = null

  if (params.searchType === 'user') {
    params.userEmail = searchValue.value
  }

  if (params.searchType === 'account') {
    params.accountEmail = searchValue.value
  }

  if (params.searchType === 'name') {
    params.name = searchValue.value
  }

  if (params.searchType === 'subject') {
    params.subject = searchValue.value
  }

  sysEmailScroll.value.refreshList();
}

function changeTimeSort() {
  params.timeSort = params.timeSort ? 0 : 1
  search()
}

function typeSelectChange() {
  search()
}

function jumpContent(email) {
  emailStore.contentData.email = email
  emailStore.contentData.delType = 'physics'
  emailStore.contentData.showStar = false
  emailStore.contentData.showReply = false
  uiStore.mobileDetailOpen = true
}


function getEmailList(emailId, size) {
  return allEmailList({emailId, size, ...params})
}

async function latest() {

  while (latestRunning) {

    let autoRefresh = settingStore.settings.autoRefresh;

    await sleep(autoRefresh > 1 ? autoRefresh * 1000 : 3000);

    const latestId = sysEmailScroll.value.latestEmail?.emailId

    if (autoRefresh < 2) {
      continue
    }

    if (!latestId && latestId !== 0) {
      continue
    }

    if (route.name !== 'all-email') {
      continue
    }


    if (params.type !== 'receive') {
      continue
    }

    try {

      const curTimeSort = params.timeSort
      let list = await allEmailLatest(latestId)

      if (list.length === 0) {
        continue
      }

      if (params.type !== 'receive') {
        continue
      }

      // 确保回来之后条件没变
      if (params.timeSort !== curTimeSort) {
        continue
      }

      for (let email of list) {

        sysEmailScroll.value.addItem(email)
        await sleep(50)

      }

    } catch (e) {
      if (e.code === 401 || e.code === 403) {
        settingStore.settings.autoRefresh = 0;
      }
      console.error(e)
    }

  }
}

</script>
<style>

@media (max-width: 767px) {
  .el-date-range-picker .el-picker-panel__body {
    min-width: auto;

  }

  .my-date-picker::after {
    content: "";
    position: absolute; /* 脱离文档流，不会撑开 */
    left: 0;
    right: 0;
    height: 20px;
    background: transparent; /* 方便看效果 */
  }

  .el-date-range-picker__content {
    width: 100%;
  }

  .el-date-range-picker {
    width: 300px;
  }

  .el-tooltip .el-picker_popper {
    padding-bottom: 200px;
  }

  .el-date-range-picker__content.is-left {
    border-right: 0;
  }
}

</style>
<style scoped lang="scss">
.email-list-box {
  height: 100%;
  width: 100%;
  overflow: hidden;
}


/* ── Hidden real select (triggered by type-pill) ─────── */
.select {
  position: absolute;
  width: 40px;
  opacity: 0;
  pointer-events: none;
}

/* ── Unified search group: type | input | status ──────── */
.search-group {
  display: flex;
  align-items: stretch;
  height: 30px;
  border: 1px solid var(--psg-border);
  flex: 1 1 100px;
  min-width: 100px;
  max-width: 380px;
  overflow: hidden;

  &:focus-within {
    border-color: var(--psg-primary);
  }
}

.type-pill {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 0 8px;
  border-right: 1px solid var(--psg-border);
  background: var(--psg-surface-muted);
  cursor: pointer;
  flex-shrink: 0;
  user-select: none;
  white-space: nowrap;

  .type-label {
    font-size: 12px;
    color: var(--psg-text-secondary);
  }

  .type-arrow {
    color: var(--psg-text-muted);
  }

  @media (hover: hover) {
    &:hover { background: var(--psg-surface-active); }
  }
}

.content-input {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  padding: 0 8px;
  font-size: 13px;
  color: var(--psg-text);
  outline: none;

  &::placeholder { color: var(--psg-text-muted); }
}

/* status-select: borderless inside the group, left separator only */
.status-select {
  width: 76px;
  flex-shrink: 0;
}

.status-select :deep(.el-select__wrapper) {
  height: 100%;
  min-height: unset;
  padding: 0 6px;
  box-shadow: none !important;
  border: none;
  border-left: 1px solid var(--psg-border);
  border-radius: var(--psg-radius-sm);
  background: var(--psg-surface-muted);
}

.status-select :deep(.el-select__wrapper:hover),
.status-select :deep(.el-select__wrapper.is-focused) {
  box-shadow: none !important;
  background: var(--psg-surface-active);
}

/* ── Action icon buttons ──────────────────────────────── */
.icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid transparent;
  border-radius: var(--psg-radius-sm);
  background: transparent;
  cursor: pointer;
  flex-shrink: 0;
  color: var(--psg-text-muted);
  transition: background 0.10s, color 0.10s;

  @media (hover: hover) {
    &:hover { background: var(--psg-surface-active); color: var(--psg-text); }
    &.icon-danger:hover { background: var(--psg-danger-muted); color: var(--psg-danger); }
  }
}

:deep(.el-date-editor.el-input__wrapper) {
  width: 303px;
}

/* ── Batch clear dialog ───────────────────────────────── */
.clear-email {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.clear-button {
  display: flex;
  align-items: center;
  gap: 15px;

  .el-button { width: 100%; }
}

:deep(.el-date-editor.el-input__wrapper_PLACEHOLDER) {
}

.clear {
  @media (max-width: 419px) {
    position: absolute;
    top: 41px;
    left: 242px;
  }
}

:deep(.delete) {
  @media (max-width: 456px) {
    position: absolute;
    top: 43px;
    left: 294px;
  }

  @media (max-width: 419px) {
    position: absolute;
    top: 43px;
    left: 282px;
  }
}
</style>
