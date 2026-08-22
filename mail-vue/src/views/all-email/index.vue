<template>
  <div class="email-list-box">
    <!-- ── Page header: identity, not a database-browser title bar ── -->
    <div class="explorer-header">
      <h2 class="explorer-title">{{ $t('allMail') }}</h2>
      <p class="explorer-subtitle">{{ $t('allMailSubtitle') }}</p>
    </div>

    <!-- ── Search: the input itself performs the search, no separate icon button ── -->
    <div class="explorer-search-row">
      <Icon icon="psg:search" width="15" height="15" class="explorer-search-icon"/>
      <input v-model="searchValue" class="explorer-search-input"
             :placeholder="$t('searchAllMailPlaceholder')" @keydown.enter="search"/>
      <button v-if="searchValue" type="button" class="explorer-search-clear"
              :aria-label="$t('clear')" :title="$t('clear')"
              @click="searchValue = ''; search()">
        <Icon icon="psg:close-circle" width="14" height="14" aria-hidden="true"/>
      </button>
    </div>

    <emailScroll ref="sysEmailScroll"
                 class="explorer-body"
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
                 :item-height="88"
                 :hide-inline-search="true"
                 @jump="jumpContent"
                 @refresh-before="refreshBefore"
                 @right-search="rightSearch"
                 :type="'all-email'"
    >
      <template #first>
        <!-- ── Status chips + advanced filter + sort + refresh + overflow ── -->
        <div class="explorer-filters">
          <div class="filter-chips">
            <button type="button" class="filter-chip" :class="{ active: params.type === 'all' }"
                    :aria-pressed="params.type === 'all'" @click="setType('all')">{{ $t('all') }}</button>
            <button type="button" class="filter-chip" :class="{ active: params.type === 'receive' }"
                    :aria-pressed="params.type === 'receive'" @click="setType('receive')">{{ $t('received') }}</button>
            <button type="button" class="filter-chip" :class="{ active: params.type === 'send' }"
                    :aria-pressed="params.type === 'send'" @click="setType('send')">{{ $t('sent') }}</button>
          </div>

          <el-popover trigger="click" placement="bottom-start" width="240" popper-class="explorer-adv-popover">
            <template #reference>
              <button type="button" class="filter-text-btn" :class="{ active: isAdvancedActive }"
                      :aria-label="$t('advancedFilter')" :aria-pressed="isAdvancedActive">
                <span class="filter-text-btn-label">{{ $t('advancedFilter') }}</span>
                <Icon icon="psg:filter" width="13" height="13" class="filter-text-btn-icon" aria-hidden="true"/>
                <Icon icon="psg:chevron-down" width="12" height="12" class="filter-text-btn-chevron" aria-hidden="true"/>
              </button>
            </template>
            <div class="adv-field">
              <label class="adv-label">{{ selectTitle }}</label>
              <el-select v-model="params.searchType" size="default" style="width:100%">
                <el-option key="3" :label="$t('sender')" value="name"/>
                <el-option key="4" :label="$t('subject')" value="subject"/>
                <el-option key="1" :label="$t('user')" value="user"/>
                <el-option key="2" :label="$t('selectEmail')" value="account"/>
              </el-select>
            </div>
            <div class="adv-field">
              <label class="adv-label">{{ $t('all') }}</label>
              <el-select v-model="params.type" size="default" style="width:100%" @change="typeSelectChange">
                <el-option key="1" :label="$t('all')" value="all"/>
                <el-option key="3" :label="$t('received')" value="receive"/>
                <el-option key="2" :label="$t('sent')" value="send"/>
                <el-option key="4" :label="$t('selectDeleted')" value="delete"/>
                <el-option key="5" :label="$t('noRecipientTitle')" value="noone"/>
              </el-select>
            </div>
          </el-popover>

          <button type="button" class="sort-btn" @click="changeTimeSort"
                  :aria-label="params.timeSort !== 0 ? $t('sortOldest') : $t('sortNewest')">
            <span class="sort-btn-label">{{ params.timeSort !== 0 ? $t('sortOldest') : $t('sortNewest') }}</span>
            <Icon icon="psg:sort" width="13" height="13" class="sort-btn-icon" aria-hidden="true"/>
            <Icon icon="psg:chevron-down" width="12" height="12" class="sort-btn-chevron" aria-hidden="true"/>
          </button>

          <!-- High-risk bulk action: tucked behind ⋯, never a primary toolbar icon.
               Refresh itself is emailScroll's own built-in toolbar button, right
               after this slot — no need to duplicate it here. -->
          <el-dropdown trigger="click" placement="bottom-end" @command="handleMoreCommand">
            <button type="button" class="icon-btn-plain more-btn"
                    :aria-label="$t('moreActions')" :title="$t('moreActions')">⋯</button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="cleanup">
                  <div class="ctx-item danger">
                    <Icon icon="psg:clear-format" width="16" height="16"/>
                    <span>{{ $t('clearEmail') }}</span>
                  </div>
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
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
const showBathDelete = ref(false)
const clearLoading = ref(false)

let latestRunning = false
onMounted(() => {
  latestRunning = true
  latest();
})
onUnmounted(() => { latestRunning = false })

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

function setType(type) {
  params.type = type
  search()
}

// Advanced-filter trigger highlights once it holds anything beyond the
// three quick-access chips (all/receive/send) or a non-default search field.
const isAdvancedActive = computed(() =>
  ['delete', 'noone'].includes(params.type) || params.searchType !== 'name'
)

function handleMoreCommand(command) {
  if (command === 'cleanup') openBathDelete()
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

    // The route can unmount the list while the sleep above is resolving.
    // Stop cleanly instead of reading a stale component ref during navigation.
    const latestId = sysEmailScroll.value?.latestEmail?.emailId

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
  display: flex;
  flex-direction: column;
  background: var(--psg-surface);
}

/* ── Page header: title + one-line purpose statement ──────── */
.explorer-header {
  flex-shrink: 0;
  padding: 14px 16px 2px;
}

.explorer-title {
  margin: 0;
  font-family: var(--psg-font-sans);
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0;
  color: var(--psg-text);
}

.explorer-subtitle {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--psg-text-secondary);
}

/* ── Search: the input itself is the action, no separate button ──── */
.explorer-search-row {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 36px;
  margin: 10px 16px 0;
  padding: 0 10px;
  background: var(--psg-canvas);
  border: 1px solid var(--psg-border);
  border-radius: var(--psg-radius-md);
  transition: border-color 0.12s ease;

  &:focus-within {
    border-color: var(--psg-primary);
    box-shadow: 0 0 0 3px var(--psg-primary-muted);
  }
}

.explorer-search-icon {
  color: var(--psg-text-muted);
  flex-shrink: 0;
}

.explorer-search-input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  font-size: 13px;
  color: var(--psg-text);

  &::placeholder { color: var(--psg-text-muted); }
}

.explorer-search-clear {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: var(--psg-radius-xs);
  background: transparent;
  color: var(--psg-text-muted);
  cursor: pointer;
  flex-shrink: 0;
  &:hover { color: var(--psg-text); }
}

/* ── List body: emailScroll fills whatever's left ─────────── */
.explorer-body {
  flex: 1;
  min-height: 0;
}

/* ── Filter row: rendered into emailScroll's own 44px toolbar slot ── */
.explorer-filters {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  padding: 0 6px 0 2px;
  overflow-x: auto;
  scrollbar-width: none;
  &::-webkit-scrollbar { display: none; }
}

.filter-chips {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 3px;
  flex-shrink: 0;
  background: var(--psg-surface-muted);
  border-radius: var(--psg-radius-xs);
}

.filter-chip {
  border: none;
  background: transparent;
  cursor: pointer;
  height: 24px;
  padding: 0 11px;
  font-size: 12px;
  font-weight: 500;
  font-family: var(--psg-font-sans);
  color: var(--psg-text-secondary);
  border-radius: var(--psg-radius-xs);
  transition: background 0.14s ease, color 0.14s ease;
  white-space: nowrap;

  &.active {
    background: var(--psg-surface);
    color: var(--psg-text);
    border: 1px solid var(--psg-border);
    font-weight: 600;
  }
}

.filter-text-btn,
.sort-btn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  height: 26px;
  padding: 0 8px;
  border: 1px solid transparent;
  border-radius: var(--psg-radius-sm);
  background: transparent;
  cursor: pointer;
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 500;
  color: var(--psg-text-secondary);
  white-space: nowrap;
  transition: background 0.10s, color 0.10s;

  @media (hover: hover) {
    &:hover { background: var(--psg-surface-active); color: var(--psg-text); }
  }

  &.active { color: var(--psg-primary); }
}

/* ── Plain icon button: the overflow trigger — icon-only is fine here,
   "More" is convention-enough to not need a label (Refresh, right after
   this slot, is emailScroll's own built-in toolbar button). ── */
.icon-btn-plain {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: 1px solid transparent;
  border-radius: var(--psg-radius-sm);
  background: transparent;
  cursor: pointer;
  flex-shrink: 0;
  color: var(--psg-text-muted);
  transition: background 0.10s, color 0.10s;

  @media (hover: hover) {
    &:hover { background: var(--psg-surface-active); color: var(--psg-text); }
  }
}

.more-btn {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: -1px;
}

.filter-text-btn-icon,
.sort-btn-icon {
  display: none;
}

.filter-text-btn-chevron,
.sort-btn-chevron {
  display: block;
}

/* Advanced-filter popover fields */
.adv-field {
  display: flex;
  flex-direction: column;
  gap: 5px;

  & + .adv-field { margin-top: 12px; }
}

.adv-label {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--psg-text-secondary);
}

.ctx-item {
  display: flex;
  align-items: center;
  gap: 10px;

  &.danger { color: var(--psg-danger); }
}

@media (max-width: 767px) {
  .explorer-header { padding: 12px 14px 0; }
  .explorer-search-row { margin: 8px 14px 0; height: 40px; }
}

/* At the smallest supported phone width, keep every mail action reachable
   instead of letting the filter strip run underneath the fixed refresh
   button. The chips occupy the first line; advanced/sort/more sit on a
   compact second line while refresh remains a stable touch target. */
@media (max-width: 340px) {
  :deep(.mail-toolbar) {
    height: 78px;
  }

  :deep(.mail-toolbar .toolbar-left) {
    align-content: flex-start;
    align-items: flex-start;
    overflow: visible;
  }

  .explorer-filters {
    flex: 1 1 auto;
    flex-wrap: wrap;
    align-content: flex-start;
    row-gap: 4px;
    overflow: visible;
  }

  .filter-text-btn-label,
  .sort-btn-label {
    display: inline;
  }

  .filter-text-btn,
  .sort-btn {
    padding: 0 4px;
  }

  :deep(.mail-toolbar > .toolbar-left > .icon-btn) {
    margin-top: 2px;
  }
}

/* Narrow list pane (or a real mobile viewport, same width class): drop
   text labels on advanced-filter/sort down to icon-only so the row of
   controls doesn't force horizontal scrolling before it has to. */
@container mail-scroll (max-width: 480px) {
  .filter-text-btn-label,
  .sort-btn-label {
    display: none;
  }

  .filter-text-btn-icon,
  .sort-btn-icon {
    display: block;
  }

  .filter-text-btn-chevron,
  .sort-btn-chevron {
    display: none;
  }

  .filter-text-btn,
  .sort-btn {
    padding: 0 6px;
  }
}

@media (max-width: 340px) {
  .filter-text-btn-label,
  .sort-btn-label {
    display: inline;
  }

  .filter-text-btn,
  .sort-btn {
    padding: 0 4px;
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
