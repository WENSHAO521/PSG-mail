<template>
  <!-- Mist mailbox switcher: "All mailboxes" plus one chip per address the
       user can read. Only shown when there is more than one address. -->
  <div v-if="mailboxes.length > 1" class="mailbox-chips" role="tablist" :aria-label="$t('mailboxes')">
    <button type="button" role="tab" class="mb-chip" :class="{ active: route.meta?.name === 'all-inbox' }"
            :aria-selected="route.meta?.name === 'all-inbox'" @click="router.push({ name: 'all-inbox' })">
      {{ $t('allInbox') }}
    </button>
    <button v-for="acc in mailboxes" :key="acc.accountId" type="button" role="tab" class="mb-chip"
            :class="{ active: isActive(acc) }" :aria-selected="isActive(acc)" :title="acc.email" @click="open(acc)">
      <span class="mb-dot" :style="{ background: mailboxColor(acc.email) }"></span>
      {{ acc.email.split('@')[0] }}@
    </button>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import router from '@/router/index.js'
import { accountList } from '@/request/account.js'
import { useAccountStore } from '@/store/account.js'
import { mailboxColor } from '@/utils/avatar.js'

const route = useRoute()
const accountStore = useAccountStore()
const mailboxes = ref([])

async function load() {
  try {
    const list = await accountList(0, 30, null)
    mailboxes.value = Array.isArray(list) ? list : []
  } catch {}
}
onMounted(load)
// Addresses added or renamed in Settings show up when you come back.
watch(() => route.meta?.name, (name, prev) => { if (prev === 'setting') load() })

function isActive(acc) {
  return route.meta?.name === 'email' && accountStore.currentAccountId === acc.accountId
}

function open(acc) {
  accountStore.setCurrentAccount(acc)
  if (route.meta?.name !== 'email') router.push({ name: 'email' })
}
</script>

<style scoped lang="scss">
.mailbox-chips {
  display: flex;
  gap: 6px;
  padding: 12px 20px 0;
  overflow-x: auto;
  scrollbar-width: none;

  &::-webkit-scrollbar { display: none; }
}

.mb-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  height: 30px;
  padding: 0 12px;
  border: 0;
  border-radius: var(--psg-radius-full);
  background: var(--psg-surface-muted);
  color: var(--psg-text-secondary);
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;

  &.active {
    background: var(--psg-primary-muted-strong);
    color: color-mix(in srgb, var(--psg-primary) 80%, var(--psg-text));
    font-weight: 700;
  }
}

.mb-dot { width: 7px; height: 7px; border-radius: 50%; }
</style>
