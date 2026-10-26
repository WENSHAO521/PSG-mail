<template>
  <emailScroll ref="sendScroll"
               :cancel-success="cancelStar"
               :star-success="addStar"
               :getEmailList="getEmailList"
               :emailDelete="emailDelete"
               :star-add="starAdd"
               show-status
               :show-account-scope="multiAccount"
               :all-accounts="allAccounts"
               :show-mailbox="multiAccount && allAccounts"
               @account-scope="changeAccountScope"
               :explorer-title="$t('sent')"
               :explorer-subtitle="$t('sentSubtitle')"
               :explorer-search-placeholder="$t('searchPlaceholder')"
               :hide-inline-search="true"
               :show-sort="true"
               actionLeft="4px"
               :star-cancel="starCancel"
               @jump="jumpContent"
               @sort="changeTimeSort"
               :time-sort="params.timeSort"
               :type="'send'"
  >
  </emailScroll>
</template>

<script setup>
import {useAccountStore} from "@/store/account.js";
import {useEmailStore} from "@/store/email.js"
import {useUiStore} from "@/store/ui.js";
import emailScroll from "@/components/email-scroll/index.vue"
import {emailList, emailDelete} from "@/request/email.js";
import {useAccountScope} from "@/utils/account-scope.js";
import {starAdd, starCancel} from "@/request/star.js";
import {defineOptions, onMounted, reactive, ref} from "vue";
import router from "@/router/index.js";

defineOptions({
  name: 'send'
})

const emailStore = useEmailStore();
const uiStore = useUiStore();
const accountStore = useAccountStore();
const sendScroll = ref({})
const params = reactive({
  timeSort: 0,
})

// Sent mail from every address the user owns, not just the open one.
const { multiAccount, allAccounts, changeAccountScope, allReceive: scopeAllReceive } =
  useAccountScope('sentAllAccounts', () => sendScroll.value.refreshList())

onMounted(() => {
  emailStore.sendScroll = sendScroll;
})

function changeTimeSort() {
  params.timeSort = params.timeSort ? 0 : 1
  sendScroll.value.refreshList();
}

function jumpContent(email) {
  emailStore.contentData.email = email
  emailStore.contentData.delType = 'logic'
  emailStore.contentData.showStar = true
  emailStore.contentData.showReply = true
  uiStore.mobileDetailOpen = true
}

function addStar(email) {
  emailStore.starScroll?.addItem(email)
}

function cancelStar(email) {
  emailStore.starScroll?.deleteEmail([email.emailId])
}

function getEmailList(emailId, size) {
  const accountId =  accountStore.currentAccountId;
  const allReceive = scopeAllReceive();
  return emailList(accountId, allReceive, emailId, params.timeSort, size, 1).then(data => {
    if (data.latestEmail) { data.latestEmail.reqAccountId = accountId; data.latestEmail.allReceive = allReceive; }
    return data;
  })
}

</script>

<style scoped>
.icon {
  cursor: pointer;
}
</style>
