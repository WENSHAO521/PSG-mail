<template>
  <emailScroll ref="scroll"
               :allow-star="false"
               :getEmailList="getEmailList"
               :emailDelete="emailDelete"
               :star-add="starAdd"
               :star-cancel="starCancel"
               @jump="jumpContent"
               actionLeft="6px"
               :show-account-icon="false"
               :show-first-loading="false"
               :showStar="false"
               :explorer-title="$t('drafts')"
               :explorer-subtitle="$t('draftsSubtitle')"
               :explorer-search-placeholder="$t('searchPlaceholder')"
               :hide-inline-search="true"
               :show-sort="true"
               :time-sort="params.timeSort"
               @delete-draft="deleteDraft"
               @sort="changeTimeSort"
               :type="'draft'"
  >
    <template #name="props">
      <span class="send-email">{{ recipientSummary(props.email, $t('bcc')) || '(' + $t('noRecipient') + ')' }}</span>
    </template>
    <template #subject="props">
      {{ props.email.subject || '(' + $t('noSubject') + ')' }}
    </template>
  </emailScroll>
</template>

<script setup>
import emailScroll from "@/components/email-scroll/index.vue"
import { recipientSummary } from "@/utils/text.js"
import {emailDelete} from "@/request/email.js";
import {starAdd, starCancel} from "@/request/star.js";
import {defineOptions, reactive, ref, watch} from "vue";
import {useUiStore} from "@/store/ui.js";
import {userDraftStore} from "@/store/draft.js";
import {listDrafts, deleteDrafts} from "@/utils/draft-sync.js";

defineOptions({
  name: 'draft'
})

const draftStore = userDraftStore();
const uiStore = useUiStore();
const scroll = ref({})
const params = reactive({ timeSort: 0 })

watch(() => draftStore.refreshList, async () => {
  const {list} = await getEmailList();
  scroll.value.emailList.length = 0
  scroll.value.handleList(list);
  scroll.value.emailList.push(...list)
})

function changeTimeSort() {
  params.timeSort = params.timeSort ? 0 : 1
  scroll.value.refreshList()
}

// The server returns every draft at once, so there is never a second page.
async function getEmailList(emailId, size, opts = {}) {
  if (opts.more) return {list: []}
  return {list: await listDrafts(params.timeSort)}
}

async function deleteDraft(draftIds) {
  await deleteDrafts(draftIds);
}

function jumpContent(email) {
  uiStore.writerRef?.openDraft({...email, attachments: email.attachments ?? []});
}

</script>
<style>
.send-email {
  font-weight: normal;
}
</style>
