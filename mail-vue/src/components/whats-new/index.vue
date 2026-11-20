<template>
  <el-dialog v-model="whatsNewVisible" width="440" align-center class="whats-new" :show-close="false"
             @closed="markWhatsNewSeen">
    <template #header="{ titleId }">
      <div class="wn-head">
        <BrandLogo class="wn-logo" />
        <div>
          <div :id="titleId" class="wn-title">{{ $t('whatsNewTitle') }}</div>
          <div class="wn-sub">v{{ notes?.version }} · {{ notes?.date }}</div>
        </div>
      </div>
    </template>

    <ul v-if="notes" class="wn-list">
      <li v-for="item in notes.items" :key="item.icon" class="wn-item">
        <span class="wn-icon"><Icon :icon="item.icon" width="18" height="18" /></span>
        <div>
          <strong>{{ item[lang].title }}</strong>
          <span>{{ item[lang].desc }}</span>
        </div>
      </li>
    </ul>

    <template #footer>
      <el-button type="primary" class="wn-btn" @click="whatsNewVisible = false">{{ $t('whatsNewGotIt') }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import { Icon } from '@iconify/vue'
import { useI18n } from 'vue-i18n'
import BrandLogo from '@/components/brand-logo/index.vue'
import { whatsNewVisible, currentNotes, markWhatsNewSeen, showWhatsNewIfUpdated } from '@/utils/whats-new.js'

const { locale } = useI18n()
const notes = currentNotes()
const lang = computed(() => (locale.value === 'zh' ? 'zh' : 'en'))

// Let the mailbox render first so the dialog doesn't compete with the load.
onMounted(() => setTimeout(showWhatsNewIfUpdated, 1200))
</script>

<style lang="scss" scoped>
.wn-head { display: flex; align-items: center; gap: 12px; }
.wn-logo { width: 20px; height: 24px; color: var(--psg-text); }
.wn-title { font-family: var(--psg-font-display); font-size: 22px; font-weight: 400; color: var(--psg-text); line-height: 28px; }
.wn-sub { margin-top: 2px; font-family: var(--psg-font-mono); font-size: 12px; color: var(--psg-text-muted); }

/* A short changelog: rows on hairlines, not tiles. */
.wn-list { display: flex; flex-direction: column; gap: 0; margin: 0; padding: 0; list-style: none; }

.wn-item {
  display: flex;
  gap: 12px;
  padding: 16px 0;
  border-top: 1px solid var(--psg-border);

  &:last-child { border-bottom: 1px solid var(--psg-border); }

  > div { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  strong { font-size: 14px; font-weight: 500; color: var(--psg-text); }
  span { font-size: 13px; line-height: 20px; color: var(--psg-text-secondary); }
}

.wn-icon {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  color: var(--psg-text-muted);
}

.wn-btn { width: 100%; }
</style>
