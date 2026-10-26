<template>
  <emailScroll
    type="spam"
    ref="scroll"
    :getEmailList="getSpamList"
    :emailDelete="emailDelete"
    :star-add="starAdd"
    :star-cancel="starCancel"
    :unspam-email="unspamEmail"
    actionLeft="6px"
    :show-account-icon="false"
    :show-account-scope="multiAccount"
    :all-accounts="allAccounts"
    :show-mailbox="multiAccount && allAccounts"
    @account-scope="changeAccountScope"
    :explorer-title="$t('spam')"
    :explorer-subtitle="$t('spamSubtitle')"
    :explorer-search-placeholder="$t('searchPlaceholder')"
    :hide-inline-search="true"
    @jump="jumpContent"
  >
    <template #first>
      <EmptyFolderBtn v-if="scroll?.total > 0" folder="spam" :account-id="accountStore.currentAccountId"
                      :all-receive="scopeAllReceive()" @done="scroll.refreshList()" />
    </template>
  </emailScroll>
</template>

<script setup>
import emailScroll from "@/components/email-scroll/index.vue"
import EmptyFolderBtn from "@/components/empty-folder-btn/index.vue"
import { emailDelete, emailSpamList, emailUnmarkSpam } from "@/request/email.js"
import { starAdd, starCancel } from "@/request/star.js"
import { useEmailStore } from "@/store/email.js"
import { useAccountStore } from "@/store/account.js"
import { useAccountScope } from "@/utils/account-scope.js"
import { useUiStore } from "@/store/ui.js"
import { defineOptions, ref } from "vue"
import { useI18n } from "vue-i18n"
import router from "@/router/index.js"

defineOptions({ name: 'spam' })

const { t } = useI18n()
const scroll = ref({})
const emailStore = useEmailStore()
const accountStore = useAccountStore()
const uiStore = useUiStore()

// Every address the user owns, or just the open one.
const { multiAccount, allAccounts, changeAccountScope, allReceive: scopeAllReceive } =
  useAccountScope('spamAllAccounts', () => scroll.value.refreshList())

function jumpContent(email) {
  emailStore.contentData.email = email
  emailStore.contentData.delType = 'logic'
  emailStore.contentData.showStar = false
  emailStore.contentData.showReply = false
  uiStore.mobileDetailOpen = true
}

function getSpamList(emailId, size) {
  const accountId = accountStore.currentAccountId
  const allReceive = scopeAllReceive()
  return emailSpamList(accountId, allReceive, emailId, size)
}

function unspamEmail(emailId) {
  emailUnmarkSpam([emailId]).then(() => {
    scroll.value.deleteEmail([emailId])
  }).catch(() => ElMessage({ message: t('operationFailMsg'), type: 'error', plain: true }))
}
</script>
