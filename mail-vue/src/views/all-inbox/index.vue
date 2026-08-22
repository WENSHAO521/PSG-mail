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
               :explorer-title="$t('allInbox')"
               :explorer-subtitle="$t('allInboxSubtitle')"
               :explorer-search-placeholder="$t('searchPlaceholder')"
               :hide-inline-search="true"
               :show-sort="true"
               :spam-email="spamEmailAction"
               :archive-email="archiveEmailAction"
               actionLeft="4px"
               @jump="jumpContent"
               @sort="changeTimeSort"
  >
  </emailScroll>
</template>

<script setup>
import { useAccountStore } from "@/store/account.js";
import { useEmailStore } from "@/store/email.js";
import { useUiStore } from "@/store/ui.js";
import emailScroll from "@/components/email-scroll/index.vue";
import { emailList, emailDelete, emailRead, emailMarkSpam, emailArchive } from "@/request/email.js";
import { starAdd, starCancel } from "@/request/star.js";
import { defineOptions, reactive, ref, watch } from "vue";
import { useI18n } from "vue-i18n";

defineOptions({ name: 'all-inbox' })

const { t } = useI18n();
const emailStore = useEmailStore();
const uiStore = useUiStore();
const accountStore = useAccountStore();
const scroll = ref({});
const params = reactive({ timeSort: 0 });

const ALL_RECEIVE = 1;

function changeTimeSort() {
  params.timeSort = params.timeSort ? 0 : 1;
  scroll.value.refreshList();
}

function jumpContent(email) {
  emailStore.contentData.email = email;
  emailStore.contentData.delType = 'logic';
  emailStore.contentData.showUnread = true;
  emailStore.contentData.showStar = true;
  emailStore.contentData.showReply = true;
  uiStore.mobileDetailOpen = true;
}

function archiveEmailAction(emailId) {
  emailArchive([emailId])
    .then(() => scroll.value.deleteEmail([emailId]))
    .catch(() => ElMessage({ message: t('operationFailMsg'), type: 'error', plain: true }));
}

function spamEmailAction(emailId) {
  emailMarkSpam([emailId])
    .then(() => scroll.value.deleteEmail([emailId]))
    .catch(() => ElMessage({ message: t('operationFailMsg'), type: 'error', plain: true }));
}

function addStar(email) { emailStore.starScroll?.addItem(email); }
function cancelStar(email) { emailStore.starScroll?.deleteEmail([email.emailId]); }

function getEmailList(emailId, size) {
  const accountId = accountStore.currentAccountId;
  return emailList(accountId, ALL_RECEIVE, emailId, params.timeSort, size, 0).then(data => {
    if (data.latestEmail) {
      data.latestEmail.reqAccountId = accountId;
      data.latestEmail.allReceive = ALL_RECEIVE;
    }
    return data;
  });
}
</script>
