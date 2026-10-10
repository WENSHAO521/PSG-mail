<template>
  <!-- Mist folder column: plain text on the mist ground, the active folder
       lifted onto a white chip. On phones the same list is a slide-in sheet
       opened from the mobile header's title. -->
  <div class="folders-host">
  <div class="folders-backdrop" :data-open="String(uiStore.asideShow)" @click="uiStore.asideShow = false"></div>
  <nav ref="sheetRef" class="folders" :data-open="String(uiStore.asideShow)" :aria-label="$t('mailSection')"
       :style="sheetDx ? { transform: `translateX(${sheetDx}px)`, transition: 'none' } : null">
    <div class="folders-sheet-head">
      <span>{{ $t('mailSection') }}</span>
      <button type="button" class="folders-close" :aria-label="$t('close')" @click="uiStore.asideShow = false">
        <Icon icon="psg:close" width="18" height="18" />
      </button>
    </div>

    <button v-for="f in visibleFolders" :key="f.name" type="button" class="folder"
            :class="{ active: route.meta?.name === f.name }" @click="go({ name: f.name })">
      <Icon :icon="f.icon" width="18" height="18" class="folder-icon" />
      <span class="folder-label">{{ $t(f.labelKey) }}</span>
      <span v-if="f.name === 'email' && emailStore.inboxUnreadCount > 0" class="folder-count">
        {{ emailStore.inboxUnreadCount > 99 ? '99+' : emailStore.inboxUnreadCount }}
      </span>
    </button>

    <div class="folders-title">
      <span>{{ $t('labels') }}</span>
      <button type="button" class="folders-add" :title="$t('newLabel')" :aria-label="$t('newLabel')" @click="labelEditorRef.open()">
        <Icon icon="psg:add-circle" width="15" height="15" />
      </button>
    </div>
    <div v-for="l in labelStore.labels" :key="l.labelId" class="folder-row">
      <button type="button" class="folder"
              :class="{ active: route.name === 'label' && Number(route.params.id) === l.labelId }"
              @click="go({ name: 'label', params: { id: l.labelId } })">
        <span class="folder-swatch" :style="{ background: l.color }"></span>
        <span class="folder-label">{{ l.name }}</span>
        <span v-if="l.emailCount" class="folder-count folder-count--quiet">{{ l.emailCount }}</span>
      </button>
      <button type="button" class="folder-more" :title="$t('labelEdit')" :aria-label="$t('labelEdit')"
              @click="labelEditorRef.open(l)">
        <Icon icon="psg:more" width="16" height="16" />
      </button>
    </div>
    <LabelEditor ref="labelEditorRef" @created="l => go({ name: 'label', params: { id: l.labelId } })"
                 @deleted="onLabelDeleted" />
  </nav>
  </div>
</template>

<script setup>
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { bindHorizontalDrag, committed, haptic, isTouchLayout } from '@/utils/gestures.js'
import { useRoute } from 'vue-router'
import { Icon } from '@iconify/vue'
import { useI18n } from 'vue-i18n'
import router from '@/router/index.js'
import { useUiStore } from '@/store/ui.js'
import { useEmailStore } from '@/store/email.js'
import { useLabelStore } from '@/store/label.js'
import { hasPerm } from '@/perm/perm.js'
import LabelEditor from '@/components/label-editor/index.vue'

const { t } = useI18n()
const route = useRoute()
const uiStore = useUiStore()
const emailStore = useEmailStore()
const labelStore = useLabelStore()

const FOLDERS = [
  { name: 'email',     labelKey: 'inbox',         icon: 'psg:inbox' },
  { name: 'star',      labelKey: 'starred',       icon: 'psg:star' },
  { name: 'send',      labelKey: 'sent',          icon: 'psg:send',  perm: 'email:send' },
  { name: 'draft',     labelKey: 'drafts',        icon: 'psg:draft', perm: 'email:send' },
  { name: 'scheduled', labelKey: 'scheduled',     icon: 'psg:clock', perm: 'email:send' },
  { name: 'archive',   labelKey: 'archiveFolder', icon: 'psg:archive' },
  { name: 'spam',      labelKey: 'spam',          icon: 'psg:spam' },
  { name: 'trash',     labelKey: 'deletedMail',   icon: 'psg:trash' },
]
const visibleFolders = computed(() => FOLDERS.filter(f => !f.perm || hasPerm(f.perm)))

// Phones: the open sheet follows a leftward swipe and closes past the
// threshold (a short flick works too).
const sheetRef = ref(null)
const sheetDx = ref(0)
let unbindSheet = null

onMounted(() => {
  labelStore.load()
  if (sheetRef.value) {
    unbindSheet = bindHorizontalDrag(sheetRef.value, {
      enabled: () => isTouchLayout() && uiStore.asideShow,
      onMove: dx => { sheetDx.value = Math.min(0, dx) },
      onEnd: (dx, vx) => {
        sheetDx.value = 0
        if (committed(dx, vx, 'left')) { haptic(10); uiStore.asideShow = false }
      },
      onCancel: () => { sheetDx.value = 0 },
    })
  }
})
onBeforeUnmount(() => unbindSheet?.())

function go(to) {
  uiStore.asideShow = false
  router.push(to)
}

const labelEditorRef = ref(null)

function onLabelDeleted(label) {
  if (route.name === 'label' && Number(route.params.id) === label.labelId) go({ name: 'email' })
}
</script>

<style scoped lang="scss">
.folders-host {
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.folders {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-height: 0;
  overflow-y: auto;
  padding: 2px 4px 12px 0;
  scrollbar-width: none;

  &::-webkit-scrollbar { display: none; }
}

.folders-sheet-head { display: none; }

.folder {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 40px;
  padding: 0 12px;
  border: 0;
  border-radius: var(--psg-radius-md);
  background: transparent;
  color: var(--psg-text);
  font: inherit;
  font-size: 14px;
  font-weight: 500;
  text-align: left;
  cursor: pointer;
  transition: background .12s ease;

  @media (hover: hover) {
    &:hover:not(.active) { background: color-mix(in srgb, var(--psg-surface) 55%, transparent); }
  }

  &.active {
    background: var(--psg-surface);
    font-weight: 700;
    box-shadow: var(--psg-shadow-xs);

    .folder-icon { color: var(--psg-primary); }
  }
}

.folder-row {
  position: relative;
  display: flex;
  flex-direction: column;

  .folder { flex: 1; }

  @media (hover: none) { .folder { padding-right: 40px; } }

  &:hover .folder-more, .folder-more:focus-visible { opacity: 1; }
}

.folder-more {
  position: absolute;
  top: 50%;
  right: 6px;
  width: 28px;
  height: 28px;
  transform: translateY(-50%);
  display: grid;
  place-items: center;
  border: 0;
  border-radius: var(--psg-radius-xs);
  background: var(--psg-surface);
  color: var(--psg-text-muted);
  opacity: 0;
  cursor: pointer;
  transition: opacity .12s ease;

  /* No hover on touch screens: keep the menu reachable, and clear of the count. */
  @media (hover: none) { opacity: 1; background: transparent; }
  @media (hover: hover) { &:hover { color: var(--psg-text); } }
}

.folder-icon { color: var(--psg-text-muted); flex-shrink: 0; }

.folder-swatch {
  width: 10px;
  height: 10px;
  margin-inline: 4px;
  border-radius: 3px;
  flex-shrink: 0;
}

.folder-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.folder-count {
  font-size: 12px;
  font-weight: 700;
  color: var(--psg-primary);
  font-variant-numeric: tabular-nums;

  &--quiet { color: var(--psg-text-muted); font-weight: 500; }
}

.folders-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 8px 6px 12px;
  font-size: 12px;
  font-weight: 600;
  color: var(--psg-text-muted);
}

.folders-add {
  width: 26px;
  height: 26px;
  border: 0;
  border-radius: var(--psg-radius-xs);
  background: transparent;
  color: var(--psg-text-muted);
  display: grid;
  place-items: center;
  cursor: pointer;

  @media (hover: hover) { &:hover { background: var(--psg-surface); color: var(--psg-text); } }
}

.folders-backdrop { display: none; }

/* ── Phone: slide-in sheet ── */
@media (max-width: 1024px) {
  .folders {
    position: fixed;
    top: 0;
    bottom: 0;
    left: 0;
    z-index: 60;
    width: min(84vw, 320px);
    padding: calc(16px + env(safe-area-inset-top, 0px)) 12px calc(16px + env(safe-area-inset-bottom, 0px));
    background: var(--psg-canvas);
    border-radius: 0 var(--psg-radius-xl) var(--psg-radius-xl) 0;
    transform: translateX(-105%);
    transition: transform .2s ease, box-shadow .2s ease;

    /* Shadow only while open — parked off-screen it would bleed in. */
    &[data-open="true"] { transform: translateX(0); box-shadow: var(--psg-shadow-lg); }
    touch-action: pan-y;
  }

  .folders-sheet-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 4px 14px 12px;
    font-size: 22px;
    font-weight: 700;
  }

  .folders-close {
    width: 40px;
    height: 40px;
    border: 0;
    border-radius: var(--psg-radius-md);
    background: var(--psg-surface);
    color: var(--psg-text);
    display: grid;
    place-items: center;
  }

  .folder { height: 46px; }

  .folders-backdrop {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 55;
    background: var(--bg-overlay);
    opacity: 0;
    pointer-events: none;
    transition: opacity .2s ease;

    &[data-open="true"] { opacity: 1; pointer-events: auto; }
  }
}
</style>
