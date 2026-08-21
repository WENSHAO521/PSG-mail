<template>
  <div
    v-if="visible"
    ref="controlRef"
    class="reader-more-control"
    :class="{ 'is-open': open }"
  >
    <span v-if="total > 0" class="reader-page-counter" aria-live="polite">
      {{ index }} / {{ total }}
    </span>
    <button
      class="reader-more-button"
      type="button"
      :aria-expanded="String(open)"
      aria-haspopup="menu"
      aria-label="More message actions"
      title="More message actions"
      @click.stop="toggle"
    >
      <Icon icon="solar:menu-dots-bold" width="20" height="20" />
    </button>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { Icon } from '@iconify/vue'
import { useEmailStore } from '@/store/email.js'

const route = useRoute()
const emailStore = useEmailStore()
const open = ref(false)
const controlRef = ref(null)

const mailRoutes = new Set([
  'email', 'all-inbox', 'send', 'draft', 'scheduled', 'star',
  'archive', 'spam', 'trash', 'label', 'all-email'
])

const visible = computed(() =>
  mailRoutes.has(String(route.name || '')) && !!emailStore.contentData.email
)
const index = computed(() => Number(emailStore.contentData.emailIndex || 0))
const total = computed(() => Number(emailStore.contentData.emailTotal || 0))

function syncRootClass() {
  document.documentElement.classList.toggle('reader-actions-open', open.value && visible.value)
}

function setOpen(value) {
  open.value = value
  syncRootClass()
}

function toggle() {
  setOpen(!open.value)
  if (open.value) {
    nextTick(() => {
      const menu = document.querySelector('.mail-detail-pane .detail-header .header-right')
      const firstButton = menu?.querySelector('button:not([disabled])')
      firstButton?.focus({ preventScroll: true })
    })
  }
}

function onPointerDown(event) {
  if (!open.value) return
  const target = event.target
  const nativeMenu = document.querySelector('.mail-detail-pane .detail-header .header-right')
  if (controlRef.value?.contains(target)) return
  if (nativeMenu?.contains(target)) return
  // Element Plus nests label / tooltip poppers under body.
  if (target?.closest?.('.el-popper, .el-popover, .el-tooltip__popper')) return
  setOpen(false)
}

function onKeyDown(event) {
  if (event.key === 'Escape' && open.value) {
    setOpen(false)
    nextTick(() => controlRef.value?.querySelector('button')?.focus())
  }
}

watch(visible, value => { if (!value) setOpen(false) })
watch(() => emailStore.contentData.email?.emailId, () => setOpen(false))
watch(() => route.name, () => setOpen(false))

onMounted(() => {
  document.addEventListener('pointerdown', onPointerDown, true)
  document.addEventListener('keydown', onKeyDown)
  syncRootClass()
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onPointerDown, true)
  document.removeEventListener('keydown', onKeyDown)
  document.documentElement.classList.remove('reader-actions-open')
})
</script>

<style scoped>
.reader-more-control {
  position: fixed;
  top: 9px;
  right: 12px;
  z-index: 80;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 36px;
  padding-left: 9px;
  border-radius: 9px;
  background: color-mix(in srgb, var(--pm-surface) 94%, transparent);
  color: var(--pm-text-3);
  backdrop-filter: blur(10px);
}

.reader-page-counter {
  font-size: 10.5px;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  color: var(--pm-text-3);
}

.reader-more-button {
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--pm-text-2);
  cursor: pointer;
}

.reader-more-button:hover,
.reader-more-button:focus-visible,
.reader-more-control.is-open .reader-more-button {
  background: var(--pm-surface-hover);
  color: var(--pm-text);
}

@media (max-width: 1024px) {
  .reader-more-control {
    top: calc(env(safe-area-inset-top, 0px) + 9px);
    right: 8px;
    height: 38px;
    padding-left: 7px;
  }

  .reader-more-button {
    width: 38px;
    height: 38px;
  }
}

@media (max-width: 430px) {
  .reader-page-counter { display: none; }
}

/* The existing ContentPane owns all handlers. We only change presentation:
   its secondary-action group becomes the actual More menu. */
:global(.mail-detail-pane .detail-header) {
  padding-right: 116px !important;
}

:global(.mail-detail-pane .detail-header .header-right) {
  display: none !important;
}

:global(html.reader-actions-open .mail-detail-pane .detail-header .header-right) {
  position: absolute !important;
  top: 48px !important;
  right: 10px !important;
  z-index: 90 !important;
  display: flex !important;
  align-items: center !important;
  gap: 2px !important;
  min-width: max-content !important;
  max-width: min(360px, calc(100vw - 24px)) !important;
  padding: 6px !important;
  border: 1px solid var(--pm-border) !important;
  border-radius: 10px !important;
  background: var(--pm-surface) !important;
  box-shadow: var(--pm-shadow-menu) !important;
}

:global(html.reader-actions-open .mail-detail-pane .detail-header .header-right .page-counter) {
  display: none !important;
}

:global(html.reader-actions-open .mail-detail-pane .detail-header .header-right .icon-btn) {
  width: 36px !important;
  height: 36px !important;
  border-radius: 8px !important;
}

@media (max-width: 1024px) {
  :global(.mail-detail-pane .detail-header) {
    padding-right: 60px !important;
  }

  :global(html.reader-actions-open .mail-detail-pane .detail-header .header-right) {
    top: calc(50px + env(safe-area-inset-top, 0px)) !important;
    right: 8px !important;
  }
}
</style>
