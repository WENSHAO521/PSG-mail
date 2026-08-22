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
    @jump="jumpContent"
  >
    <template #first>
      <div class="trash-retention-hint" :title="$t('autoDeleteDaysUserWarn', { n: retentionDays })">
        <Icon icon="psg:warning" width="13" height="13" />
        <span>{{ $t('trashRetentionHint', { n: retentionDays }) }}</span>
      </div>
    </template>
  </emailScroll>
</template>

<script setup>
import emailScroll from "@/components/email-scroll/index.vue"
import { Icon } from "@iconify/vue"
import { emailPermanentDelete, emailTrashList, emailRestore } from "@/request/email.js"
import { starAdd, starCancel } from "@/request/star.js"
import { useEmailStore } from "@/store/email.js"
import { useAccountStore } from "@/store/account.js"
import { useUiStore } from "@/store/ui.js"
import { useSettingStore } from "@/store/setting.js"
import { defineOptions, computed, ref, watch } from "vue"

defineOptions({ name: 'trash' })

const scroll = ref({})
const emailStore = useEmailStore()
const accountStore = useAccountStore()
const uiStore = useUiStore()
const settingStore = useSettingStore()

const retentionDays = computed(() => settingStore.settings.autoDeleteDays > 0 ? settingStore.settings.autoDeleteDays : 30)

watch(() => accountStore.currentAccountId, () => scroll.value.refreshList())

function jumpContent(email) {
  emailStore.contentData.email = email
  emailStore.contentData.delType = 'logic'
  emailStore.contentData.showStar = true
  emailStore.contentData.showReply = false
  uiStore.mobileDetailOpen = true
}

function getTrashList(emailId, size) {
  const accountId  = accountStore.currentAccountId
  const allReceive = accountStore.currentAccount.allReceive
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
