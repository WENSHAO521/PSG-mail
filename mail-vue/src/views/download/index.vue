<template>
  <div class="download-view">
    <el-scrollbar>
      <div class="dl-body">

        <!-- ── Hero ── -->
        <div class="dl-hero">
          <div class="hero-publisher">PANORAMA SCHOLARLY GROUP</div>
          <div class="hero-product">PSG MAIL</div>
          <div class="hero-sub">{{ $t('dlHeroSub') }}</div>
        </div>

        <!-- ── Release line ── -->
        <div class="dl-release-line" v-if="!dlLoading && release.tag">
          {{ release.tag }}<span class="dl-release-date">{{ formatReleaseDate(release.publishedAt) }}</span>
        </div>

        <!-- ── Platform cards ── -->
        <div class="dl-grid">

          <!-- Windows -->
          <div class="dl-card" :class="{ 'dl-card--recommended': detected === 'win' }" :style="{ order: detected === 'win' ? -1 : 0 }">
            <div class="dl-card-badge" v-if="detected === 'win'">{{ $t('dlRecommended') }}</div>
            <div class="dl-card-icon">
              <Icon icon="simple-icons:windows11" width="40" height="40" />
            </div>
            <div class="dl-card-info">
              <div class="dl-card-platform">Windows</div>
              <div class="dl-card-desc">{{ $t('dlWindowsDesc') }}</div>
              <div class="dl-card-meta">Windows 10 / 11</div>
            </div>
            <div class="dl-btn-list">
              <div v-if="dlLoading" class="dl-btn-row dl-btn-row--loading"/>
              <template v-else-if="dlVariants.win.length">
                <a v-for="v in dlVariants.win" :key="v.url" class="dl-btn-row" :href="v.url" target="_blank" rel="noopener">
                  <span class="dl-btn-row-label">
                    <Icon icon="solar:download-minimalistic-bold" width="15" height="15" />
                    {{ v.label }}
                  </span>
                  <span class="dl-btn-row-size" v-if="v.size">{{ formatBytes(v.size) }}</span>
                </a>
              </template>
              <a v-else class="dl-btn-row" :href="RELEASES_URL" target="_blank" rel="noopener">
                <span class="dl-btn-row-label">
                  <Icon icon="solar:download-minimalistic-bold" width="15" height="15" />
                  {{ $t('dlAllReleases') }}
                </span>
              </a>
            </div>
          </div>

          <!-- macOS -->
          <div class="dl-card" :class="{ 'dl-card--recommended': detected === 'mac' }" :style="{ order: detected === 'mac' ? -1 : 0 }">
            <div class="dl-card-badge" v-if="detected === 'mac'">{{ $t('dlRecommended') }}</div>
            <div class="dl-card-icon">
              <Icon icon="simple-icons:apple" width="40" height="40" />
            </div>
            <div class="dl-card-info">
              <div class="dl-card-platform">macOS</div>
              <div class="dl-card-desc">{{ $t('dlMacDesc') }}</div>
              <div class="dl-card-meta">macOS 12+</div>
            </div>
            <div class="dl-btn-list">
              <div v-if="dlLoading" class="dl-btn-row dl-btn-row--loading"/>
              <template v-else-if="dlVariants.mac.length">
                <a v-for="v in dlVariants.mac" :key="v.url" class="dl-btn-row" :href="v.url" target="_blank" rel="noopener">
                  <span class="dl-btn-row-label">
                    <Icon icon="solar:download-minimalistic-bold" width="15" height="15" />
                    {{ v.label }}
                  </span>
                  <span class="dl-btn-row-size" v-if="v.size">{{ formatBytes(v.size) }}</span>
                </a>
              </template>
              <a v-else class="dl-btn-row" :href="RELEASES_URL" target="_blank" rel="noopener">
                <span class="dl-btn-row-label">
                  <Icon icon="solar:download-minimalistic-bold" width="15" height="15" />
                  {{ $t('dlAllReleases') }}
                </span>
              </a>
            </div>
          </div>

          <!-- Android -->
          <div class="dl-card" :class="{ 'dl-card--recommended': detected === 'android' }" :style="{ order: detected === 'android' ? -1 : 0 }">
            <div class="dl-card-badge" v-if="detected === 'android'">{{ $t('dlRecommended') }}</div>
            <div class="dl-card-icon">
              <Icon icon="simple-icons:android" width="40" height="40" />
            </div>
            <div class="dl-card-info">
              <div class="dl-card-platform">Android</div>
              <div class="dl-card-desc">{{ $t('dlAndroidDesc') }}</div>
              <div class="dl-card-meta">Android 8.0+</div>
            </div>
            <div class="dl-btn-list">
              <div v-if="dlLoading" class="dl-btn-row dl-btn-row--loading"/>
              <template v-else-if="dlVariants.android.length">
                <a v-for="v in dlVariants.android" :key="v.url" class="dl-btn-row" :href="v.url" target="_blank" rel="noopener">
                  <span class="dl-btn-row-label">
                    <Icon icon="solar:download-minimalistic-bold" width="15" height="15" />
                    {{ v.label }}
                  </span>
                  <span class="dl-btn-row-size" v-if="v.size">{{ formatBytes(v.size) }}</span>
                </a>
              </template>
              <a v-else class="dl-btn-row" :href="RELEASES_URL" target="_blank" rel="noopener">
                <span class="dl-btn-row-label">
                  <Icon icon="solar:download-minimalistic-bold" width="15" height="15" />
                  {{ $t('dlAllReleases') }}
                </span>
              </a>
            </div>
          </div>

          <!-- Linux -->
          <div class="dl-card" :class="{ 'dl-card--recommended': detected === 'linux' }" :style="{ order: detected === 'linux' ? -1 : 0 }">
            <div class="dl-card-badge" v-if="detected === 'linux'">{{ $t('dlRecommended') }}</div>
            <div class="dl-card-icon">
              <Icon icon="simple-icons:linux" width="40" height="40" />
            </div>
            <div class="dl-card-info">
              <div class="dl-card-platform">Linux</div>
              <div class="dl-card-desc">{{ $t('dlLinuxDesc') }}</div>
              <div class="dl-card-meta">Ubuntu 22.04+ · .deb</div>
            </div>
            <div class="dl-btn-list">
              <div v-if="dlLoading" class="dl-btn-row dl-btn-row--loading"/>
              <template v-else-if="dlVariants.linux.length">
                <a v-for="v in dlVariants.linux" :key="v.url" class="dl-btn-row" :href="v.url" target="_blank" rel="noopener">
                  <span class="dl-btn-row-label">
                    <Icon icon="solar:download-minimalistic-bold" width="15" height="15" />
                    {{ v.label }}
                  </span>
                  <span class="dl-btn-row-size" v-if="v.size">{{ formatBytes(v.size) }}</span>
                </a>
              </template>
              <a v-else class="dl-btn-row" :href="RELEASES_URL" target="_blank" rel="noopener">
                <span class="dl-btn-row-label">
                  <Icon icon="solar:download-minimalistic-bold" width="15" height="15" />
                  {{ $t('dlAllReleases') }}
                </span>
              </a>
            </div>
          </div>

          <!-- Web -->
          <div class="dl-card dl-card--web">
            <div class="dl-card-icon">
              <Icon icon="solar:global-linear" width="40" height="40" />
            </div>
            <div class="dl-card-info">
              <div class="dl-card-platform">{{ $t('dlWeb') }}</div>
              <div class="dl-card-desc">{{ $t('dlWebDesc') }}</div>
              <div class="dl-card-meta">{{ $t('dlWebMeta') }}</div>
            </div>
            <div class="dl-btn-list">
              <div class="dl-btn-row dl-btn-row--current">
                <span class="dl-btn-row-label">
                  <Icon icon="solar:check-circle-bold" width="15" height="15" />
                  {{ $t('dlWebCurrent') }}
                </span>
              </div>
            </div>
          </div>

        </div>

        <!-- ── Releases link ── -->
        <div class="dl-footer">
          <a class="dl-releases-link" :href="RELEASES_URL" target="_blank" rel="noopener">
            <Icon icon="simple-icons:github" width="14" height="14" />
            {{ $t('dlAllReleases') }}
          </a>
          <span class="dl-version">v{{ appVersion }}</span>
        </div>

      </div>
    </el-scrollbar>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { Icon } from '@iconify/vue'
import dayjs from 'dayjs'
import { formatBytes } from '@/utils/file-utils.js'

const appVersion = __APP_VERSION__

const RELEASES_URL = 'https://github.com/WENSHAO521/PSG-mail/releases'
const GITHUB_API   = 'https://api.github.com/repos/WENSHAO521/PSG-mail/releases/latest'

// Every architecture/ABI variant gets its own full-width button — platform → [{label, url, size}]
const dlVariants = ref({ win: [], mac: [], linux: [], android: [] })
const dlLoading  = ref(true)
const release    = ref({ tag: '', publishedAt: '' })

// Highlights the platform matching the visitor's own device so the "right"
// card stands out instead of making people compare four identical ones.
function detectPlatform() {
  const ua = navigator.userAgent || ''
  if (/Android/i.test(ua)) return 'android'
  if (/Win/i.test(ua)) return 'win'
  if (/Mac/i.test(ua) && !/iPhone|iPad|iPod/i.test(ua)) return 'mac'
  if (/Linux/i.test(ua)) return 'linux'
  return null
}
const detected = ref(detectPlatform())

function formatReleaseDate(iso) {
  return iso ? '  ' + dayjs(iso).format('YYYY-MM-DD') : ''
}

function variantsFor(assets, defs) {
  const out = []
  for (const { label, pattern } of defs) {
    const found = assets.find(a => pattern.test(a.name))
    if (found) out.push({ label, url: found.browser_download_url, size: found.size || 0 })
  }
  return out
}

onMounted(async () => {
  try {
    const res    = await fetch(GITHUB_API)
    const data   = await res.json()
    const assets = data.assets || []

    release.value = { tag: data.tag_name || '', publishedAt: data.published_at || '' }

    dlVariants.value = {
      win: variantsFor(assets, [
        { label: 'x64',   pattern: /-win-x64\.exe$/i },
        { label: 'ARM64', pattern: /-win-arm64\.exe$/i },
      ]),
      // The macOS build is a single universal binary covering both architectures.
      mac: variantsFor(assets, [
        { label: 'Universal (Intel & Apple Silicon)', pattern: /\.dmg$/i },
      ]),
      android: variantsFor(assets, [
        { label: 'Universal',   pattern: /-android-universal\.apk$/i },
        { label: 'ARM64-v8a',   pattern: /-android-arm64-v8a\.apk$/i },
        { label: 'ARMv7',       pattern: /-android-armeabi-v7a\.apk$/i },
        { label: 'x86_64',      pattern: /-android-x86_64\.apk$/i },
      ]),
      linux: variantsFor(assets, [
        { label: 'x64',   pattern: /-linux-amd64\.deb$/i },
        { label: 'ARM64', pattern: /-linux-arm64\.deb$/i },
      ]),
    }
  } catch {
    // fall back to releases page on any error — empty arrays render the "all releases" fallback button
  } finally {
    dlLoading.value = false
  }
})
</script>

<style lang="scss" scoped>
.download-view {
  height: 100%;
  background: var(--el-bg-color-page, #f5f5f5);
}

.dl-body {
  max-width: 780px;
  margin: 0 auto;
  padding: 40px 24px 60px;
}

/* ── Hero ── */
.dl-hero {
  margin-bottom: 16px;
  border-left: 4px solid var(--red-accent);
  padding-left: 18px;
}

.hero-publisher {
  font-family: 'IBM Plex Sans', 'Noto Sans SC', sans-serif;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted, #7e7576);
  margin-bottom: 4px;
}

.hero-product {
  font-family: 'IBM Plex Sans', 'Noto Sans SC', sans-serif;
  font-size: 28px;
  font-weight: 800;
  letter-spacing: 0;
  color: var(--el-text-color-primary);
  line-height: 1.1;
}

.hero-sub {
  margin-top: 6px;
  font-size: 13px;
  color: var(--muted, #7e7576);
}

/* ── Release line ── */
.dl-release-line {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  font-weight: 700;
  color: var(--el-text-color-primary);
  margin-bottom: 20px;
}

.dl-release-date {
  font-weight: 400;
  color: var(--muted, #7e7576);
  margin-left: 2px;
}

/* ── Grid ── */
.dl-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
  margin-bottom: 28px;

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
  }
}

/* ── Card ── */
.dl-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 22px 20px 20px;
  border-radius: var(--radius-md);
  box-shadow: var(--card-shadow);
  background: var(--el-bg-color, #ffffff);
  border: 1px solid var(--light-border, #e2e2e6);
  transition: border-color 0.12s, box-shadow 0.12s;

  &--web {
    opacity: 0.75;
  }

  /* The card matching the visitor's own device. Despite the name,
     --red-accent is this app's monochrome ink accent (black in light mode,
     white in dark mode), not a literal red. */
  &--recommended {
    border-color: var(--red-accent);
    box-shadow: 0 8px 24px -12px var(--red-accent), var(--card-shadow);
  }
}

:global(.dark) .dl-card {
  background: var(--el-bg-color, #1c1c20);
  border-color: rgba(255, 255, 255, 0.15);

  &.dl-card--recommended {
    border-color: var(--red-accent);
  }
}

.dl-card-badge {
  position: absolute;
  top: -10px;
  right: 16px;
  padding: 3px 9px;
  border-radius: 999px;
  background: var(--red-accent);
  color: var(--on-accent, #fff);
  font-family: 'IBM Plex Sans', 'Noto Sans SC', sans-serif;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.dl-card-icon {
  color: var(--el-text-color-primary);
  opacity: 0.75;
}

.dl-card-info {
  flex: 1;
}

.dl-card-platform {
  font-family: 'IBM Plex Sans', 'Noto Sans SC', sans-serif;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0;
  color: var(--el-text-color-primary);
  margin-bottom: 4px;
}

.dl-card-desc {
  font-size: 12px;
  color: var(--muted, #7e7576);
  line-height: 1.5;
  margin-bottom: 6px;
}

.dl-card-meta {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  color: var(--muted, #7e7576);
  letter-spacing: 0.04em;
}

/* ── Per-variant download buttons ── */
.dl-btn-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.dl-btn-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  height: 38px;
  padding: 0 14px;
  border-radius: var(--radius-sm);
  background: #111111;
  color: #ffffff;
  font-family: 'IBM Plex Sans', 'Noto Sans SC', sans-serif;
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
  border: none;
  transition: background 0.12s;

  @media (hover: hover) {
    &:hover { background: var(--red-accent); }
  }

  &:active { background: var(--red-accent-dark); }

  &--loading {
    background: var(--el-bg-color-page, #ececec);
    animation: dl-pulse 1.2s ease-in-out infinite;
  }

  &--current {
    background: var(--el-bg-color-page, #f5f5f5);
    color: var(--muted, #7e7576);
    border: 1px solid var(--light-border-color, #cfc4c5);
    cursor: default;
  }
}

.dl-btn-row-label {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dl-btn-row-size {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10.5px;
  font-weight: 500;
  opacity: 0.65;
  flex-shrink: 0;
}

@keyframes dl-pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.55; }
}

:global(.dark) .dl-btn-row {
  background: rgba(255,255,255,0.88);
  color: #111;

  @media (hover: hover) {
    &:hover { background: var(--red-accent); color: var(--on-accent); }
  }

  &--loading {
    background: rgba(255,255,255,0.12);
  }

  &--current {
    background: rgba(255,255,255,0.06);
    color: rgba(255,255,255,0.4);
    border-color: rgba(255,255,255,0.12);
  }
}

/* ── Footer ── */
.dl-footer {
  display: flex;
  align-items: center;
  gap: 16px;
  padding-top: 20px;
  border-top: 1px solid var(--light-border-color, #dcdcdc);
}

.dl-releases-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  font-weight: 500;
  color: var(--muted, #7e7576);
  text-decoration: none;
  font-family: 'IBM Plex Sans', 'Noto Sans SC', sans-serif;

  @media (hover: hover) {
    &:hover { color: var(--el-text-color-primary); }
  }
}

.dl-version {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: var(--muted, #7e7576);
  margin-left: auto;
}
</style>
