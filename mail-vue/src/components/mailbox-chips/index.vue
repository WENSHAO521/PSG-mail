<template>
  <!-- Mist mailbox switcher: "All mailboxes" plus one chip per address the
       user can read. Only shown when there is more than one address. Chips
       that don't fit the list's width fold into a "+N" menu; the open
       mailbox always stays visible. -->
  <div v-if="mailboxes.length > 1" ref="rowRef" class="mailbox-chips" role="tablist" :aria-label="$t('mailboxes')">
    <button type="button" role="tab" class="mb-chip" :class="{ active: allActive }"
            :aria-selected="allActive" @click="router.push({ name: 'all-inbox' })">
      {{ $t('allInbox') }}
    </button>
    <button v-for="acc in shown" :key="acc.accountId" type="button" role="tab" class="mb-chip"
            :class="{ active: isActive(acc) }" :aria-selected="isActive(acc)" :title="acc.email" @click="open(acc)">
      <span class="mb-dot" :style="{ background: mailboxColor(acc.email) }"></span>
      {{ shortName(acc) }}
    </button>
    <el-dropdown v-if="folded.length" trigger="click" placement="bottom-end" @command="open">
      <button type="button" class="mb-chip mb-more" :aria-label="$t('mailboxes')">+{{ folded.length }}</button>
      <template #dropdown>
        <el-dropdown-menu>
          <el-dropdown-item v-for="acc in folded" :key="acc.accountId" :command="acc">
            <span class="mb-dot mb-dot--menu" :style="{ background: mailboxColor(acc.email) }"></span>{{ acc.email }}
          </el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>

    <!-- Off-screen copy of every chip, used only to measure widths. -->
    <div ref="measureRef" class="mailbox-chips mailbox-chips--measure" aria-hidden="true">
      <span class="mb-chip">{{ $t('allInbox') }}</span>
      <span v-for="acc in mailboxes" :key="acc.accountId" class="mb-chip">
        <span class="mb-dot"></span>{{ shortName(acc) }}
      </span>
      <span class="mb-chip mb-more">+{{ mailboxes.length }}</span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import router from '@/router/index.js'
import { accountListAll } from '@/request/account.js'
import { useAccountStore } from '@/store/account.js'
import { mailboxColor } from '@/utils/avatar.js'

const GAP = 6
const route = useRoute()
const accountStore = useAccountStore()
const mailboxes = ref([])
const rowRef = ref(null)
const measureRef = ref(null)

const allActive = computed(() => route.meta?.name === 'all-inbox')

async function load() {
  try { mailboxes.value = await accountListAll() } catch {}
}
onMounted(load)
// Addresses added or renamed in Settings show up when you come back.
watch(() => route.meta?.name, (name, prev) => { if (prev === 'setting') load() })

function shortName(acc) { return acc.email.split('@')[0] + '@' }

function isActive(acc) {
  return route.meta?.name === 'email' && accountStore.currentAccountId === acc.accountId
}

function open(acc) {
  accountStore.setCurrentAccount(acc)
  if (route.meta?.name !== 'email') router.push({ name: 'email' })
}

// Chip widths from the off-screen copy, and the room the row has for them.
const sizes = ref(null)

// Visible chips: the open mailbox is reserved first (at its own measured
// width), then the others fill the remaining room in their usual order.
const shown = computed(() => {
  const list = mailboxes.value
  const sz = sizes.value
  if (!sz) return list
  const { all, acc, more, avail } = sz
  if (all + acc.reduce((s, w) => s + GAP + w, 0) <= avail) return list
  const activeIdx = list.findIndex(isActive)
  let used = all + GAP + more
  if (activeIdx >= 0) used += GAP + acc[activeIdx]
  const keep = new Set(activeIdx >= 0 ? [activeIdx] : [])
  for (let i = 0; i < list.length; i++) {
    if (keep.has(i)) continue
    if (used + GAP + acc[i] > avail) break
    used += GAP + acc[i]
    keep.add(i)
  }
  if (!keep.size && list.length) keep.add(0)
  return list.filter((_, i) => keep.has(i))
})
const folded = computed(() => {
  const ids = new Set(shown.value.map(a => a.accountId))
  return mailboxes.value.filter(a => !ids.has(a.accountId))
})

function measure() {
  const row = rowRef.value
  const m = measureRef.value
  if (!row || !m) return
  const style = getComputedStyle(row)
  // A little slack: the active chip is bold and so slightly wider.
  const avail = row.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 8
  const widths = [...m.children].map(c => c.offsetWidth)
  sizes.value = {
    all: widths[0],
    acc: widths.slice(1, 1 + mailboxes.value.length),
    more: widths[widths.length - 1],
    avail,
  }
}

let ro = null
watch(rowRef, el => {
  ro?.disconnect()
  if (!el) return
  ro = new ResizeObserver(() => measure())
  ro.observe(el)
  nextTick(measure)
})
watch(mailboxes, () => nextTick(measure))
onBeforeUnmount(() => ro?.disconnect())
</script>

<style scoped lang="scss">
.mailbox-chips {
  position: relative;
  display: flex;
  gap: 6px;
  padding: 12px 20px 0;
  overflow: hidden;
}

.mailbox-chips--measure {
  position: absolute;
  top: 0;
  left: 0;
  padding: 0;
  visibility: hidden;
  pointer-events: none;
  white-space: nowrap;
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
  white-space: nowrap;
  cursor: pointer;

  &.active {
    background: var(--psg-primary-muted-strong);
    color: color-mix(in srgb, var(--psg-primary) 80%, var(--psg-text));
    font-weight: 700;
  }
}

.mb-more { font-weight: 700; color: var(--psg-text); }

.mb-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.mb-dot--menu { display: inline-block; margin-right: 8px; }
</style>
