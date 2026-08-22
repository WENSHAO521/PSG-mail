<template>
  <emailScroll
    type="archive"
    ref="scroll"
    :getEmailList="getArchiveList"
    :emailDelete="emailDelete"
    :star-add="starAdd"
    :star-cancel="starCancel"
    :unarchive-email="unarchiveAction"
    actionLeft="6px"
    :show-account-icon="false"
    :explorer-title="$t('archiveFolder')"
    :explorer-subtitle="$t('archiveSubtitle')"
    :explorer-search-placeholder="$t('searchPlaceholder')"
    :hide-inline-search="true"
    @jump="jumpContent"
  />
</template>

<script setup>
import emailScroll from "@/components/email-scroll/index.vue"
import { emailDelete, emailArchiveList, emailUnarchive } from "@/request/email.js"
import { starAdd, starCancel } from "@/request/star.js"
import { useEmailStore } from "@/store/email.js"
import { useAccountStore } from "@/store/account.js"
import { useUiStore } from "@/store/ui.js"
import { defineOptions, ref, watch } from "vue"
import { useI18n } from "vue-i18n"
import router from "@/router/index.js"

defineOptions({ name: 'archive' })

const { t } = useI18n()
const scroll = ref({})
const emailStore = useEmailStore()
const accountStore = useAccountStore()
const uiStore = useUiStore()

watch(() => accountStore.currentAccountId, () => scroll.value.refreshList())

function jumpContent(email) {
  emailStore.contentData.email = email
  emailStore.contentData.delType = 'logic'
  emailStore.contentData.showStar = true
  emailStore.contentData.showReply = false
  uiStore.mobileDetailOpen = true
}

function getArchiveList(emailId, size) {
  const accountId  = accountStore.currentAccountId
  const allReceive = accountStore.currentAccount.allReceive
  return emailArchiveList(accountId, allReceive, emailId, size)
}

function unarchiveAction(emailId) {
  emailUnarchive([emailId]).then(() => scroll.value.deleteEmail([emailId]))
    .catch(() => ElMessage({ message: t('operationFailMsg'), type: 'error', plain: true }))
}
</script>
