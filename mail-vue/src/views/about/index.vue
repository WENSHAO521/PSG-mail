<template>
  <div class="about-view">
    <el-scrollbar>
      <div class="about-body">

        <!-- ── Brand header ── -->
        <div class="about-hero">
          <BrandLogo class="hero-mark" aria-hidden="true" />
          <div class="hero-product">PSG Mail</div>
          <div class="hero-publisher">Panorama Scholarly Group</div>
          <div class="hero-version-chip">v{{ appVersion }}</div>
        </div>

        <!-- ── Version card ── -->
        <div class="about-card">
          <div class="about-card-title">{{ $t('version') }}</div>
          <div class="about-row">
            <span class="about-label">{{ $t('currentVersion') }}</span>
            <span class="about-value mono">v{{ appVersion }}</span>
          </div>
          <div v-if="hasNotes" class="about-row">
            <span class="about-label">{{ $t('whatsNewTitle') }}</span>
            <el-button class="about-btn" @click="openWhatsNew">{{ $t('whatsNewView') }}</el-button>
          </div>
        </div>

        <!-- ── Info card ── -->
        <div class="about-card">
          <div class="about-card-title">{{ $t('aboutApp') }}</div>
          <div class="about-row">
            <span class="about-label">{{ $t('publisher') }}</span>
            <span class="about-value">Panorama Scholarly Group</span>
          </div>
          <div class="about-row">
            <span class="about-label">{{ $t('license') }}</span>
            <span class="about-value mono">Proprietary</span>
          </div>
          <div class="about-row">
            <span class="about-label">{{ $t('sourceCode') }}</span>
            <a class="about-link" href="https://github.com/WENSHAO521/PSG-mail" target="_blank">
              github.com/WENSHAO521/PSG-mail
            </a>
          </div>
        </div>

      </div>
    </el-scrollbar>
  </div>
</template>

<script setup>
import BrandLogo from "@/components/brand-logo/index.vue"
import { defineOptions } from 'vue'
import { currentNotes, openWhatsNew } from '@/utils/whats-new.js'

defineOptions({ name: 'about' })

const appVersion = __APP_VERSION__
const hasNotes = !!currentNotes()
</script>

<style lang="scss" scoped>
.about-view {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.about-body {
  max-width: 640px;
  margin: 0 auto;
  padding: 40px 24px 60px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  width: 100%;
}

/* ── Hero ─────────────────────────────────────────── */
.about-hero {
  padding: 28px 24px 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  text-align: center;
}

.hero-mark {
  width: 52px;
  height: 62px;
  margin-bottom: 14px;
  color: var(--psg-text);
}

.hero-publisher {
  font-size: 14px;
  font-weight: 500;
  color: var(--psg-text-muted);
}

.hero-product {
  font-size: 28px;
  font-weight: 700;
  letter-spacing: -.02em;
  color: var(--psg-text);
  line-height: 1.2;
}

.hero-version-chip {
  margin-top: 10px;
  padding: 4px 12px;
  font-size: 12px;
  font-weight: 600;
  color: var(--psg-text-secondary);
  background: var(--psg-surface-muted);
  border-radius: var(--psg-radius-full);
}

/* ── Card ─────────────────────────────────────────── */
.about-card {
  background: var(--psg-surface-muted);
  border-radius: var(--psg-radius-lg);
  padding: 4px 0;
  overflow: hidden;
}

.about-card-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--psg-text-muted);
  padding: 12px 20px 4px;
}

/* ── Row ──────────────────────────────────────────── */
.about-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  gap: 16px;
  border-bottom: 1px solid color-mix(in srgb, var(--psg-border) 80%, var(--psg-surface));

  &:last-child { border-bottom: none; }
}

.about-label {
  font-size: 14px;
  color: var(--psg-text-secondary);
  flex-shrink: 0;
}

.about-value {
  font-size: 14px;
  color: var(--psg-text);
  text-align: right;

  &.mono {
    font-weight: 600;
  }
}

.about-link {
  font-family: var(--psg-font-sans);
  font-size: 14px;
  font-weight: 600;
  color: var(--psg-primary);
  text-decoration: none;
  text-underline-offset: 2px;
  transition: opacity 0.12s;

  &:hover { opacity: .7; }
}

/* ── Status badge ─────────────────────────────────── */
.about-status-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  font-weight: 600;
  padding: 3px 10px;
  border-radius: var(--psg-radius-full);
  background: color-mix(in srgb, currentColor 12%, transparent);

  .status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
    flex-shrink: 0;
  }

  &.status--idle       { color: var(--psg-text-muted); }
  &.status--checking   { color: var(--psg-text-secondary); }
  &.status--ok         { color: var(--psg-text-secondary); }
  &.status--available,
  &.status--ready      { color: var(--psg-primary); }
  &.status--error      { color: var(--psg-danger); }
}

/* ── Progress ─────────────────────────────────────── */
.update-progress {
  padding: 0 20px 12px;

  :deep(.el-progress-bar__outer) {
    border-radius: var(--psg-radius-sm);
    background: var(--psg-border);
  }

  :deep(.el-progress-bar__inner) {
    border-radius: var(--psg-radius-sm);
    background: var(--psg-primary);
  }
}

.update-error-detail {
  margin: 0 20px 12px;
  padding: 8px 10px;
  border: 1px solid var(--psg-danger);
  background: var(--psg-danger-muted);
  color: var(--psg-danger);
  font-size: 11px;
  line-height: 1.5;
  word-break: break-word;
}

/* ── Actions ──────────────────────────────────────── */
.about-actions {
  padding: 4px 20px 16px;
  display: flex;
  gap: 10px;
}

.about-btn {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0;
  text-transform: none;
  border-radius: var(--psg-radius-sm);
  border-color: var(--psg-border);
  display: flex;
  align-items: center;
  gap: 6px;

  &--install {
    background: var(--psg-primary);
    border-color: var(--psg-primary);
    color: var(--psg-on-primary);

    &:hover { opacity: .88; }
  }
}
</style>
