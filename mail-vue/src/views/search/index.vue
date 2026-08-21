<template>
  <div class="search-page">
    <div class="search-bar-row">
      <div class="search-input-wrap">
        <Icon icon="solar:magnifer-linear" width="18" height="18" class="search-icon"/>
        <input
          ref="inputRef"
          v-model="queryText"
          class="search-input"
          :placeholder="$t('searchOperatorsPlaceholder')"
          @keydown.enter="runSearch()"
        />
        <Icon v-if="queryText" icon="solar:close-circle-linear" width="17" height="17"
              class="search-clear" @click="queryText = ''; results = []; searched = false"/>
      </div>
      <el-button type="primary" class="search-go-btn" @click="runSearch()">{{ $t('search') }}</el-button>
    </div>

    <div class="search-operator-hint">
      {{ $t('searchOperatorsHint') }}
    </div>

    <!-- Recent searches -->
    <div v-if="!searched && searchStore.recent.length" class="recent-block">
      <div class="recent-head">
        <span>{{ $t('recentSearches') }}</span>
        <button class="link-btn dim" @click="searchStore.clear()">{{ $t('clear') }}</button>
      </div>
      <div class="recent-chips">
        <button v-for="q in searchStore.recent" :key="q" class="recent-chip" @click="queryText = q; runSearch()">
          {{ q }}
        </button>
      </div>
    </div>

    <!-- Results -->
    <div v-if="searched" class="results-block">
      <div class="results-count" v-if="results.length">{{ $t('searchResultCount', { count: results.length }) }}</div>
      <div v-if="!loading && !results.length" class="empty-state">
        <Icon icon="solar:file-search-linear" width="32" height="32" class="empty-icon"/>
        <div class="empty-title">{{ $t('noSearchResults') }}</div>
      </div>

      <div class="result-list">
        <div v-for="item in results" :key="item.emailId" class="result-row" @click="openResult(item)">
          <div class="result-row-top">
            <span class="result-sender" :class="{ unread: item.unread === 0 }">{{ item.name || item.sendEmail }}</span>
            <span class="row-label-dots" v-if="item.labels && item.labels.length">
              <span v-for="l in item.labels" :key="l.labelId" class="row-label-dot" :style="{ background: l.color }" :title="l.name"></span>
            </span>
            <Icon v-if="hasAttachment(item)" icon="solar:paperclip-linear" width="12" height="12" class="result-att-icon"/>
            <span class="result-time">{{ formatTime(item.createTime) }}</span>
          </div>
          <span class="result-subject" :class="{ unread: item.unread === 0 }">{{ item.subject || $t('noSubject') }}</span>
          <span class="result-snippet">{{ snippet(item) }}</span>
        </div>
      </div>

      <div class="load-more-row" v-if="results.length && !noMore">
        <el-button size="small" :loading="loading" @click="runSearch(true)">{{ $t('loadMore') }}</el-button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, defineOptions, onMounted, nextTick } from 'vue'
import { Icon } from '@iconify/vue'
import { emailSearch } from '@/request/email.js'
import { useSearchStore } from '@/store/search.js'
import { useAccountStore } from '@/store/account.js'
import { useEmailStore } from '@/store/email.js'
import { useUiStore } from '@/store/ui.js'
import { fromNow } from '@/utils/day.js'

defineOptions({ name: 'search' })

const searchStore = useSearchStore()
const accountStore = useAccountStore()
const emailStore = useEmailStore()
const uiStore = useUiStore()

const inputRef = ref(null)
const queryText = ref('')
const results = ref([])
const searched = ref(false)
const loading = ref(false)
const noMore = ref(false)

onMounted(() => nextTick(() => inputRef.value?.focus()))

function stripHtml(html) {
  return String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function snippet(item) {
  const text = item.text || stripHtml(item.content)
  return text.slice(0, 140)
}

function hasAttachment(item) {
  return (item.attList || []).length > 0
}

function formatTime(t) {
  return t ? fromNow(t) : ''
}

async function runSearch(loadMore = false) {
  const q = queryText.value.trim()
  if (!q) return
  loading.value = true
  try {
    const accountId = accountStore.currentAccountId
    const allReceive = accountStore.currentAccount?.allReceive
    const cursor = loadMore && results.value.length ? results.value.at(-1).emailId : 0
    const data = await emailSearch(q, accountId, allReceive, cursor, 30)
    if (!loadMore) {
      results.value = data.list || []
      searchStore.remember(q)
    } else {
      results.value.push(...(data.list || []))
    }
    noMore.value = (data.list || []).length < 30
    searched.value = true
  } catch {
    if (!loadMore) results.value = []
    searched.value = true
  } finally {
    loading.value = false
  }
}

function openResult(item) {
  emailStore.contentData.email = item
  emailStore.contentData.delType = 'logic'
  emailStore.contentData.showStar = true
  emailStore.contentData.showReply = true
  uiStore.mobileDetailOpen = true
}
</script>

<style scoped lang="scss">
.search-page {
  height: 100%;
  overflow-y: auto;
  padding: 14px 14px 32px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: var(--pm-surface, #fff);
  color: var(--pm-text, #172033);
}

.search-bar-row {
  position: sticky;
  top: 0;
  z-index: 4;
  display: flex;
  gap: 8px;
  padding-bottom: 2px;
  background: var(--pm-surface, #fff);
}

.search-input-wrap {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 40px;
  padding: 0 11px;
  background: var(--pm-surface-subtle, #f8f9fb);
  border: 1px solid var(--pm-border, #e3e7ed);
  border-radius: var(--pm-radius-md, 10px);
  transition: border-color .12s ease, box-shadow .12s ease, background .12s ease;

  &:focus-within {
    background: var(--pm-surface, #fff);
    border-color: rgba(var(--pm-brand-rgb, 180, 35, 61), .52);
    box-shadow: 0 0 0 3px rgba(var(--pm-brand-rgb, 180, 35, 61), .07);
  }
}

.search-icon,
.search-clear {
  color: var(--pm-text-3, #7d8797);
  flex-shrink: 0;
}
.search-clear { cursor: pointer; }

.search-input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--pm-text, #172033);
  font-family: inherit;
  font-size: 13.5px;
  line-height: 20px;

  &::placeholder { color: var(--pm-text-3, #7d8797); }
}

.search-go-btn {
  height: 40px !important;
  min-height: 40px !important;
  padding: 0 16px !important;
  border-radius: var(--pm-radius-sm, 8px) !important;
}

.search-operator-hint {
  padding: 0 2px;
  color: var(--pm-text-3, #7d8797);
  font-family: inherit;
  font-size: 11px;
  line-height: 17px;
}

.recent-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 10px;
}

.recent-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--pm-text-3, #7d8797);
  font-size: 11px;
  font-weight: 650;
}

.link-btn {
  border: 0;
  background: transparent;
  color: var(--pm-brand, #b4233d);
  cursor: pointer;
  font-size: 11px;
  padding: 3px 5px;
  border-radius: 5px;
  &:hover { background: var(--pm-brand-soft, #fbeef1); }
}

.recent-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.recent-chip {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 6px 9px;
  border: 1px solid var(--pm-border, #e3e7ed);
  border-radius: 7px;
  background: var(--pm-surface, #fff);
  color: var(--pm-text-2, #4f5b6e);
  cursor: pointer;
  font-size: 12px;
  text-align: left;
  &:hover { background: var(--pm-surface-hover, #f3f5f8); color: var(--pm-text, #172033); }
}

.results-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 0;
}

.results-count {
  padding: 4px 2px 2px;
  color: var(--pm-text-3, #7d8797);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.empty-state {
  min-height: 220px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--pm-text-3, #7d8797);
}
.empty-icon { opacity: .42; }
.empty-title { font-size: 13px; }

.result-list {
  margin-inline: -14px;
  border-top: 1px solid var(--pm-border, #e3e7ed);
  background: var(--pm-surface, #fff);
}

.result-row {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-height: 74px;
  padding: 9px 14px;
  border-bottom: 1px solid var(--pm-border, #e3e7ed);
  background: var(--pm-surface, #fff);
  cursor: pointer;
  transition: background .12s ease;

  &:hover { background: var(--pm-surface-hover, #f3f5f8); }
}

.result-row-top {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 6px;
}

.result-sender {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--pm-text-2, #4f5b6e);
  font-size: 12.5px;
  font-weight: 520;
  &.unread { color: var(--pm-text, #172033); font-weight: 700; }
}

.result-time {
  flex-shrink: 0;
  color: var(--pm-text-3, #7d8797);
  font-size: 10.5px;
  font-variant-numeric: tabular-nums;
}

.result-subject {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--pm-text, #172033);
  font-size: 12.5px;
  font-weight: 520;
  &.unread { font-weight: 650; }
}

.result-snippet {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--pm-text-3, #7d8797);
  font-size: 11.5px;
}

.row-label-dots { display: inline-flex; gap: 3px; flex-shrink: 0; }
.row-label-dot { width: 6px; height: 6px; border-radius: 50%; }
.result-att-icon { color: var(--pm-text-3, #7d8797); flex-shrink: 0; }

.load-more-row {
  display: flex;
  justify-content: center;
  padding: 10px 0;
}

@media (max-width: 768px) {
  .search-page { padding: 10px 10px 24px; }
  .search-bar-row { gap: 6px; }
  .search-input-wrap { height: 42px; }
  .search-go-btn { height: 42px !important; min-height: 42px !important; padding-inline: 13px !important; }
  .search-operator-hint { font-size: 10.5px; }
  .result-list { margin-inline: -10px; }
  .result-row { min-height: 82px; padding: 10px 12px; }
  .result-sender { font-size: 13px; }
  .result-subject { font-size: 13px; }
  .result-snippet { font-size: 12px; }
}
</style>
