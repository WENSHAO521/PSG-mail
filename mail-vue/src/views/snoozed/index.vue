<template>
  <emailScroll
    type="snoozed"
    ref="scroll"
    :getEmailList="getSnoozeList"
    :emailDelete="emailDelete"
    :star-add="starAdd"
    :star-cancel="starCancel"
    :unarchive-email="unsnoozeAction"
    actionLeft="6px"
    :show-account-icon="false"
    :explorer-title="$t('snoozedFolder')"
    :explorer-subtitle="$t('snoozedSubtitle')"
    :explorer-search-placeholder="$t('searchPlaceholder')"
    :hide-inline-search="true"
    @jump="jumpContent"
  />
</template>

<script setup>
import emailScroll from "@/components/email-scroll/index.vue"
import { emailDelete, emailSnoozeList, emailUnsnooze } from "@/request/email.js"
import { starAdd, starCancel } from "@/request/star.js"
import { useEmailStore } from "@/store/email.js"
import { useUiStore } from "@/store/ui.js"
import { defineOptions, ref } from "vue"
import { useI18n } from "vue-i18n"
import { ElMessage } from "element-plus"

defineOptions({ name: 'snoozed' })

const { t } = useI18n()
const scroll = ref({})
const emailStore = useEmailStore()
const uiStore = useUiStore()

function jumpContent(email) {
  emailStore.contentData.email = email
  emailStore.contentData.delType = 'logic'
  emailStore.contentData.showStar = true
  emailStore.contentData.showReply = true
  uiStore.mobileDetailOpen = true
}

function getSnoozeList(emailId, size) {
  return emailSnoozeList(emailId, size)
}

// "Back to inbox" ends the snooze now.
function unsnoozeAction(emailId) {
  emailUnsnooze([emailId]).then(() => scroll.value.deleteEmail([emailId]))
    .catch(() => ElMessage({ message: t('operationFailMsg'), type: 'error', plain: true }))
}
</script>
