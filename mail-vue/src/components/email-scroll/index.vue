<template>
  <div class="email-container">

    <!-- ── Toolbar ── -->
    <div class="mail-toolbar">
      <div class="toolbar-left">
        <el-checkbox
          v-model="checkAll"
          :indeterminate="isIndeterminate"
          :disabled="!emailList.length || loading"
          @change="handleCheckAllChange"
        />
        <div v-if="!props.hideInlineSearch" class="toolbar-search" :class="{ 'has-value': searchQuery }">
          <Icon icon="solar:magnifer-linear" width="15" height="15" class="search-icon-inline"/>
          <input
            ref="searchInputRef"
            v-model="searchQuery"
            class="search-input-inline"
            :placeholder="$t('searchPlaceholder')"
            @keydown.esc="searchQuery = ''"
          />
          <Icon v-if="searchQuery" icon="solar:close-circle-linear" width="15" height="15"
                class="search-clear-inline" @click="searchQuery = ''" />
        </div>
        <div class="unread-filter" v-if="showUnread">
          <button class="filter-pill" :class="{ active: !unreadOnly }" @click="unreadOnly = false">{{ $t('all') }}</button>
          <button class="filter-pill" :class="{ active: unreadOnly }" @click="unreadOnly = true">{{ $t('unreadOnly') }}</button>
        </div>
        <slot name="first"></slot>
        <button class="icon-btn" @click="refresh">
          <Icon icon="solar:refresh-linear" width="17" height="17" />
        </button>
        <button v-perm="'email:delete'" class="icon-btn icon-danger"
                v-if="getSelectedMailsIds().length > 0" @click="handleDelete">
          <Icon icon="solar:trash-bin-trash-linear" width="17" height="17" />
        </button>
        <el-tooltip v-if="getSelectedMailsIds().length > 0 && props.type !== 'draft'"
                    :content="$t('exportEml')" placement="bottom">
          <button class="icon-btn" @click="handleExportEml">
            <Icon icon="solar:download-linear" width="17" height="17" />
          </button>
        </el-tooltip>
        <button class="icon-btn" v-if="getSelectedMailsIds().length > 0 && showUnread" @click="handleRead">
          <Icon icon="solar:letter-opened-linear" width="19" height="19" />
        </button>
        <el-tooltip v-if="getSelectedMailsIds().length === 0 && unreadCount > 0 && showUnread"
                    :content="$t('markAllRead')" placement="bottom">
          <button class="icon-btn" @click="handleMarkAllRead">
            <Icon icon="solar:letter-opened-linear" width="19" height="19" />
          </button>
        </el-tooltip>
        <!-- Count pushed to right edge via margin-left:auto -->
        <span class="mail-count" v-if="total && !searchQuery.trim()">{{ $t('emailCount', { total }) }}</span>
        <span class="mail-count" v-if="searchQuery.trim()">{{ $t('searchResultCount', { count: searchResultCount }) }}</span>
      </div>
    </div>

    <!-- ── Email list ── -->
    <div ref="scroll" class="scroll"
      @touchstart.passive="ptrTouchStart"
      @touchmove.passive="ptrTouchMove"
      @touchend.passive="ptrTouchEnd"
    >
      <div class="ptr-bar" :style="ptrBarStyle">
        <Icon icon="solar:refresh-linear" width="20"
          :class="{ 'ptr-spin': ptrSpinning }"
          :style="{ transform: ptrSpinning ? '' : `rotate(${ptrAngle}deg)`, opacity: ptrOpacity }" />
      </div>
      <UseVirtualList
        ref="scrollbarRef"
        @scroll="onScroll"
        :list="list"
        :options="{ itemHeight: itemHeight, overscan: 15 }"
        class="virtual"
        style="height: 100%"
        v-if="!loading && emailList.length > 0"
        :key="keyCount"
      >
        <template #default="{ data: item }">

          <!-- ── Mail row (Brutalist table layout) ── -->
          <div class="mail-row-wrap" v-if="!item.expand"
            @touchstart.passive="swipeTouchStart($event, item)"
            @touchmove="swipeTouchMove($event, item)"
            @touchend.passive="swipeTouchEnd($event, item)"
          >
            <div class="swipe-bg swipe-bg--delete" :style="{ opacity: swipeDeleteOpacity(item) }">
              <Icon icon="solar:trash-bin-trash-linear" width="18" /><span>{{ $t('delete') }}</span>
            </div>
            <div v-if="showStar" class="swipe-bg swipe-bg--star" :style="{ opacity: swipeStarOpacity(item) }">
              <Icon icon="solar:star-bold" width="18" /><span>{{ $t('star') }}</span>
            </div>
            <div
              class="mail-row"
              :style="rowSwipeStyle(item)"
              :class="[props.type, { 'is-unread': item.unread === EmailUnreadEnum.UNREAD && showUnread }]"
              :data-active="item.rightChecked || undefined"
              @click="onRowClick($event, item)"
              @contextmenu="handleContextmenu($event, item)"
            >
              <!-- Col 1: Checkbox + unread dot -->
              <div class="row-check">
                <div class="unread-indicator" :class="{ visible: item.unread === EmailUnreadEnum.UNREAD && showUnread }"></div>
                <el-checkbox class="mail-cb" v-model="item.checked" @click.stop />
              </div>

              <!-- Col 2: Sender -->
              <div class="row-sender">
                <div class="sender-avatar" :style="{ background: senderBg(item) }">
                  <span class="sender-avatar-letter">{{ senderLetter(item) }}</span>
                  <img v-if="senderImg(item)" :src="senderImg(item)" class="sender-avatar-img"
                       @error="e => { e.target.style.display = 'none'; markGravatarMiss(item.sendEmail) }" />
                </div>
                <div class="email-status-inline" v-if="showStatus">
                  <el-tooltip effect="dark" :content="item.statusIcon?.content">
                    <Icon :icon="item.statusIcon?.icon" :style="`color: ${item.statusIcon?.color}`"
                          width="14" height="14" />
                  </el-tooltip>
                </div>
                <span class="mail-name">
                  <slot name="name" :email="item">{{ item.name }}</slot>
                </span>
                <Icon v-if="item.isStar && showStar" icon="fluent-color:star-16" width="12" height="12" class="sender-star" />
              </div>

              <!-- Col 3: Subject + snippet -->
              <div class="row-subject-cell">
                <span v-if="item.code" class="code-tag" @click.stop="copyCode(item.code)">
                  [{{ t('codeLabel') }}{{ item.code }}]
                </span>
                <span class="subject-text">
                  <slot name="subject" :email="item">{{ item.subject || '​' }}</slot>
                </span>
                <span class="mail-preview-inline">{{ item.formatText ? ' — ' + item.formatText : '' }}</span>
                <div class="user-info-inline" v-if="showUserInfo">
                  <span>{{ item.userEmail }}</span>
                  <span>→ {{ item.type === 0 ? item.toEmail : item.sendEmail }}</span>
                </div>
              </div>

              <!-- Col 4: Time + actions -->
              <div class="row-meta">
                <span class="mail-time">{{ item.formatCreateTime }}</span>
                <div class="mail-actions">
                  <button v-if="archiveEmail" class="icon-btn" :title="$t('archive')"
                          @click.stop="archiveEmail(item.emailId)">
                    <Icon icon="solar:archive-linear" width="14" height="14" />
                  </button>
                  <button v-if="restoreEmail" class="icon-btn" :title="$t('restore')"
                          @click.stop="restoreEmail(item.emailId)">
                    <Icon icon="solar:inbox-out-linear" width="14" height="14" />
                  </button>
                  <button v-if="showStar" class="icon-btn" :title="$t('star')"
                          @click.stop="starChange(item)">
                    <Icon :icon="item.isStar ? 'fluent-color:star-16' : 'solar:star-line-duotone'"
                          :width="14" :height="14" />
                  </button>
                  <button v-perm="'email:delete'" class="icon-btn icon-danger" :title="$t('delete')"
                          @click.stop="rightDeleteItem(item)">
                    <Icon icon="solar:trash-bin-trash-linear" width="14" height="14" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <skeletonBlock v-else-if="item.expand === 'loading'"
                         :rows="1" :showStar="showStar" :accountShow="accountShow"
                         :showStatus="showStatus" :showUserInfo="showUserInfo" :type="type" />
          <div class="no-more" v-else-if="item.expand === 'noMoreData'">
            {{ $t('noMoreData') }}
          </div>
        </template>
      </UseVirtualList>

      <skeletonBlock v-if="firstLoad && showFirstLoading"
                     :rows="20" :showStar="showStar" :accountShow="accountShow"
                     :showStatus="showStatus" :showUserInfo="showUserInfo" :type="type" />
      <skeletonBlock v-if="loading"
                     :rows="skeletonRows" :showStar="showStar" :accountShow="accountShow"
                     :showStatus="showStatus" :showUserInfo="showUserInfo" :type="type" />
      <div class="empty" v-if="noLoading && emailList.length === 0 && !loading">
        <el-empty :description="$t('noMessagesFound')" />
      </div>
      <div class="empty" v-if="searchQuery.trim() && searchResultCount === 0 && emailList.length > 0 && !loading">
        <el-empty :description="$t('noSearchResults')" />
      </div>
    </div>

    <!-- Context menu -->
    <el-dropdown
      ref="dropdownRef"
      @visible-change="visibleChange"
      :virtual-ref="triggerRef"
      :show-arrow="false"
      :popper-options="{ modifiers: [{ name: 'offset', options: { offset: [0, 0] } }] }"
      virtual-triggering
      trigger="contextmenu"
      placement="bottom-start"
    >
      <template #dropdown>
        <el-dropdown-menu>
          <el-dropdown-item v-if="rightClickEmail.code" @click="copyCode(rightClickEmail.code)">
            <div class="ctx-item"><Icon icon="fluent-color:clipboard-24" width="18" height="18" /><span>{{ t('copyCode') }}</span></div>
          </el-dropdown-item>
          <el-dropdown-item v-if="['email'].includes(props.type)" @click="emailRead(rightClickEmail.emailId)">
            <div class="ctx-item"><Icon icon="solar:letter-opened-linear" width="18" height="18" /><span>{{ t('markAsRead') }}</span></div>
          </el-dropdown-item>
          <el-dropdown-item v-if="['email','star'].includes(props.type)" @click="openReply(rightClickEmail)">
            <div class="ctx-item"><Icon icon="solar:reply-linear" width="18" height="18" /><span>{{ t('reply') }}</span></div>
          </el-dropdown-item>
          <el-dropdown-item v-if="['email','star'].includes(props.type)" @click="openReplyAll(rightClickEmail)">
            <div class="ctx-item"><Icon icon="solar:reply-all-linear" width="18" height="18" /><span>{{ t('replyAll') }}</span></div>
          </el-dropdown-item>
          <el-dropdown-item v-if="['email','send','star'].includes(props.type)" @click="openForward(rightClickEmail)">
            <div class="ctx-item"><Icon icon="solar:arrow-right-up-linear" width="17" height="17" /><span>{{ t('forward') }}</span></div>
          </el-dropdown-item>
          <el-dropdown-item v-if="['email','send','star'].includes(props.type)" @click="starChange(rightClickEmail)">
            <div class="ctx-item"><Icon icon="solar:star-line-duotone" width="17" height="17" /><span>{{ t('star') }}</span></div>
          </el-dropdown-item>
          <el-dropdown-item v-if="props.type === 'all-email'" @click="handleSearch('user', rightClickEmail.userEmail)">
            <div class="ctx-item"><Icon icon="solar:magnifer-linear" width="18" height="18" /><span>{{ t('searchUser') }}</span></div>
          </el-dropdown-item>
          <el-dropdown-item v-if="props.type === 'all-email'" @click="handleSearch('account', rightClickEmail.toEmail)">
            <div class="ctx-item"><Icon icon="solar:magnifer-linear" width="18" height="18" /><span>{{ t('searchEmail') }}</span></div>
          </el-dropdown-item>
          <el-dropdown-item v-if="props.type === 'all-email'" @click="handleSearch('name', rightClickEmail.name)">
            <div class="ctx-item"><Icon icon="solar:magnifer-linear" width="18" height="18" /><span>{{ t('searchSender') }}</span></div>
          </el-dropdown-item>
          <el-dropdown-item v-if="props.type === 'email'" @click="archiveAction(rightClickEmail.emailId)">
            <div class="ctx-item"><Icon icon="solar:archive-linear" width="18" height="18" /><span>{{ t('archive') }}</span></div>
          </el-dropdown-item>
          <el-dropdown-item v-if="props.type === 'archive'" @click="unarchiveAction(rightClickEmail.emailId)">
            <div class="ctx-item"><Icon icon="solar:inbox-out-linear" width="18" height="18" /><span>{{ t('unarchive') }}</span></div>
          </el-dropdown-item>
          <el-dropdown-item v-if="props.type === 'trash'" @click="restoreAction(rightClickEmail.emailId)">
            <div class="ctx-item"><Icon icon="solar:inbox-out-linear" width="18" height="18" /><span>{{ t('restore') }}</span></div>
          </el-dropdown-item>
          <el-dropdown-item v-if="props.type === 'email'" @click="markSpamAction(rightClickEmail.emailId)">
            <div class="ctx-item"><Icon icon="solar:danger-triangle-linear" width="18" height="18" /><span>{{ t('markAsSpam') }}</span></div>
          </el-dropdown-item>
          <el-dropdown-item v-if="props.type === 'spam'" @click="unmarkSpamAction(rightClickEmail.emailId)">
            <div class="ctx-item"><Icon icon="solar:check-circle-linear" width="18" height="18" /><span>{{ t('notSpam') }}</span></div>
          </el-dropdown-item>
          <el-dropdown-item @click="rightDelete(rightClickEmail.emailId)">
            <div class="ctx-item danger"><Icon icon="solar:trash-bin-trash-linear" width="18" height="18" /><span>{{ t('delete') }}</span></div>
          </el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>

  </div>
</template>

<script setup>
import {Icon} from "@iconify/vue";
import skeletonBlock from "@/components/email-scroll/skeleton/index.vue"
import {computed, onActivated, reactive, ref, watch, nextTick, onMounted, onUnmounted } from "vue";
import {useEmailStore} from "@/store/email.js";
import {useUiStore} from "@/store/ui.js";
import {useSettingStore} from "@/store/setting.js";
import {sleep} from "@/utils/time-utils.js"
import { avatarBg, avatarLetter, storedAvatar, gravatarCandidate, markGravatarMiss } from '@/utils/avatar.js'
import { useAvatarCacheStore } from '@/store/avatar-cache.js'
import {fromNow} from "@/utils/day.js";
import {useI18n} from "vue-i18n";
import {EmailUnreadEnum} from "@/enums/email-enum.js";
import { UseVirtualList } from '@vueuse/components'
import { useScroll } from '@vueuse/core'
import { downloadEml } from '@/utils/download-eml.js'

const props = defineProps({
  getEmailList: Function,
  emailDelete: Function,
  emailRead: Function,
  starAdd: Function,
  starCancel: Function,
  cancelSuccess: Function,
  starSuccess: Function,
  actionLeft: { type: String, default: '0' },
  timeSort: { type: Number, default: 0 },
  showStatus: { type: Boolean, default: false },
  showAccountIcon: { type: Boolean, default: true },
  showUserInfo: { type: Boolean, default: false },
  showStar: { type: Boolean, default: true },
  allowStar: { type: Boolean, default: true },
  type: { type: String, default: 'email' },
  showFirstLoading: { type: Boolean, default: true },
  showUnread: { type: Boolean, default: false },
  spamEmail: { type: Function, default: null },
  unspamEmail: { type: Function, default: null },
  archiveEmail: { type: Function, default: null },
  unarchiveEmail: { type: Function, default: null },
  restoreEmail: { type: Function, default: null },
  hideInlineSearch: { type: Boolean, default: false },
})

const emit = defineEmits(['jump', 'refresh-before', 'delete-draft', 'right-search'])
const {t} = useI18n()
const settingStore = useSettingStore()
const uiStore = useUiStore();
const emailStore = useEmailStore();
const loading = ref(false);
const followLoading = ref(false);
const noLoading = ref(false);
const emailList = reactive([])
const expandList = reactive([])
const total = ref(0);
const checkAll = ref(false);
const isIndeterminate = ref(false);
const scroll = ref(null)
const firstLoad = ref(true)
let scrollTop = 0
const latestEmail = ref(null)
const scrollbarRef = ref(null)
let reqLock = false
let viewportWidth = ref(innerWidth)
let isMobile = ref(innerWidth < 1367)
let skeletonRows = 0
const keyCount = ref(0);
const dropdownRef = ref(null);
const dropdownCloseLock = ref(false);
const dropdownShow = ref(false);
const rightClickEmail = ref({});
const searchQuery = ref('');
const unreadOnly = ref(false);
const searchInputRef = ref(null);
const checkedEmailCount = ref(0);
let timer = null
const position = ref(DOMRect.fromRect({ x: 0, y: 0 }))
const triggerRef = ref({ getBoundingClientRect() { return position.value; } })
const queryParam = reactive({ size: 50 });

const unreadCount = computed(() =>
  props.showUnread ? emailList.filter(e => e.unread === EmailUnreadEnum.UNREAD).length : 0
)

defineExpose({ refreshList, deleteEmail, addItem, handleList, emailList, firstLoad, latestEmail, noLoading, total, unreadCount })

onActivated(() => {
  requestAnimationFrame(() => {
    const index = scrollTop / itemHeight.value
    scrollbarRef.value?.scrollTo(index);
  })
})

const onResize = () => {
  viewportWidth.value = innerWidth
  isMobile.value = innerWidth < 1367
}
const onWheel = () => { if (dropdownShow.value) dropdownRef.value.handleClose() }

onMounted(() => {
  timer = setInterval(() => {
    emailList.forEach(email => { email.formatCreateTime = fromNow(email.createTime); })
  }, 1000 * 60);
  window.addEventListener('resize', onResize)
  window.addEventListener('wheel', onWheel)
})

onUnmounted(() => {
  clearInterval(timer)
  window.removeEventListener('resize', onResize)
  window.removeEventListener('wheel', onWheel)
})

getEmailList()

function onScroll(e) { scrollTop = e.target.scrollTop; }

const { arrivedState } = useScroll(scrollbarRef, { offset: { bottom: 1200 } })

const searchResultCount = computed(() => {
  if (!searchQuery.value.trim()) return emailList.length
  const q = searchQuery.value.toLowerCase()
  return emailList.filter(e => e.name?.toLowerCase().includes(q) || e.subject?.toLowerCase().includes(q)).length
})

const list = computed(() => {
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase()
    return emailList.filter(e => e.name?.toLowerCase().includes(q) || e.subject?.toLowerCase().includes(q))
  }
  if (unreadOnly.value) {
    return emailList.filter(e => e.unread === EmailUnreadEnum.UNREAD)
  }
  return [...emailList, ...expandList]
})

const itemHeight = computed(() => {
  if (viewportWidth.value <= 768) return props.type === 'all-email' ? 112 : 104;
  if (props.type === 'all-email') return isMobile.value ? 72 : 68;
  return isMobile.value ? 64 : 60;
})

watch(itemHeight, () => { keyCount.value++ })

watch(followLoading, (v) => {
  if (v) expandList.push({ emailId: 0, expand: 'loading' })
  else { const i = expandList.findIndex(x => x.expand === 'loading'); if (i > -1) expandList.splice(i, 1); }
})

watch(noLoading, (v) => {
  if (v) expandList.push({ emailId: 0, expand: 'noMoreData' })
  else { const i = expandList.findIndex(x => x.expand === 'noMoreData'); if (i > -1) expandList.splice(i, 1); }
})

watch(() => arrivedState.bottom, (isBottom) => { if (isBottom && !loading.value) loadData(); });

watch(() => emailList.map(item => item.checked), () => {
  if (emailList.length > 0) updateCheckStatus();
}, { deep: true });

watch(() => emailStore.deleteIds, () => { if (emailStore.deleteIds) deleteEmail(emailStore.deleteIds) })
watch(() => emailStore.cancelStarEmailId, () => {
  emailList.forEach(email => { if (email.emailId === emailStore.cancelStarEmailId) email.isStar = 0 })
})
watch(() => emailStore.addStarEmailId, () => {
  emailList.forEach(email => { if (email.emailId === emailStore.addStarEmailId) email.isStar = 1 })
})

function openReply(email) { uiStore.writerRef.openReply(email) }
function openReplyAll(email) { uiStore.writerRef.openReplyAll(email) }
function openForward(email) { uiStore.writerRef.openForward(email) }

function visibleChange(e) {
  dropdownShow.value = e;
  dropdownCloseLock.value = true;
  setTimeout(() => { dropdownCloseLock.value = false; }, 1500)
  if (!e && rightClickEmail.value.rightChecked) rightClickEmail.value.rightChecked = false
}

const handleContextmenu = (event, email) => {
  if (props.type === 'draft') return
  if (rightClickEmail.value.rightChecked) rightClickEmail.value.rightChecked = false
  const { clientX, clientY } = event
  position.value = DOMRect.fromRect({ x: clientX, y: clientY })
  event.preventDefault();
  dropdownRef.value?.handleOpen();
  rightClickEmail.value = email;
  rightClickEmail.value.rightChecked = true
}

function getSkeletonRows() {
  if (emailList.length > 20) return skeletonRows = 20
  if (emailList.length === 0) return skeletonRows = 1
  skeletonRows = emailList.length
}

const accountShow = computed(() => uiStore.accountShow && settingStore.settings.manyEmail === 0)

function htmlToText(email) {
  if (email.content) {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = email.content.replace(/<(img|iframe|object|embed|video|audio|source|link)[^>]*>/gi, '');
    tempDiv.querySelectorAll('script, style, title').forEach(el => el.remove());
    let text = tempDiv.textContent || tempDiv.innerText || '';
    text = text.replace(/\s+/g, ' ').trim();
    return cleanSpace(text)
  }
  if (email.text) return cleanSpace(email.text)
  return ''
}

function cleanSpace(text) {
  return text
    .replace(/[​-‏﻿͏ 　­]/g, '')
    .replace(/\s+/g, ' ').trim();
}

const avatarCache = useAvatarCacheStore()
function senderBg(item) { return avatarBg(item.sendEmail || item.name || '') }
function senderLetter(item) { return avatarLetter(item.name, item.sendEmail) }
function senderImg(item) {
  return avatarCache.get(item.sendEmail) || storedAvatar(item.sendEmail) || gravatarCandidate(item.sendEmail)
}

function starChange(email) {
  if (!email.isStar) {
    if (!props.allowStar) return;
    email.isStar = 1;
    props.starAdd(email.emailId).then(() => { email.isStar = 1; props.starSuccess(email) }).catch(e => { console.error(e); email.isStar = 0 })
  } else {
    email.isStar = 0;
    props.starCancel(email.emailId).then(() => { email.isStar = 0; props.cancelSuccess?.(email) }).catch(e => { console.error(e); email.isStar = 1; })
  }
}

function changeAccountShow() { uiStore.accountShow = !uiStore.accountShow; }

const handleRead = () => { const ids = getSelectedMailsIds(); props.emailRead(ids); localRead(ids); }

function handleMarkAllRead() {
  const ids = emailList.filter(e => e.unread === EmailUnreadEnum.UNREAD).map(e => e.emailId)
  if (!ids.length) return
  props.emailRead(ids)
  localRead(ids)
}

function emailRead(emailId) { props.emailRead([emailId]); localRead([emailId]); }

function localRead(emailIds) {
  emailIds.forEach(emailId => {
    const index = emailList.findIndex(email => email.emailId === emailId);
    if (index > -1) { emailList[index].unread = EmailUnreadEnum.READ; emailList[index].checked = false; }
  })
}

function rightDeleteItem(item) {
  if (props.type === 'draft') {
    emit('delete-draft', [item.draftId])
    return
  }
  rightDelete(item.emailId)
}

function rightDelete(emailId) {
  const doDelete = () => {
    props.emailDelete([emailId]).then(() => {
      ElMessage({ message: t('delSuccessMsg'), type: 'success', plain: true })
      deleteEmail([emailId])
      emailStore.deleteIds = [emailId]
    }).catch(() => {
      ElMessage({ message: t('delFailMsg') || 'Delete failed', type: 'error', plain: true })
    })
  }
  if (props.type === 'all-email') {
    ElMessageBox.confirm(t('delOneEmailConfirm'), { confirmButtonText: t('confirm'), cancelButtonText: t('cancel'), type: 'warning' })
      .then(doDelete)
    return
  }
  if (props.type === 'trash') {
    ElMessageBox.confirm(t('permanentDeleteConfirm'), { confirmButtonText: t('confirm'), cancelButtonText: t('cancel'), type: 'warning' })
      .then(doDelete)
    return
  }
  doDelete()
}

function archiveAction(emailId) { if (props.archiveEmail) props.archiveEmail(emailId) }
function unarchiveAction(emailId) { if (props.unarchiveEmail) props.unarchiveEmail(emailId) }
function restoreAction(emailId) { if (props.restoreEmail) props.restoreEmail(emailId) }
function markSpamAction(emailId) { if (props.spamEmail) props.spamEmail(emailId) }
function unmarkSpamAction(emailId) { if (props.unspamEmail) props.unspamEmail(emailId) }
function handleSearch(type, value) { emit('right-search', type, value); }

async function copyCode(code) {
  try {
    await navigator.clipboard.writeText(code);
    ElMessage({ message: t('copySuccessMsg'), type: 'success', plain: true })
  } catch (err) {
    ElMessage({ message: t('copyFailMsg'), type: 'error', plain: true })
  }
}

function handleDelete() {
  const confirmText = props.type === 'trash' ? t('permanentDeleteConfirm') : t('delEmailsConfirm')
  ElMessageBox.confirm(confirmText, { confirmButtonText: t('confirm'), cancelButtonText: t('cancel'), type: 'warning' })
    .then(() => {
      if (props.type === 'draft') { emit('delete-draft', getSelectedDraftsIds()); return; }
      const emailIds = getSelectedMailsIds()
      props.emailDelete(emailIds).then(() => {
        ElMessage({ message: t('delSuccessMsg'), type: 'success', plain: true })
        deleteEmail(emailIds)
        emailStore.deleteIds = emailIds
      }).catch(() => {
        ElMessage({ message: t('delFailMsg') || 'Delete failed', type: 'error', plain: true })
      })
    })
}

function deleteEmail(emailIds) {
  const idSet = new Set(emailIds)
  for (let i = emailList.length - 1; i >= 0; i--) {
    if (idSet.has(emailList[i].emailId)) emailList.splice(i, 1)
  }
  if (emailList.length < queryParam.size && !noLoading.value) getEmailList()
}

function addItem(email) {
  const existIndex = emailList.findIndex(item => item.emailId === email.emailId)
  if (existIndex > -1) return false;
  email.formatText = htmlToText(email);
  email.formatCreateTime = fromNow(email.createTime);
  if (props.timeSort) {
    if (noLoading.value) { handleList([email]); emailList.push(email); }
    if (email.emailId > latestEmail.value?.emailId) latestEmail.value = email
    total.value++; return true;
  }
  const index = emailList.findIndex(item => item.emailId < email.emailId)
  if (index !== -1) { handleList([email]); emailList.splice(index, 0, email); }
  else if (noLoading.value) { handleList([email]); emailList.push(email); }
  if (email.emailId > latestEmail.value?.emailId) latestEmail.value = email
  total.value++; return true;
}

async function handleExportEml() {
  const emailIds = getSelectedMailsIds()
  for (const emailId of emailIds) {
    try {
      await downloadEml(emailId)
    } catch {
      ElMessage({ message: t('exportEmlFail'), type: 'error', plain: true })
    }
    if (emailIds.length > 1) await sleep(300)
  }
}

function handleCheckAllChange(val) { emailList.forEach(item => item.checked = val); isIndeterminate.value = false; }
function getSelectedMailsIds() { return emailList.filter(item => item.checked).map(item => item.emailId); }
function getSelectedDraftsIds() { return emailList.filter(item => item.checked).map(item => item.draftId); }
function updateCheckStatus() {
  const n = emailList.filter(item => item.checked).length;
  checkedEmailCount.value = n;
  checkAll.value = n === emailList.length;
  isIndeterminate.value = n > 0 && n < emailList.length;
}

function jumpDetails(email) {
  if (dropdownShow.value) { dropdownRef.value.handleClose(); return; }
  if (!dropdownCloseLock.value) { const sel = window.getSelection(); if (sel.toString().trim()) return }
  const idx = emailList.findIndex(e => e.emailId === email.emailId)
  emailStore.contentData.emailIndex = idx + 1
  emailStore.contentData.emailTotal = total.value
  emit('jump', email)
}

function getEmailList(refresh = false) {
  if (reqLock) return;
  let emailId = emailList.length > 0 ? emailList.at(-1).emailId : 0;
  reqLock = true
  if (!refresh) {
    if (loading.value || noLoading.value) { reqLock = false; return }
  } else {
    getSkeletonRows(); emailId = 0; loading.value = true; scrollTop = 0;
  }
  if (emailList.length === 0) loading.value = true;
  else followLoading.value = !refresh;
  let start = Date.now();
  props.getEmailList(emailId, queryParam.size).then(async data => {
    let duration = Date.now() - start;
    if (duration < 300 && !emailId) await sleep(300 - duration)
    firstLoad.value = false
    let list = data.list.map(item => ({ ...item, checked: false }));
    if (refresh) emailList.length = 0
    latestEmail.value = data.latestEmail
    handleList(list); emailList.push(...list);
    if (refresh) scrollbarRef.value?.setScrollTop(0);
    noLoading.value = data.list.length < queryParam.size;
    followLoading.value = data.list.length >= queryParam.size;
    total.value = data.total;
  }).finally(() => {
    loading.value = false; firstLoad.value = false; followLoading.value = false; reqLock = false;
  })
}

function handleList(list) {
  list.forEach(email => {
    email.formatText = htmlToText(email)
    email.formatCreateTime = fromNow(email.createTime);
    email.test = t('received')
    const statusIconMap = {
      0: { icon: 'ic:round-mark-email-read', color: '#51C76B', content: t('received') },
      1: { icon: 'bi:send-arrow-up-fill',    color: '#51C76B', content: t('sent') },
      2: { icon: 'bi:send-check-fill',       color: '#51C76B', content: t('delivered') },
      3: { icon: 'bi:send-x-fill',           color: '#F56C6C', content: t('bounced') },
      8: { icon: 'bi:send-x-fill',           color: '#F56C6C', content: t('bounced') },
      4: { icon: 'bi:send-exclamation-fill', color: '#FBBD08', content: t('complained') },
      5: { icon: 'bi:send-arrow-up-fill',    color: '#FBBD08', content: t('delayed') },
      7: { icon: 'ic:round-mark-email-read', color: '#FBBD08', content: t('noRecipient') },
    };
    if (email.isDel) email.isDelContent = t('selectDeleted');
    email.statusIcon = statusIconMap[email.status];
  })
}

function refresh() { emit('refresh-before'); refreshList() }

function refreshList() {
  checkAll.value = false; isIndeterminate.value = false; searchQuery.value = '';
  getEmailList(true);
}

function loadData() { getEmailList() }

// ── Pull-to-refresh ─────────────────────────────────────────────────────────
const ptrOffset   = ref(0)
const ptrSpinning = ref(false)
let _ptrStartY = 0

const ptrBarStyle = computed(() => ({ height: `${Math.min(ptrOffset.value, 52)}px` }))
const ptrOpacity  = computed(() => Math.min(ptrOffset.value / 52, 1))
const ptrAngle    = computed(() => ptrOffset.value * 4)

function ptrTouchStart(e) { _ptrStartY = e.touches[0].clientY }

function ptrTouchMove(e) {
  if (scrollTop > 4) { ptrOffset.value = 0; return }
  const dy = e.touches[0].clientY - _ptrStartY
  ptrOffset.value = dy > 0 ? Math.min(dy * 0.55, 64) : 0
}

function ptrTouchEnd() {
  if (ptrOffset.value >= 52) {
    ptrSpinning.value = true
    vibrate(30)
    refresh()
    setTimeout(() => { ptrSpinning.value = false; ptrOffset.value = 0 }, 1200)
  } else {
    ptrOffset.value = 0
  }
}

// ── Swipe-to-delete / swipe-to-star ────────────────────────────────────────
const swipeOffsets = reactive(new Map())
const swipeTouch   = ref(null)

function swipeTouchStart(e, item) {
  swipeTouch.value = { id: item.emailId, sx: e.touches[0].clientX, sy: e.touches[0].clientY, dir: null }
}

function swipeTouchMove(e, item) {
  const st = swipeTouch.value
  if (!st || st.id !== item.emailId) return
  const dx = e.touches[0].clientX - st.sx
  const dy = e.touches[0].clientY - st.sy
  if (!st.dir) {
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 8) st.dir = 'h'
    else if (Math.abs(dy) > 8) st.dir = 'v'
    else return
  }
  if (st.dir !== 'h') return
  e.preventDefault()
  swipeOffsets.set(item.emailId, Math.max(-120, Math.min(90, dx)))
}

function swipeTouchEnd(e, item) {
  const st = swipeTouch.value
  if (!st || st.id !== item.emailId) return
  const offset = swipeOffsets.get(item.emailId) || 0
  swipeTouch.value = null
  if (offset < -70 && props.emailDelete) {
    vibrate(40)
    swipeOffsets.set(item.emailId, 0)
    rightDeleteItem(item)
  } else if (offset > 60 && props.showStar && props.allowStar) {
    vibrate(20)
    swipeOffsets.set(item.emailId, 0)
    starChange(item)
  } else {
    swipeOffsets.set(item.emailId, 0)
  }
}

function rowSwipeStyle(item) {
  const offset = swipeOffsets.get(item.emailId) || 0
  const dragging = swipeTouch.value?.id === item.emailId && swipeTouch.value?.dir === 'h'
  if (offset === 0 && !dragging) return {}
  return { transform: `translateX(${offset}px)`, transition: dragging ? 'none' : 'transform 0.25s ease' }
}

function swipeDeleteOpacity(item) {
  const o = swipeOffsets.get(item.emailId) || 0
  return o < 0 ? Math.min(1, Math.abs(o) / 60) : 0
}

function swipeStarOpacity(item) {
  const o = swipeOffsets.get(item.emailId) || 0
  return o > 0 ? Math.min(1, o / 50) : 0
}

function onRowClick(e, item) {
  if (Math.abs(swipeOffsets.get(item.emailId) || 0) > 5) { swipeOffsets.set(item.emailId, 0); return }
  jumpDetails(item)
}

// ── Haptic feedback (Web Vibration API — no plugin needed) ──────────────────
function vibrate(ms) { try { navigator.vibrate?.(ms) } catch {} }
</script>

<style lang="scss" scoped>
/* ── Container ────────────────────────────────────────────── */
.email-container {
  display: grid;
  grid-template-rows: auto 1fr;
  height: 100%;
  overflow: hidden;
  background: #f9f9f9;
  font-size: 14px;
  color: var(--el-text-color-primary);
}

.dark .email-container {
  background: #0a0a0a;
}

/* ── Toolbar ──────────────────────────────────────────────── */
.mail-toolbar {
  height: 44px;
  display: flex;
  align-items: center;
  padding: 0 0 0 10px;
  border-bottom: 1px solid var(--light-border, #e2e2e6);
  background: var(--surface, #ffffff);
  flex-shrink: 0;

  .toolbar-left {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 2px;
    height: 100%;
    overflow: hidden;
  }

  /* count lives inside toolbar-left, pushed right with margin-left:auto */
  .mail-count {
    margin-left: auto;
    flex-shrink: 0;
    font-family: 'IBM Plex Sans', 'Noto Sans SC', sans-serif;
    font-size: 12.5px;
    font-weight: 500;
    text-transform: none;
    letter-spacing: 0;
    color: var(--secondary-text-color, #7e7576);
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
    padding: 0 16px;
  }
}

.dark .mail-toolbar {
  background: var(--surface);
  border-bottom-color: var(--light-border);
}

/* ── Integrated search in toolbar ────────────────────────── */
.toolbar-search {
  flex: 1;
  min-width: 60px;
  max-width: 220px;
  height: 100%;
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 0 8px;

  .search-icon-inline {
    color: var(--secondary-text-color, #7e7576);
    flex-shrink: 0;
    opacity: 0.6;
  }

  .search-input-inline {
    flex: 1;
    min-width: 0;
    border: none;
    outline: none;
    background: transparent;
    font-size: 13px;
    color: var(--el-text-color-primary);

    &::placeholder {
      color: var(--secondary-text-color, #7e7576);
      opacity: 0.6;
    }
  }

  .search-clear-inline {
    color: var(--secondary-text-color, #7e7576);
    cursor: pointer;
    flex-shrink: 0;
    opacity: 0.6;
    &:hover { opacity: 1; color: var(--el-text-color-primary); }
  }
}

/* ── ALL / UNREAD segmented filter ────────────────────────── */
.unread-filter {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 3px;
  margin-left: 4px;
  flex-shrink: 0;
  background: var(--base-fill, #f3f3f3);
  border-radius: var(--radius-full);
}

.filter-pill {
  border: none;
  background: transparent;
  cursor: pointer;
  height: 26px;
  padding: 0 14px;
  font-size: 12.5px;
  font-weight: 500;
  font-family: 'IBM Plex Sans', 'Noto Sans SC', sans-serif;
  color: var(--secondary-text-color, #7e7576);
  border-radius: var(--radius-full);
  transition: background 0.14s ease, color 0.14s ease, box-shadow 0.14s ease;
  white-space: nowrap;

  &.active {
    background: var(--surface, #ffffff);
    color: var(--el-text-color-primary);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.10);
    font-weight: 600;
  }
}

.dark .filter-pill.active {
  background: var(--surface-secondary, #25252b);
}

/* ── Icon button ──────────────────────────────────────────── */
.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  /* min 32px for touch targets */
  width: 32px;
  height: 32px;
  border: 1px solid transparent;
  background: transparent;
  border-radius: var(--radius-sm);
  cursor: pointer;
  color: #7e7576;
  transition: background 0.10s ease, color 0.10s ease, border-color 0.10s;
  flex-shrink: 0;

  @media (hover: hover) {
    &:hover {
      background: var(--email-hover-background, #eeeeee);
      color: #1a1a1a;
    }

    &.icon-danger:hover {
      background: rgba(var(--red-accent-rgb), 0.08);
      color: var(--red-accent);
    }
  }
}

.dark .icon-btn {
  color: #555555;
  @media (hover: hover) {
    &:hover {
      background: rgba(255, 255, 255, 0.08);
      color: #e8e8e8;
    }
    &.icon-danger:hover {
      background: rgba(var(--red-accent-rgb), 0.16);
      color: var(--red-accent);
    }
  }
}

@media (max-width: 768px) {
  .email-container {
    background: linear-gradient(180deg, #f6f5f3 0%, #eeeeeb 100%);
  }

  .dark .email-container {
    background: linear-gradient(180deg, #151519 0%, #101014 100%);
  }

  .mail-toolbar {
    height: 58px;
    padding: 8px 12px;
    border-bottom: none;
    background: transparent;

    .toolbar-left {
      gap: 8px;
      border-radius: 18px;
      padding: 0 8px;
      /* Tinted to match .email-container's own cream gradient (#f6f5f3)
         instead of literal white — see content/index.vue for the same fix
         applied to the email detail view. */
      background: rgba(246,245,243,0.78);
      border: 1px solid rgba(0,0,0,0.08);
      box-shadow: 0 10px 24px rgba(0,0,0,0.06);
    }

    .mail-count {
      display: none;
    }

    .unread-filter {
      display: none;
    }
  }

  .dark .mail-toolbar .toolbar-left {
    background: rgba(28,28,33,0.86);
    border-color: rgba(255,255,255,0.08);
  }

  .toolbar-search {
    max-width: none;
    height: 42px;
    padding: 0 6px;

    .search-input-inline {
      font-size: 14px;
      font-weight: 600;
    }
  }

  .icon-btn {
    width: 38px;
    height: 38px;
    border-radius: 13px;
  }

  :deep(.el-checkbox) {
    --el-checkbox-input-width: 18px;
    --el-checkbox-input-height: 18px;
  }

  .scroll {
    padding: 0 12px 14px;
    background: transparent;
  }

  :deep(.mail-row-wrap) {
    padding: 6px 0;
  }

  :deep(.mail-row) {
    grid-template-columns: 34px minmax(0, 1fr) auto;
    grid-template-rows: 24px 28px 24px;
    gap: 2px 10px;
    min-height: 84px;
    padding: 12px 12px 10px 8px;
    border: 1px solid rgba(0,0,0,0.08);
    border-bottom: 1px solid rgba(0,0,0,0.08);
    border-radius: 20px;
    background: rgba(246,245,243,0.88);
    box-shadow: 0 10px 24px rgba(0,0,0,0.06);
    align-items: center;

    &.is-unread {
      border-color: rgba(var(--red-accent-rgb),0.24);
      box-shadow: 0 12px 28px rgba(var(--red-accent-rgb),0.10);
    }

    &.all-email {
      min-height: 94px;
    }
  }

  .dark :deep(.mail-row) {
    background: rgba(28,28,33,0.90);
    border-color: rgba(255,255,255,0.08);
    box-shadow: 0 12px 28px rgba(0,0,0,0.24);
  }

  :deep(.row-check) {
    grid-column: 1;
    grid-row: 1 / 4;
    align-self: center;
    padding-left: 0;
    justify-content: center;
    flex-direction: column;
    gap: 8px;

    .unread-indicator {
      width: 8px;
      height: 8px;
    }
  }

  :deep(.row-sender) {
    grid-column: 2;
    grid-row: 1;
    padding-top: 0;

    .mail-name {
      font-size: 15px;
      font-weight: 800;
      color: var(--el-text-color-primary);
    }
  }

  :deep(.row-meta) {
    grid-column: 3;
    grid-row: 1;
    align-items: flex-end;
    padding-top: 0;

    .mail-time {
      font-size: 11px;
      font-weight: 700;
      color: var(--muted, #7e7576);
    }

    .mail-actions {
      display: none;
    }
  }

  :deep(.row-subject-cell) {
    grid-column: 2 / 4;
    grid-row: 2 / 4;
    display: flex;
    flex-direction: column;
    justify-content: center;
    min-width: 0;
    padding-bottom: 0;

    .subject-text {
      display: block;
      font-size: 14px;
      font-weight: 700;
      line-height: 1.35;
      color: var(--regular-text-color);
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    .mail-preview-inline {
      display: block !important;
      margin-top: 2px;
      font-size: 12px;
      line-height: 1.35;
      color: var(--muted, #7e7576);
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      max-width: 100%;
    }
  }
}

/* ── Scroll area ──────────────────────────────────────────── */
.scroll {
  height: 100%;
  overflow: hidden;
  background: var(--extra-light-fill, #f9f9f9);

  .virtual { will-change: scroll-position; }

  .empty {
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100%;
  }

  .no-more {
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 12px 0;
    font-family: 'IBM Plex Sans', 'Noto Sans SC', sans-serif;
    font-size: 12px;
    text-transform: none;
    letter-spacing: 0;
    color: var(--muted, #7e7576);
  }
}

/* ── Mail row wrapper ─────────────────────────────────────── */
:deep(.mail-row-wrap) {
  padding: 0;
  position: relative;
  overflow: hidden;
  touch-action: pan-y;
}

/* ── Mail row: Brutalist table layout (Stitch) ────────────── */
:deep(.mail-row) {
  position: relative;
  display: grid;
  grid-template-columns: 52px 180px 1fr 110px;
  gap: 8px;
  min-height: 60px;
  padding: 10px 18px 10px 14px;
  border-radius: var(--radius-md);
  border-bottom: 1px solid var(--light-border-color, #dcdcdc);
  background: var(--surface, #ffffff);
  cursor: pointer;
  align-items: center;
  transition: background 120ms ease, transform 0.25s ease, box-shadow 120ms ease;

  &::before {
    content: '';
    position: absolute;
    left: 0;
    top: 10%;
    bottom: 10%;
    width: 3px;
    border-radius: var(--radius-full);
    background: var(--red-accent);
    opacity: 0;
    transition: opacity 120ms ease;
  }

  &.all-email {
    grid-template-columns: 52px 180px 1fr 110px;
    min-height: 68px;
  }

  @media (max-width: 1280px) {
    grid-template-columns: 44px 140px 1fr 88px;
  }

  /* ── Mobile: stacked 2-row card layout ── */
  @media (max-width: 768px) {
    grid-template-columns: 36px 1fr auto;
    grid-template-rows: auto auto;
    gap: 0 8px;
    min-height: 64px;
    padding: 10px 14px 10px 8px;
    align-items: start;

    &.all-email { min-height: 72px; }
  }

  @media (hover: hover) {
    &:hover {
      background: var(--email-hover-background, #eeeeee);
    }
  }

  &[data-active] {
    background: rgba(var(--red-accent-rgb), 0.06);

    &::before { opacity: 1; }
  }
}

/* Mobile row cell placement */
@media (max-width: 768px) {
  :deep(.row-check) {
    grid-column: 1;
    grid-row: 1 / 3;
    align-self: center;
  }
  :deep(.row-sender) {
    grid-column: 2;
    grid-row: 1;
    padding-top: 2px;
  }
  :deep(.row-meta) {
    grid-column: 3;
    grid-row: 1;
    align-items: flex-start;
    padding-top: 2px;
  }
  :deep(.row-subject-cell) {
    grid-column: 2 / 4;
    grid-row: 2;
    padding-bottom: 4px;

    /* Hide long preview on mobile to reduce clutter */
    .mail-preview-inline { display: none; }
  }
}

/* 480px: hide preview text, boost sender/subject readability */
@media (max-width: 480px) {
  :deep(.mail-preview-inline) { display: none !important; }
  :deep(.row-sender .mail-name) { font-size: 15px; }
  :deep(.row-subject-cell .subject-text) { font-size: 15px; }
}

.dark :deep(.mail-row) {
  background: var(--surface);
  border-bottom-color: var(--light-border-color);

  &:hover { background: var(--email-hover-background); }
  &[data-active] { background: rgba(var(--red-accent-rgb), 0.14); }
}

/* ── Col 1: Checkbox + unread indicator ───────────────────── */
:deep(.row-check) {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  padding-left: 8px;

  .unread-indicator {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: transparent;
    flex-shrink: 0;
    transition: background 0.1s;

    &.visible { background: var(--red-accent); }
  }
}

/* ── Col 2: Sender ────────────────────────────────────────── */
:deep(.row-sender) {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  overflow: hidden;

  .sender-avatar {
    position: relative;
    width: 24px;
    height: 24px;
    flex-shrink: 0;
    border-radius: var(--radius-full);
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;

    .sender-avatar-letter {
      color: #fff;
      font-size: 11px;
      font-weight: 700;
      line-height: 1;
      font-family: 'IBM Plex Sans', 'Noto Sans SC', sans-serif;
    }

    .sender-avatar-img {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
  }

  .mail-name {
    font-size: 14px;
    font-weight: 400;
    color: #4c4546;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
    min-width: 0;
  }

  .sender-star { flex-shrink: 0; }

  .email-status-inline {
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }
}

/* ── Col 3: Subject + snippet ─────────────────────────────── */
:deep(.row-subject-cell) {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  overflow: hidden;

  .subject-text {
    font-size: 14px;
    font-weight: 400;
    color: #4c4546;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex-shrink: 1;
    min-width: 0;
  }

  .mail-preview-inline {
    font-size: 13px;
    color: #7e7576;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex-shrink: 2;
    min-width: 0;
  }

  .code-tag {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    color: var(--red-accent);
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
    border: 1px solid var(--red-accent);
    padding: 0 4px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .user-info-inline {
    display: flex;
    gap: 8px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    color: #7e7576;
    flex-shrink: 0;
    white-space: nowrap;
  }
}

/* ── Col 4: Time + actions ────────────────────────────────── */
:deep(.row-meta) {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: center;
  gap: 4px;
  flex-shrink: 0;

  .mail-time {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    color: #7e7576;
    white-space: nowrap;
    letter-spacing: 0.02em;
    font-variant-numeric: tabular-nums;
  }

  .mail-actions {
    display: flex;
    align-items: center;
    gap: 0;
    opacity: 0;
    transition: opacity 0.1s;
  }
}

:deep(.mail-row:hover .row-meta .mail-actions),
:deep(.mail-row[data-active] .row-meta .mail-actions) {
  opacity: 1;
}

/* ── Unread state ─────────────────────────────────────────── */
:deep(.mail-row.is-unread) {
  background: #ffffff;

  .row-sender .mail-name {
    font-weight: 700 !important;
    color: #1a1c1c !important;
  }
  .row-subject-cell .subject-text {
    font-weight: 700 !important;
    color: #1a1c1c !important;
  }
  .row-meta .mail-time {
    font-weight: 700 !important;
    color: #1a1c1c !important;
  }
}

.dark :deep(.mail-row.is-unread) {
  background: #0f0f0f;
  .row-sender .mail-name { color: #ffffff !important; }
  .row-subject-cell .subject-text { color: #ffffff !important; }
  .row-meta .mail-time { color: #cccccc !important; }
}

:deep(.mail-row:not(.is-unread)) {
  .row-sender .mail-name { opacity: 0.65; }
  .row-subject-cell .subject-text { opacity: 0.65; }
}

/* ── Context menu ─────────────────────────────────────────── */
.ctx-item {
  display: flex;
  align-items: center;
  gap: 10px;

  &.danger { color: var(--red-accent); }
}

:deep(.el-dropdown-menu__item:last-child) { padding-bottom: 8px; }
:deep(.el-dropdown-menu__item:first-child) { padding-top: 8px; }
:deep(.el-dropdown-menu__item) { padding: 6px 14px; }

/* ── Pull-to-refresh bar ─────────────────────────────────── */
.ptr-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: var(--extra-light-fill, #f9f9f9);
  color: var(--muted, #7e7576);
  will-change: height;
}

:deep(.ptr-spin) { animation: ptr-rotate 0.7s linear infinite !important; }

@keyframes ptr-rotate { to { transform: rotate(360deg) !important; } }

/* ── Swipe action background layers ─────────────────────── */
.swipe-bg {
  position: absolute;
  top: 0; bottom: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 20px;
  font-size: 13px;
  font-weight: 600;
  color: #fff;
  pointer-events: none;
  font-family: 'IBM Plex Sans', 'Noto Sans SC', sans-serif;
  letter-spacing: 0;
  text-transform: none;
  transition: opacity 0.05s;

  &--delete { right: 0; background: var(--red-accent); color: var(--on-accent); }
  &--star   { left: 0;  background: #c48c00; }
}
</style>
