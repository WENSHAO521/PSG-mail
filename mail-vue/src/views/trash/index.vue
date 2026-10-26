<template>
  <emailScroll
    type="trash"
    ref="scroll"
    :getEmailList="getTrashList"
    :emailDelete="emailPermanentDelete"
    :star-add="starAdd"
    :star-cancel="starCancel"
    :restore-email="restoreAction"
    actionLeft="6px"
    :show-account-icon="false"
    :show-account-scope="multiAccount"
    :all-accounts="allAccounts"
    :show-mailbox="multiAccount && allAccounts"
    @account-scope="changeAccountScope"
    :explorer-title="$t('deletedMail')"
    :explorer-subtitle="$t('trashSubtitle')"
    :explorer-search-placeholder="$t('searchPlaceholder')"
    :hide-inline-search="true"
    @jump="jumpContent"
  >
    <template #first>
      <div class="trash-retention-hint" :title="$t('autoDeleteDaysUserWarn', { n: retentionDays })">
        <Icon icon="psg:warning" width="13" height="13" />
        <span>{{ $t('trashRetentionHint', { n: retentionDays }) }}</span>
      </div>
      <EmptyFolderBtn v-if="scroll?.total > 0" folder="trash" :account-id="accountStore.currentAccountId"
                      :all-receive="scopeAllReceive()" @done="scroll.refreshList()" />
    </template>
  </emailScroll>
</template>

<script setup>
import emailScroll from "@/components/email-scroll/index.vue"
import { Icon } from "@iconify/vue"
import EmptyFolderBtn from "@/components/empty-folder-btn/index.vue"
import { emailPermanentDelete, emailTrashList, emailRestore } from "@/request/email.js"
import { starAdd, starCancel } from "@/request/star.js"
import { useEmailStore } from "@/store/email.js"
import { useAccountStore } from "@/store/account.js"
import { useAccountScope } from "@/utils/account-scope.js"
import { useUiStore } from "@/store/ui.js"
import { useSettingStore } from "@/store/setting.js"
import { defineOptions, computed, ref } from "vue"

defineOptions({ name: 'trash' })

const scroll = ref({})
const emailStore = useEmailStore()
const accountStore = useAccountStore()
const uiStore = useUiStore()
const settingStore = useSettingStore()

const retentionDays = computed(() => settingStore.settings.autoDeleteDays > 0 ? settingStore.settings.autoDeleteDays : 30)

// Every address the user owns, or just the open one.
const { multiAccount, allAccounts, changeAccountScope, allReceive: scopeAllReceive } =
  useAccountScope('trashAllAccounts', () => scroll.value.refreshList())

function jumpContent(email) {
  emailStore.contentData.email = email
  emailStore.contentData.delType = 'logic'
  emailStore.contentData.showStar = true
  emailStore.contentData.showReply = false
  uiStore.mobileDetailOpen = true
}

function getTrashList(emailId, size) {
  const accountId  = accountStore.currentAccountId
  const allReceive = scopeAllReceive()
  return emailTrashList(accountId, allReceive, emailId, size)
}

function restoreAction(emailId) {
  emailRestore([emailId]).then(() => scroll.value.deleteEmail([emailId]))
}
</script>

<style scoped>
.trash-retention-hint {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 0 10px;
  color: var(--psg-text-muted);
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex-shrink: 1;
  min-width: 0;

  span {
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

@media (max-width: 640px) {
  .trash-retention-hint span { display: none; }
}
</style>
