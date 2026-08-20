<template>
  <emailScroll
    type="label"
    ref="scroll"
    :getEmailList="getLabelEmailList"
    :emailDelete="emailDelete"
    :star-add="starAdd"
    :star-cancel="starCancel"
    actionLeft="6px"
    :show-account-icon="false"
    @jump="jumpContent"
  />
</template>

<script setup>
import emailScroll from "@/components/email-scroll/index.vue"
import { emailDelete } from "@/request/email.js"
import { labelEmails } from "@/request/label.js"
import { starAdd, starCancel } from "@/request/star.js"
import { useEmailStore } from "@/store/email.js"
import { useUiStore } from "@/store/ui.js"
import { defineOptions, ref, watch } from "vue"
import { useRoute } from "vue-router"

defineOptions({ name: 'label' })

const route = useRoute()
const scroll = ref({})
const emailStore = useEmailStore()
const uiStore = useUiStore()

// Switching between labels (still the same route component, keep-alive
// aside) must refresh — same pattern archive/spam/trash use for account
// switches.
watch(() => route.params.id, () => scroll.value.refreshList?.())

function jumpContent(email) {
  emailStore.contentData.email = email
  emailStore.contentData.delType = 'logic'
  emailStore.contentData.showStar = true
  emailStore.contentData.showReply = true
  uiStore.mobileDetailOpen = true
}

function getLabelEmailList(emailId, size) {
  return labelEmails(route.params.id, emailId, size)
}
</script>
