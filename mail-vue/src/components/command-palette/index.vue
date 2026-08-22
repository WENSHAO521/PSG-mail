<template>
  <teleport to="body">
    <transition name="palette">
      <div class="palette-overlay" v-if="show" @click.self="close" @keydown.esc="close">
        <div class="palette-box" role="dialog">
          <div class="palette-input-row">
            <Icon icon="psg:search" width="18" height="18" class="palette-search-icon"/>
            <input
              ref="inputRef"
              v-model="query"
              class="palette-input"
              :placeholder="$t('commandPlaceholder')"
              @keydown="onKeydown"
              autocomplete="off"
              spellcheck="false"
            />
            <kbd class="esc-badge">Esc</kbd>
          </div>

          <div class="palette-divider"/>

          <div class="palette-results" ref="listRef">
            <template v-for="group in groupedResults" :key="group.label">
              <div class="result-group-label">{{ group.label }}</div>
              <button
                class="result-item"
                v-for="(item, gi) in group.items"
                :key="item.id"
                :class="{ active: flatIndex(group, gi) === activeIdx }"
                @click="execute(item)"
                @mouseenter="activeIdx = flatIndex(group, gi)"
              >
                <span class="result-icon">
                  <Icon :icon="item.icon" width="15" height="15"/>
                </span>
                <span class="result-label">{{ item.label }}</span>
                <kbd v-if="item.shortcut" class="result-shortcut">{{ item.shortcut }}</kbd>
              </button>
            </template>
            <div class="palette-empty" v-if="!flatItems.length">
              {{ $t('noResults') }}
            </div>
          </div>
        </div>
      </div>
    </transition>
  </teleport>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { Icon } from '@iconify/vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useUiStore } from '@/store/ui.js'

const { t } = useI18n()
const router = useRouter()
const uiStore = useUiStore()

const show = ref(false)
const query = ref('')
const activeIdx = ref(0)
const inputRef = ref(null)
const listRef = ref(null)

const allActions = computed(() => [
  {
    id: 'compose', group: t('compose'), label: t('compose'),
    icon: 'psg:compose', shortcut: 'C',
    action: () => uiStore.writerRef?.open?.()
  },
  {
    id: 'inbox', group: t('navigate'), label: t('inbox'),
    icon: 'psg:inbox',
    action: () => router.push({ name: 'email' })
  },
  {
    id: 'sent', group: t('navigate'), label: t('sent'),
    icon: 'psg:send',
    action: () => router.push({ name: 'send' })
  },
  {
    id: 'drafts', group: t('navigate'), label: t('drafts'),
    icon: 'psg:draft',
    action: () => router.push({ name: 'draft' })
  },
  {
    id: 'starred', group: t('navigate'), label: t('starred'),
    icon: 'psg:bookmark',
    action: () => router.push({ name: 'star' })
  },
  {
    id: 'archive', group: t('navigate'), label: t('archiveFolder'),
    icon: 'psg:archive',
    action: () => router.push({ name: 'archive' })
  },
  {
    id: 'spam', group: t('navigate'), label: t('spam'),
    icon: 'psg:spam',
    action: () => router.push({ name: 'spam' })
  },
  {
    id: 'templates', group: t('navigate'), label: t('templates'),
    icon: 'psg:template',
    action: () => router.push({ name: 'templates' })
  },
  {
    id: 'groups', group: t('navigate'), label: t('contactGroups'),
    icon: 'psg:group',
    action: () => router.push({ name: 'groups' })
  },
  {
    id: 'settings', group: t('navigate'), label: t('settings'),
    icon: 'psg:settings',
    action: () => router.push({ name: 'setting' })
  },
  {
    id: 'dark', group: t('appearance'), label: t('darkMode'),
    icon: uiStore.dark ? 'mingcute:sun-fill' : 'solar:moon-linear',
    action: () => {
      const root = document.documentElement
      const next = !uiStore.dark
      root.setAttribute('class', next ? 'dark' : '')
      uiStore.dark = next
    }
  },
])

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return allActions.value
  return allActions.value.filter(a =>
    a.label.toLowerCase().includes(q) ||
    a.group.toLowerCase().includes(q)
  )
})

const groupedResults = computed(() => {
  const map = new Map()
  for (const item of filtered.value) {
    if (!map.has(item.group)) map.set(item.group, [])
    map.get(item.group).push(item)
  }
  return [...map.entries()].map(([label, items]) => ({ label, items }))
})

const flatItems = computed(() => filtered.value)

function flatIndex(group, gi) {
  let offset = 0
  for (const g of groupedResults.value) {
    if (g.label === group.label) return offset + gi
    offset += g.items.length
  }
  return gi
}

function open() {
  show.value = true
  query.value = ''
  activeIdx.value = 0
  nextTick(() => inputRef.value?.focus())
}

function close() {
  show.value = false
  query.value = ''
}

function execute(item) {
  close()
  nextTick(() => item.action())
}

function onKeydown(e) {
  const len = flatItems.value.length
  if (!len) return
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    activeIdx.value = (activeIdx.value + 1) % len
    scrollActive()
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    activeIdx.value = (activeIdx.value - 1 + len) % len
    scrollActive()
  } else if (e.key === 'Enter') {
    e.preventDefault()
    execute(flatItems.value[activeIdx.value])
  }
}

function scrollActive() {
  nextTick(() => {
    const el = listRef.value?.querySelector('.result-item.active')
    el?.scrollIntoView({ block: 'nearest' })
  })
}

watch(query, () => { activeIdx.value = 0 })

// Allow opening from anywhere (e.g. mobile header / tab bar) via the store flag
watch(() => uiStore.commandPaletteShow, (v) => {
  if (v) { open(); uiStore.commandPaletteShow = false }
})

defineExpose({ open, close })
</script>

<style lang="scss" scoped>
/* ── Overlay ── */
.palette-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 12vh;
  background: rgba(0, 0, 0, 0.40);
}

/* ── Palette box — opaque, no glass ── */
.palette-box {
  width: min(580px, calc(100vw - 32px));
  background: var(--psg-surface);
  border: 1px solid var(--psg-border);
  box-shadow: 0 8px 40px rgba(0,0,0,0.22), 0 2px 8px rgba(0,0,0,0.10);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  max-height: 70vh;
}

/* ── Input row ── */
.palette-input-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 18px;
}

.palette-search-icon {
  color: var(--psg-text-secondary);
  flex-shrink: 0;
}

.palette-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  font-size: 16px;
  font-weight: 500;
  color: var(--psg-text);
  font-family: inherit;
  &::placeholder { color: var(--psg-text-secondary); }
}

.esc-badge {
  font-size: 10px;
  font-family: var(--psg-font-mono);
  color: var(--psg-text-secondary);
  background: var(--psg-surface-muted);
  border: 1px solid var(--psg-border);
  border-radius: var(--psg-radius-sm);
  padding: 2px 6px;
  flex-shrink: 0;
  cursor: default;
  user-select: none;
}

.palette-divider {
  height: 1px;
  background: var(--psg-border);
  flex-shrink: 0;
}

/* ── Results ── */
.palette-results {
  overflow-y: auto;
  padding: 6px 8px 8px;
  flex: 1;
  min-height: 0;
}

.result-group-label {
  font-size: 9.5px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--psg-text-secondary);
  padding: 8px 10px 4px;
  user-select: none;
}

.result-item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 9px 10px;
  background: transparent;
  border: none;
  border-radius: var(--psg-radius-sm);
  cursor: pointer;
  text-align: left;
  transition: background 0.10s;
  font-family: inherit;

  &.active, &:hover {
    background: var(--psg-surface-active);
  }
  &.active .result-icon { color: var(--psg-primary); }
}

.result-icon {
  color: var(--psg-text-secondary);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  transition: color 0.10s;
}

.result-label {
  flex: 1;
  font-size: 14px;
  font-weight: 500;
  color: var(--psg-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.result-shortcut {
  font-size: 10px;
  font-family: var(--psg-font-mono);
  color: var(--psg-text-secondary);
  background: var(--psg-surface-muted);
  border: 1px solid var(--psg-border);
  border-radius: var(--psg-radius-sm);
  padding: 2px 6px;
  flex-shrink: 0;
  user-select: none;
}

.palette-empty {
  padding: 24px 10px;
  text-align: center;
  font-size: 13.5px;
  color: var(--psg-text-secondary);
}

/* ── Animation ── */
.palette-enter-active {
  transition: opacity 0.18s cubic-bezier(0.22,1,0.36,1),
              transform 0.18s cubic-bezier(0.22,1,0.36,1);
}
.palette-leave-active {
  transition: opacity 0.14s ease, transform 0.14s ease;
}
.palette-enter-from {
  opacity: 0;
  .palette-box { transform: scale(0.96) translateY(-8px); }
}
.palette-leave-to {
  opacity: 0;
  .palette-box { transform: scale(0.97) translateY(-4px); }
}
</style>
