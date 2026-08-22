<template>
  <div class="search-page">
    <div class="search-bar-row">
      <div class="search-input-wrap">
        <Icon icon="psg:search" width="18" height="18" class="search-icon"/>
        <input
          ref="inputRef"
          v-model="queryText"
          class="search-input"
          :placeholder="$t('searchOperatorsPlaceholder')"
          @keydown.enter="runSearch()"
        />
        <Icon v-if="queryText" icon="psg:close-circle" width="17" height="17"
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
        <Icon icon="psg:file-search" width="32" height="32" class="empty-icon"/>
        <div class="empty-title">{{ $t('noSearchResults') }}</div>
      </div>

      <div class="result-list">
        <div v-for="item in results" :key="item.emailId" class="result-row" @click="openResult(item)">
          <div class="result-row-top">
            <span class="result-sender" :class="{ unread: item.unread === 0 }">{{ item.name || item.sendEmail }}</span>
            <span class="row-label-dots" v-if="item.labels && item.labels.length">
              <span v-for="l in item.labels" :key="l.labelId" class="row-label-dot" :style="{ background: l.color }" :title="l.name"></span>
            </span>
            <Icon v-if="hasAttachment(item)" icon="psg:paperclip" width="12" height="12" class="result-att-icon"/>
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
  padding: 16px 16px 40px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  background: var(--psg-canvas);
}

.search-bar-row {
  display: flex;
  gap: 10px;
}

.search-input-wrap {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 44px;
  padding: 0 14px;
  background: var(--psg-surface);
  border: 1px solid var(--psg-border);
  border-radius: var(--psg-radius-md);
}

.search-icon { color: var(--psg-text-secondary); flex-shrink: 0; }
.search-clear { color: var(--psg-text-secondary); cursor: pointer; flex-shrink: 0; }

.search-input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  font-size: 14px;
  color: var(--psg-text);
  font-family: var(--psg-font-mono);
}

.search-go-btn { border-radius: var(--psg-radius-md) !important; height: 44px; padding: 0 20px; }

.search-operator-hint {
  font-size: 11.5px;
  color: var(--psg-text-secondary);
  font-family: var(--psg-font-mono);
}

.recent-block { display: flex; flex-direction: column; gap: 8px; }
.recent-head {
  display: flex; align-items: center; justify-content: space-between;
  font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em;
  color: var(--psg-text-muted);
}
.recent-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.recent-chip {
  font-size: 12.5px;
  padding: 5px 12px;
  border-radius: var(--psg-radius-full);
  border: 1px solid var(--psg-border);
  background: var(--psg-surface);
  cursor: pointer;
  color: var(--psg-text-secondary);
  &:hover { background: var(--psg-surface-muted); }
}

.results-block { display: flex; flex-direction: column; gap: 10px; }
.results-count { font-size: 12px; color: var(--psg-text-secondary); }

.empty-state { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 48px 0; }
.empty-icon { color: var(--psg-text-secondary); opacity: 0.35; }
.empty-title { font-size: 13.5px; color: var(--psg-text-secondary); }

.result-list {
  background: var(--psg-surface);
  border-radius: var(--psg-radius-md);
  border: 1px solid var(--psg-border);
  overflow: hidden;
}

.result-row {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--psg-border);
  cursor: pointer;
  &:last-child { border-bottom: none; }
  &:hover { background: var(--psg-surface-muted); }
}

.result-row-top {
  display: flex;
  align-items: center;
  gap: 6px;
}

.result-sender {
  flex: 1;
  min-width: 0;
  font-size: 12.5px;
  color: var(--psg-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  &.unread { font-weight: 700; color: var(--psg-text); }
}

.result-time { font-size: 11px; color: var(--psg-text-secondary); flex-shrink: 0; }

.result-subject {
  display: block;
  font-size: 13.5px;
  color: var(--psg-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  &.unread { font-weight: 700; color: var(--psg-text); }
}

.result-snippet {
  display: block;
  font-size: 12px;
  color: var(--psg-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.row-label-dots { display: inline-flex; gap: 3px; flex-shrink: 0; }
.row-label-dot { width: 6px; height: 6px; border-radius: 50%; }
.result-att-icon { color: var(--psg-text-secondary); flex-shrink: 0; }

.load-more-row { display: flex; justify-content: center; padding: 8px 0; }
</style>
