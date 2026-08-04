<template>
  <div class="download-view">
    <el-scrollbar>
      <div class="dl-body">

        <!-- ── Hero ── -->
        <div class="dl-hero">
          <div class="hero-publisher">PANORAMA SCHOLARLY GROUP</div>
          <div class="hero-product">PSG MAIL</div>
          <div class="hero-sub">{{ $t('dlHeroSub') }}</div>
          <div class="hero-badge" v-if="!dlLoading && release.tag">
            <span class="hero-badge-dot"/>
            {{ release.tag }} · {{ fromNow(release.publishedAt) }}
          </div>
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
              <div class="dl-card-meta">{{ dlMeta('win', 'Windows 10 / 11 · x64') }}</div>
            </div>
            <a class="dl-btn" :class="{ 'dl-btn--loading': dlLoading, 'dl-btn--accent': detected === 'win' }" :href="dlUrl('win')" target="_blank" rel="noopener">
              <Icon icon="solar:download-minimalistic-bold" width="16" height="16" />
              {{ $t('dlDownload') }} .exe
            </a>
            <div class="dl-alt" v-if="dlAlt.win?.length">
              <span class="dl-alt-label">{{ $t('dlOtherVariants') }}</span>
              <a v-for="alt in dlAlt.win" :key="alt.url" :href="alt.url" target="_blank" rel="noopener" class="dl-alt-link">{{ alt.label }}</a>
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
              <div class="dl-card-meta">{{ dlMeta('mac', 'macOS 12+ · Intel & Apple Silicon') }}</div>
            </div>
            <a class="dl-btn" :class="{ 'dl-btn--loading': dlLoading, 'dl-btn--accent': detected === 'mac' }" :href="dlUrl('mac')" target="_blank" rel="noopener">
              <Icon icon="solar:download-minimalistic-bold" width="16" height="16" />
              {{ $t('dlDownload') }} .dmg
            </a>
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
              <div class="dl-card-meta">{{ dlMeta('android', 'Android 8.0+') }}</div>
            </div>
            <a class="dl-btn" :class="{ 'dl-btn--loading': dlLoading, 'dl-btn--accent': detected === 'android' }" :href="dlUrl('android')" target="_blank" rel="noopener">
              <Icon icon="solar:download-minimalistic-bold" width="16" height="16" />
              {{ $t('dlDownload') }} .apk
            </a>
            <div class="dl-alt" v-if="dlAlt.android?.length">
              <span class="dl-alt-label">{{ $t('dlOtherVariants') }}</span>
              <a v-for="alt in dlAlt.android" :key="alt.url" :href="alt.url" target="_blank" rel="noopener" class="dl-alt-link">{{ alt.label }}</a>
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
              <div class="dl-card-meta">{{ dlMeta('linux', 'Ubuntu 22.04+ · .deb') }}</div>
            </div>
            <a class="dl-btn" :class="{ 'dl-btn--loading': dlLoading, 'dl-btn--accent': detected === 'linux' }" :href="dlUrl('linux')" target="_blank" rel="noopener">
              <Icon icon="solar:download-minimalistic-bold" width="16" height="16" />
              {{ $t('dlDownload') }} .deb
            </a>
            <div class="dl-alt" v-if="dlAlt.linux?.length">
              <span class="dl-alt-label">{{ $t('dlOtherVariants') }}</span>
              <a v-for="alt in dlAlt.linux" :key="alt.url" :href="alt.url" target="_blank" rel="noopener" class="dl-alt-link">{{ alt.label }}</a>
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
            <div class="dl-btn dl-btn--current">
              <Icon icon="solar:check-circle-bold" width="16" height="16" />
              {{ $t('dlWebCurrent') }}
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
import { formatBytes } from '@/utils/file-utils.js'
import { fromNow } from '@/utils/day.js'

const appVersion = __APP_VERSION__

const RELEASES_URL = 'https://github.com/WENSHAO521/cloud-mail/releases'
const GITHUB_API   = 'https://api.github.com/repos/WENSHAO521/cloud-mail/releases/latest'

const dlUrls    = ref({})   // platform → primary (default) download URL
const dlSizes   = ref({})   // platform → primary asset size in bytes
const dlAlt     = ref({})   // platform → [{label, url}] other arch/ABI variants
const dlLoading = ref(true)
const release   = ref({ tag: '', publishedAt: '' })

// Highlights the platform matching the visitor's own device so the "right"
// button stands out instead of making people compare five identical cards.
function detectPlatform() {
  const ua = navigator.userAgent || ''
  if (/Android/i.test(ua)) return 'android'
  if (/Win/i.test(ua)) return 'win'
  if (/Mac/i.test(ua) && !/iPhone|iPad|iPod/i.test(ua)) return 'mac'
  if (/Linux/i.test(ua)) return 'linux'
  return null
}
const detected = ref(detectPlatform())

// Releases now ship multiple files per platform (win x64/arm64, linux
// amd64/arm64, android universal + per-ABI splits) — pick a single sensible
// default per platform in priority order rather than "last match wins",
// which used to silently land on whatever asset happened to sort last.
function pickAsset(assets, patterns) {
  for (const pattern of patterns) {
    const found = assets.find(a => pattern.test(a.name))
    if (found) return found
  }
  return null
}

// Surfaces the remaining arch/ABI builds as secondary links instead of
// hiding them entirely behind the one default button.
function altAssets(assets, defs) {
  const out = []
  for (const { label, pattern } of defs) {
    const found = assets.find(a => pattern.test(a.name))
    if (found) out.push({ label, url: found.browser_download_url })
  }
  return out
}

onMounted(async () => {
  try {
    const res    = await fetch(GITHUB_API)
    const data   = await res.json()
    const assets = data.assets || []

    release.value = { tag: data.tag_name || '', publishedAt: data.published_at || '' }

    const picked = {
      win:     pickAsset(assets, [/-win-x64\.exe$/i, /-win\.exe$/i, /\.exe$/i]),
      mac:     pickAsset(assets, [/\.dmg$/i]),
      linux:   pickAsset(assets, [/-linux-amd64\.deb$/i, /\.deb$/i]),
      android: pickAsset(assets, [/-android-universal\.apk$/i, /\.apk$/i]),
    }
    for (const platform of Object.keys(picked)) {
      dlUrls.value[platform]  = picked[platform]?.browser_download_url || null
      dlSizes.value[platform] = picked[platform]?.size || 0
    }

    dlAlt.value = {
      win: altAssets(assets, [
        { label: 'arm64', pattern: /-win-arm64\.exe$/i },
      ]),
      linux: altAssets(assets, [
        { label: 'arm64', pattern: /-linux-arm64\.deb$/i },
      ]),
      android: altAssets(assets, [
        { label: 'arm64-v8a',   pattern: /-android-arm64-v8a\.apk$/i },
        { label: 'armeabi-v7a', pattern: /-android-armeabi-v7a\.apk$/i },
        { label: 'x86_64',      pattern: /-android-x86_64\.apk$/i },
      ]),
    }
  } catch {
    // fall back to releases page on any error
  } finally {
    dlLoading.value = false
  }
})

function dlUrl(platform) {
  return dlUrls.value[platform] || RELEASES_URL
}

function dlMeta(platform, fallback) {
  const size = dlSizes.value[platform]
  return size ? `${fallback} · ${formatBytes(size)}` : fallback
}
</script>

<style lang="scss" scoped>
.download-view {
  height: 100%;
  background: var(--el-bg-color-page, #f5f5f5);
}

.dl-body {
  max-width: 760px;
  margin: 0 auto;
  padding: 40px 24px 60px;
}

/* ── Hero ── */
.dl-hero {
  margin-bottom: 36px;
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

.hero-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 14px;
  padding: 5px 10px;
  border-radius: 999px;
  background: var(--el-bg-color, #ffffff);
  border: 1px solid var(--light-border, #e2e2e6);
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  letter-spacing: 0.02em;
  color: var(--muted, #7e7576);
}

.hero-badge-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--red-accent);
  flex-shrink: 0;
}

:global(.dark) .hero-badge {
  background: var(--el-bg-color, #1c1c20);
  border-color: rgba(255, 255, 255, 0.15);
}

/* ── Grid ── */
.dl-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
  margin-bottom: 28px;
}

/* ── Card ── */
.dl-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 22px 20px 18px;
  border-radius: var(--radius-md);
  box-shadow: var(--card-shadow);
  background: var(--el-bg-color, #ffffff);
  border: 1px solid var(--light-border, #e2e2e6);
  border-top: 3px solid var(--light-border, #e2e2e6);
  transition: border-top-color 0.12s, box-shadow 0.12s, transform 0.12s;

  @media (hover: hover) {
    &:hover { border-top-color: var(--red-accent); }
  }

  &--web {
    border-top-color: var(--light-border, #e2e2e6);
    opacity: 0.75;

    @media (hover: hover) {
      &:hover { border-top-color: #444; }
    }
  }

  /* The card matching the visitor's own device — called out so the "right"
     button doesn't require comparing every platform first. Note: despite the
     name, --red-accent is this app's monochrome ink accent (black in light
     mode, white in dark mode), not a literal red — so no hardcoded red here. */
  &--recommended {
    border-top-color: var(--red-accent);
    border-color: var(--red-accent);
    box-shadow: 0 8px 24px -12px var(--red-accent), var(--card-shadow);
  }
}

:global(.dark) .dl-card {
  background: var(--el-bg-color, #1c1c20);
  border-color: rgba(255, 255, 255, 0.15);
  border-top-color: rgba(255, 255, 255, 0.3);

  &.dl-card--recommended {
    border-top-color: var(--red-accent);
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

/* ── Other arch/ABI variants ── */
.dl-alt {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: -2px;
}

.dl-alt-label {
  font-size: 11px;
  color: var(--muted, #7e7576);
}

.dl-alt-link {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: var(--muted, #7e7576);
  text-decoration: underline;
  text-underline-offset: 2px;

  @media (hover: hover) {
    &:hover { color: var(--red-accent); }
  }
}

/* ── Button ── */
.dl-btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 34px;
  padding: 0 14px;
  border-radius: var(--radius-sm);
  background: #111111;
  color: #ffffff;
  font-family: 'IBM Plex Sans', 'Noto Sans SC', sans-serif;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0;
  text-transform: none;
  text-decoration: none;
  cursor: pointer;
  border: none;
  transition: background 0.12s;

  @media (hover: hover) {
    &:hover { background: var(--red-accent); }
  }

  &:active { background: var(--red-accent-dark); }

  &--current {
    background: var(--el-bg-color-page, #f5f5f5);
    color: var(--muted, #7e7576);
    border: 1px solid var(--light-border-color, #cfc4c5);
    cursor: default;

    @media (hover: hover) {
      &:hover { background: var(--el-bg-color-page, #f5f5f5); }
    }
  }

  &--loading {
    opacity: 0.55;
    pointer-events: none;
    animation: dl-pulse 1.2s ease-in-out infinite;
  }

  &--accent {
    background: var(--red-accent);

    @media (hover: hover) {
      &:hover { background: var(--red-accent-dark); }
    }
  }
}

@keyframes dl-pulse {
  0%, 100% { opacity: 0.55; }
  50%       { opacity: 0.30; }
}

:global(.dark) .dl-btn {
  background: rgba(255,255,255,0.88);
  color: #111;

  @media (hover: hover) {
    &:hover { background: var(--red-accent); color: var(--on-accent); }
  }

  &--current {
    background: rgba(255,255,255,0.06);
    color: rgba(255,255,255,0.4);
    border-color: rgba(255,255,255,0.12);

    @media (hover: hover) {
      &:hover { background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.4); }
    }
  }

  &--accent {
    background: var(--red-accent);
    color: var(--on-accent, #fff);

    @media (hover: hover) {
      &:hover { background: var(--red-accent-dark); color: var(--on-accent, #fff); }
    }
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
