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
import { useSettingStore } from "@/store/setting.js";
import emailScroll from "@/components/email-scroll/index.vue";
import { emailList, emailDelete, emailLatest, emailRead, emailMarkSpam, emailArchive } from "@/request/email.js";
import { starAdd, starCancel } from "@/request/star.js";
import { defineOptions, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";
import { sleep } from "@/utils/time-utils.js";

defineOptions({ name: 'all-inbox' })

const { t } = useI18n();
const route = useRoute();
const emailStore = useEmailStore();
const uiStore = useUiStore();
const accountStore = useAccountStore();
const settingStore = useSettingStore();
const scroll = ref({});
const params = reactive({ timeSort: 0 });

const ALL_RECEIVE = 1;

let latestRunning = false
onMounted(() => { latestRunning = true; latest(); });
onUnmounted(() => { latestRunning = false; });

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

const existIds = new Set();

async function latest() {
  while (latestRunning) {
    let autoRefresh = settingStore.settings.autoRefresh;
    await sleep(autoRefresh > 1 ? autoRefresh * 1000 : 3000);

    if (route.name !== 'all-inbox') continue;

    const latestId = scroll.value.latestEmail?.emailId;

    if (!scroll.value.firstLoad && autoRefresh > 1) {
      try {
        const accountId = accountStore.currentAccountId;
        const curTimeSort = params.timeSort;
        let list = [];

        if (accountId === scroll.value.latestEmail?.reqAccountId) {
          list = await emailLatest(latestId, accountId, ALL_RECEIVE);
        }

        if (accountId === accountStore.currentAccountId && params.timeSort === curTimeSort) {
          for (let email of list) {
            email.reqAccountId = accountId;
            email.allReceive = ALL_RECEIVE;

            if (!existIds.has(email.emailId)) {
              existIds.add(email.emailId);
              scroll.value.addItem(email);
              await sleep(50);
            }
          }
        }
      } catch (e) {
        if (e.code === 401 || e.code === 403) settingStore.settings.autoRefresh = 0;
        console.error(e);
      }
    }
  }
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
