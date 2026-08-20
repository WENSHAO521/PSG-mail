<template>
  <emailScroll ref="scroll"
               :cancel-success="cancelStar"
               :star-success="addStar"
               :getEmailList="getEmailList"
               :emailDelete="emailDelete"
               :star-add="starAdd"
               :star-cancel="starCancel"
               :time-sort="params.timeSort"
               :email-read="emailRead"
               :show-unread="true"
               :spam-email="spamEmailAction"
               :archive-email="archiveEmailAction"
               actionLeft="4px"
               @jump="jumpContent"
  >
    <template #first>
      <Icon class="icon" @click="changeTimeSort" icon="solar:sort-by-time-linear"
            v-if="params.timeSort === 0" width="28" height="28"/>
      <Icon class="icon" @click="changeTimeSort" icon="solar:sort-by-time-linear" v-else
            width="28" height="28" style="transform:scaleY(-1)"/>
    </template>

  </emailScroll>
</template>

<script setup>
import {useAccountStore} from "@/store/account.js";
import {useEmailStore} from "@/store/email.js"
import {useUiStore} from "@/store/ui.js";
import emailScroll from "@/components/email-scroll/index.vue"
import {emailList, emailDelete, emailRead, emailMarkSpam, emailArchive} from "@/request/email.js";
import {starAdd, starCancel} from "@/request/star.js";
import {defineOptions, h, onMounted, onActivated, reactive, ref, watch, computed} from "vue";
import {useI18n} from "vue-i18n";
import {Icon} from "@iconify/vue";
import { flushInboxIfDirty, syncNow } from "@/utils/mail-sync-service.js";

defineOptions({
  name: 'email'
})

const { t } = useI18n()
const emailStore = useEmailStore();
const uiStore = useUiStore();
const accountStore = useAccountStore();
const scroll = ref({})
const params = reactive({
  timeSort: 0,
})

// New-mail delivery (push + fallback poll) is centralized in
// mail-sync-service.js — see its header for why the Inbox used to run a
// second, independently-polling loop that raced the global one on the same
// server-side rate-limited endpoint. This view only needs to: expose its
// scroll ref so the sync service can insert rows while mounted, and catch up
// on anything that arrived while it wasn't (inboxDirty / on activation).
onMounted(() => {
  emailStore.emailScroll = scroll;
  flushInboxIfDirty()
})
onActivated(() => {
  flushInboxIfDirty()
  syncNow('activated')
})

const inboxUnread = computed(() => scroll.value?.unreadCount ?? 0)
watch(inboxUnread, v => {
  emailStore.inboxUnreadCount = v
  window.electronAPI?.setBadgeCount?.(v)
})


watch(() => accountStore.currentAccountId, () => {
  scroll.value.refreshList();
})

function changeTimeSort() {
  params.timeSort = params.timeSort ? 0 : 1
  scroll.value.refreshList();
}

function jumpContent(email) {
  emailStore.contentData.email = email
  emailStore.contentData.delType = 'logic'
  emailStore.contentData.showUnread = true
  emailStore.contentData.showStar = true
  emailStore.contentData.showReply = true
  uiStore.mobileDetailOpen = true
}

function archiveEmailAction(emailId) {
  emailArchive([emailId]).then(() => scroll.value.deleteEmail([emailId]))
    .catch(() => ElMessage({ message: t('operationFailMsg'), type: 'error', plain: true }))
}

function spamEmailAction(emailId) {
  emailMarkSpam([emailId]).then(() => {
    scroll.value.deleteEmail([emailId])
  }).catch(() => ElMessage({ message: t('operationFailMsg'), type: 'error', plain: true }))
}

function addStar(email) {
  emailStore.starScroll?.addItem(email)
}

function cancelStar(email) {
  emailStore.starScroll?.deleteEmail([email.emailId])
}

function getEmailList(emailId, size) {
  const accountId =  accountStore.currentAccountId;
  const allReceive = accountStore.currentAccount.allReceive;
  return emailList(accountId, allReceive, emailId, params.timeSort, size, 0).then(data => {
    if (data.latestEmail) { data.latestEmail.reqAccountId = accountId; data.latestEmail.allReceive = allReceive; }
    return data;
  })
}

</script>
<style>
.icon {
  cursor: pointer;
}
</style>
