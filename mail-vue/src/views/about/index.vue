<template>
  <div class="about-view">
    <el-scrollbar>
      <div class="about-body">

        <!-- ── Brand header ── -->
        <div class="about-hero">
          <div class="hero-mark" aria-hidden="true">P</div>
          <div class="hero-product">PSG Mail</div>
          <div class="hero-publisher">Panorama Scholarly Group</div>
          <div class="hero-version-chip">v{{ appVersion }}</div>
        </div>

        <!-- ── Version / Update card ── -->
        <div class="about-card">
          <div class="about-card-title">{{ $t('version') }}</div>
          <div class="about-row">
            <span class="about-label">{{ $t('currentVersion') }}</span>
            <span class="about-value mono">v{{ appVersion }}</span>
          </div>

          <template v-if="isElectron">
            <div class="about-row">
              <span class="about-label">{{ $t('updateStatus') }}</span>
              <span class="about-status-badge" :class="stageCls">
                <span class="status-dot" />
                {{ stageLabel }}
              </span>
            </div>

            <el-progress
              v-if="stage === 'downloading'"
              class="update-progress"
              :percentage="progress"
              :stroke-width="4"
              :show-text="false"
            />

            <div v-if="stage === 'error' && errorMessage" class="update-error-detail">
              {{ errorMessage }}
            </div>

            <div class="about-actions">
              <el-button
                v-if="stage !== 'ready'"
                :loading="stage === 'checking'"
                :disabled="stage === 'downloading'"
                class="about-btn"
                @click="checkUpdate"
              >
                <Icon v-if="stage !== 'checking'" icon="solar:refresh-linear" width="15" height="15" />
                {{ stage === 'checking' ? $t('checking') : $t('checkForUpdates') }}
              </el-button>

              <el-button
                v-if="stage === 'ready'"
                class="about-btn about-btn--install"
                @click="doInstall"
              >
                <Icon icon="solar:download-minimalistic-linear" width="15" height="15" />
                {{ $t('installAndRestart') }}
              </el-button>
            </div>
          </template>

          <!-- Android: native update check -->
          <template v-else-if="isAndroid">
            <div class="about-row">
              <span class="about-label">{{ $t('updateStatus') }}</span>
              <span class="about-status-badge" :class="androidStageCls">
                <span class="status-dot" />
                {{ androidStageLabel }}
              </span>
            </div>
            <div v-if="androidStage === 'error' && androidError" class="update-error-detail">
              {{ androidError }}
            </div>
            <div class="about-actions">
              <el-button
                v-if="androidStage !== 'downloading'"
                :loading="androidStage === 'checking'"
                class="about-btn"
                :class="{ 'about-btn--install': androidStage === 'available' }"
                @click="androidStage === 'available' ? reDownloadAndroid() : checkAndroidUpdate()"
              >
                <Icon v-if="androidStage !== 'checking'"
                      :icon="androidStage === 'available' ? 'solar:download-minimalistic-linear' : 'solar:refresh-linear'"
                      width="15" height="15" />
                {{ androidStage === 'available'
                    ? `${$t('downloadUpdate')} (v${androidNewVersion})`
                    : (androidStage === 'checking' ? $t('checking') : $t('checkForUpdates')) }}
              </el-button>
              <el-button v-else class="about-btn" disabled>
                <Icon icon="solar:download-minimalistic-linear" width="15" height="15" />
                {{ $t('downloadingUpdate') }} v{{ androidNewVersion }}
              </el-button>
            </div>
          </template>

          <!-- Web/other: GitHub link -->
          <div v-else class="about-row">
            <span class="about-label">{{ $t('updateStatus') }}</span>
            <a class="about-link" href="https://github.com/WENSHAO521/PSG-mail/releases" target="_blank">
              {{ $t('checkOnGitHub') }}
            </a>
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
import { ref, computed, onMounted, onUnmounted, defineOptions } from 'vue'
import { useI18n } from 'vue-i18n'
import { Icon } from '@iconify/vue'
import { Capacitor } from '@capacitor/core'
import { checkAndDownloadAndroidUpdate } from '@/utils/android-update-service.js'

defineOptions({ name: 'about' })

const { t } = useI18n()

const appVersion = __APP_VERSION__
const isElectron = !!window.electronAPI
const isAndroid  = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'

// stage: idle | checking | up-to-date | downloading | ready | error
const stage    = ref('idle')
const progress = ref(0)
const newVersion = ref('')
const errorMessage = ref('')
let autoCheckTimer = null

const stageCls = computed(() => ({
  'status--idle':       stage.value === 'idle',
  'status--checking':   stage.value === 'checking',
  'status--ok':         stage.value === 'up-to-date',
  'status--available':  stage.value === 'downloading',
  'status--ready':      stage.value === 'ready',
  'status--error':      stage.value === 'error',
}))

const stageLabel = computed(() => {
  switch (stage.value) {
    case 'idle':        return t('notChecked')
    case 'checking':    return t('checking')
    case 'up-to-date':  return t('upToDate')
    case 'downloading': return `${t('downloading')} ${progress.value}%`
    case 'ready':       return t('readyToInstall') + (newVersion.value ? ` (v${newVersion.value})` : '')
    case 'error':       return t('updateError')
    default:            return ''
  }
})

function checkUpdate() {
  stage.value = 'checking'
  errorMessage.value = ''
  window.electronAPI?.checkForUpdates()
}

function doInstall() {
  window.electronAPI?.installUpdate()
}

// ── Android update ────────────────────────────────────────────
const androidStage      = ref('idle')
const androidNewVersion = ref('')
const androidDownloadUrl = ref('')
const androidError      = ref('')

const androidStageCls = computed(() => ({
  'status--idle':      androidStage.value === 'idle',
  'status--checking':  androidStage.value === 'checking',
  'status--ok':        androidStage.value === 'up-to-date',
  'status--available': androidStage.value === 'available',
  'status--available': androidStage.value === 'downloading',
  'status--error':     androidStage.value === 'error',
}))

const androidStageLabel = computed(() => {
  switch (androidStage.value) {
    case 'idle':        return t('notChecked')
    case 'checking':    return t('checking')
    case 'up-to-date':  return t('upToDate')
    case 'available':   return t('updateAvailable')
    case 'downloading': return t('downloadingUpdate')
    case 'error':       return t('updateError')
    default:            return ''
  }
})

async function checkAndroidUpdate() {
  androidStage.value = 'checking'
  androidError.value = ''
  try {
    const result = await checkAndDownloadAndroidUpdate()
    if (!result) { androidStage.value = 'idle'; return }
    androidNewVersion.value  = result.remoteVersion || ''
    androidDownloadUrl.value = result.url || ''
    if (result.status === 'current')           androidStage.value = 'up-to-date'
    else if (result.status === 'download-started') androidStage.value = 'downloading'
    else if (result.status === 'already-started')  androidStage.value = 'available'
    else { androidStage.value = 'error'; androidError.value = t('updateErrorDetailFallback') }
  } catch (e) {
    androidStage.value = 'error'
    androidError.value = e?.message || t('updateErrorDetailFallback')
  }
}

async function reDownloadAndroid() {
  if (!androidDownloadUrl.value) return
  try {
    const { Browser } = await import('@capacitor/browser')
    await Browser.open({ url: androidDownloadUrl.value })
  } catch {
    window.location.href = androidDownloadUrl.value
  }
}

onMounted(() => {
  if (!isElectron) return

  window.electronAPI.onUpdateAvailable((info) => {
    newVersion.value = info.version
    errorMessage.value = ''
    stage.value = 'downloading'
    progress.value = 0
  })

  window.electronAPI.onUpdateProgress((pct) => {
    progress.value = pct
    if (stage.value !== 'downloading') stage.value = 'downloading'
  })

  window.electronAPI.onUpdateDownloaded(() => {
    stage.value = 'ready'
    progress.value = 100
  })

  window.electronAPI.onUpdateNotAvailable?.(() => {
    errorMessage.value = ''
    stage.value = 'up-to-date'
  })

  window.electronAPI.onUpdateError?.((msg) => {
    errorMessage.value = msg || t('updateErrorDetailFallback')
    stage.value = 'error'
  })

  autoCheckTimer = setTimeout(() => {
    if (stage.value === 'idle') checkUpdate()
  }, 6000)
})

onUnmounted(() => {
  clearTimeout(autoCheckTimer)
})
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
  display: grid;
  width: 64px;
  height: 64px;
  margin-bottom: 12px;
  place-items: center;
  color: var(--psg-on-primary);
  background: var(--psg-text);
  border-radius: var(--psg-radius-lg);
  font-size: 28px;
  font-weight: 700;

  :global(html.dark) & { color: var(--psg-canvas); }
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
