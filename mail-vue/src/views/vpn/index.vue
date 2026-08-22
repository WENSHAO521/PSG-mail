<template>
  <div class="download-view">
    <el-scrollbar>
      <div class="dl-body">

        <!-- ── Hero ── -->
        <div class="dl-hero">
          <div class="hero-publisher">PANORAMA SCHOLARLY GROUP</div>
          <div class="hero-product">PSG CONNECT</div>
          <div class="hero-sub">{{ $t('vpnHeroSub') }}</div>
        </div>

        <!-- ── Notice ── -->
        <div class="dl-notice">
          <Icon icon="psg:mail" width="15" />
          {{ $t('vpnNotice') }}
          <a href="mailto:admin@panorama-sg.de" class="dl-notice-link">admin@panorama-sg.de</a>
        </div>

        <!-- ── Loading skeleton ── -->
        <div v-if="loading" class="dl-grid">
          <div v-for="i in 4" :key="i" class="dl-card dl-card--skeleton" />
        </div>

        <!-- ── Error ── -->
        <div v-else-if="error" class="dl-error">
          <Icon icon="psg:warning" width="20" />
          {{ $t('vpnLoadError') }}
          <a :href="RELEASES_URL" target="_blank" rel="noopener" class="dl-releases-link">
            {{ $t('vpnViewOnGitHub') }}
          </a>
        </div>

        <template v-else-if="latest">

          <!-- ── Version meta ── -->
          <div class="dl-section-meta">
            <span class="section-tag">{{ latest.tag_name }}</span>
            <span class="section-date">{{ formatDate(latest.published_at) }}</span>
          </div>

          <!-- ── Platform cards ── -->
          <div class="dl-grid">

            <!-- Windows -->
            <div class="dl-card" v-if="assets('win').length">
              <div class="dl-card-icon">
                <Icon icon="simple-icons:windows11" width="40" height="40" />
              </div>
              <div class="dl-card-info">
                <div class="dl-card-platform">Windows</div>
                <div class="dl-card-desc">{{ $t('vpnWindowsDesc') }}</div>
                <div class="dl-card-meta">Windows 10 / 11</div>
              </div>
              <div class="dl-btn-group">
                <a
                  v-for="a in assets('win')"
                  :key="a.name"
                  class="dl-btn"
                  :href="a.browser_download_url"
                  target="_blank"
                  rel="noopener"
                  :title="a.name"
                >
                  <Icon icon="psg:download" width="14" height="14" />
                  {{ archLabel(a.name) }}
                </a>
              </div>
            </div>

            <!-- macOS -->
            <div class="dl-card" v-if="assets('mac').length">
              <div class="dl-card-icon">
                <Icon icon="simple-icons:apple" width="40" height="40" />
              </div>
              <div class="dl-card-info">
                <div class="dl-card-platform">macOS</div>
                <div class="dl-card-desc">{{ $t('vpnMacDesc') }}</div>
                <div class="dl-card-meta">macOS 12+</div>
              </div>
              <div class="dl-btn-group">
                <a
                  v-for="a in assets('mac')"
                  :key="a.name"
                  class="dl-btn"
                  :href="a.browser_download_url"
                  target="_blank"
                  rel="noopener"
                  :title="a.name"
                >
                  <Icon icon="psg:download" width="14" height="14" />
                  {{ archLabel(a.name) }}
                </a>
              </div>
            </div>

            <!-- Android -->
            <div class="dl-card" v-if="assets('android').length">
              <div class="dl-card-icon">
                <Icon icon="simple-icons:android" width="40" height="40" />
              </div>
              <div class="dl-card-info">
                <div class="dl-card-platform">Android</div>
                <div class="dl-card-desc">{{ $t('vpnAndroidDesc') }}</div>
                <div class="dl-card-meta">Android 5.0+</div>
              </div>
              <div class="dl-btn-group">
                <a
                  v-for="a in assets('android')"
                  :key="a.name"
                  class="dl-btn"
                  :href="a.browser_download_url"
                  target="_blank"
                  rel="noopener"
                  :title="a.name"
                >
                  <Icon icon="psg:download" width="14" height="14" />
                  {{ archLabel(a.name) }}
                </a>
              </div>
            </div>

            <!-- Linux -->
            <div class="dl-card" v-if="assets('linux').length">
              <div class="dl-card-icon">
                <Icon icon="simple-icons:linux" width="40" height="40" />
              </div>
              <div class="dl-card-info">
                <div class="dl-card-platform">Linux</div>
                <div class="dl-card-desc">{{ $t('vpnLinuxDesc') }}</div>
                <div class="dl-card-meta">Ubuntu 22.04+</div>
              </div>
              <div class="dl-btn-group">
                <a
                  v-for="a in assets('linux')"
                  :key="a.name"
                  class="dl-btn"
                  :href="a.browser_download_url"
                  target="_blank"
                  rel="noopener"
                  :title="a.name"
                >
                  <Icon icon="psg:download" width="14" height="14" />
                  {{ archLabel(a.name) }}
                </a>
              </div>
            </div>

          </div>

          <!-- ── Footer ── -->
          <div class="dl-footer">
            <a class="dl-releases-link" :href="RELEASES_URL" target="_blank" rel="noopener">
              <Icon icon="simple-icons:github" width="14" height="14" />
              {{ $t('vpnAllReleases') }}
            </a>
            <span class="dl-version">{{ latest.tag_name }}</span>
          </div>

        </template>

      </div>
    </el-scrollbar>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { Icon } from '@iconify/vue'

const RELEASES_URL = 'https://github.com/WENSHAO521/FlClash-/releases'
const GITHUB_API   = 'https://api.github.com/repos/WENSHAO521/FlClash-/releases/latest'

const latest  = ref(null)
const loading = ref(true)
const error   = ref(false)

onMounted(async () => {
  try {
    const res = await fetch(GITHUB_API)
    if (!res.ok) throw new Error(res.status)
    latest.value = await res.json()
  } catch {
    error.value = true
  } finally {
    loading.value = false
  }
})

// Return all assets for a given platform, excluding metadata files
function assets(platform) {
  if (!latest.value) return []
  return (latest.value.assets || []).filter(a => {
    const n = a.name.toLowerCase()
    if (n.endsWith('.blockmap') || n.endsWith('.yml') || n.endsWith('.yaml') || n.endsWith('.json')) return false
    if (n.endsWith('.zip') || n.endsWith('.tar.gz') || n.endsWith('.tgz')) return false
    if (platform === 'win')     return n.endsWith('.exe') || n.endsWith('.msix')
    if (platform === 'mac')     return n.endsWith('.dmg') || n.endsWith('.pkg')
    if (platform === 'android') return n.endsWith('.apk') || n.endsWith('.aab')
    if (platform === 'linux')   return n.endsWith('.deb') || n.endsWith('.rpm') || n.endsWith('.appimage')
    return false
  })
}

// Extract a human-readable architecture / variant label from filename
function archLabel(name) {
  const n = name.toLowerCase()
  // Android specific
  if (n.includes('arm64-v8a'))   return 'ARM64-v8a'
  if (n.includes('armeabi-v7a')) return 'ARMv7'
  if (n.includes('x86_64'))      return 'x86_64'
  if (n.includes('universal'))   return 'Universal'
  // Generic arch
  if (n.includes('arm64'))       return 'ARM64'
  if (n.includes('aarch64'))     return 'ARM64'
  if (n.includes('amd64'))       return 'x64'
  if (n.includes('-x64'))        return 'x64'
  if (n.includes('_x64'))        return 'x64'
  if (n.includes('x86'))         return 'x86'
  if (n.includes('arm'))         return 'ARM'
  // macOS
  if (n.includes('apple') || n.includes('silicon') || n.includes('m1') || n.includes('m2')) return 'Apple Silicon'
  if (n.includes('intel'))       return 'Intel'
  // Fall back to file extension
  const ext = name.match(/\.([a-zA-Z0-9]+)$/)
  return ext ? ext[1].toUpperCase() : name
}

function formatDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}
</script>

<style lang="scss" scoped>
.download-view {
  height: 100%;
  background: var(--psg-canvas);
}

.dl-body {
  max-width: 760px;
  margin: 0 auto;
  padding: 40px 24px 60px;
}

/* ── Hero ── */
.dl-hero {
  margin-bottom: 32px;
  border-left: 4px solid var(--psg-primary);
  padding-left: 18px;
}

.hero-publisher {
  font-family: 'IBM Plex Sans', 'Noto Sans SC', sans-serif;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--psg-text-muted);
  margin-bottom: 4px;
}

.hero-product {
  font-family: 'IBM Plex Sans', 'Noto Sans SC', sans-serif;
  font-size: 28px;
  font-weight: 800;
  letter-spacing: 0;
  color: var(--psg-text);
  line-height: 1.1;
}

.hero-sub {
  margin-top: 6px;
  font-size: 13px;
  color: var(--psg-text-muted);
}

/* ── Notice ── */
.dl-notice {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  margin-bottom: 24px;
  background: var(--psg-surface);
  border: 1px solid var(--psg-border);
  border-left: 3px solid var(--psg-primary);
  font-size: 12px;
  color: var(--psg-text-secondary);
  flex-wrap: wrap;
}

.dl-notice-link {
  color: var(--psg-text);
  text-decoration: none;
  font-family: 'IBM Plex Sans', 'Noto Sans SC', sans-serif;
  font-size: 12.5px;
  font-weight: 600;

  @media (hover: hover) {
    &:hover { text-decoration: underline; }
  }
}

/* ── Version meta ── */
.dl-section-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
  font-family: 'IBM Plex Sans', 'Noto Sans SC', sans-serif;
}

.section-tag {
  font-size: 14px;
  font-weight: 700;
  color: var(--psg-text);
}

.section-date {
  font-size: 12px;
  font-family: 'IBM Plex Mono', monospace;
  color: var(--psg-text-muted);
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
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 22px 20px 18px;
  border-radius: var(--psg-radius-md);
  background: var(--psg-surface);
  border: 1px solid var(--psg-border);
  border-top: 3px solid var(--psg-border);
  transition: border-top-color 0.12s;

  @media (hover: hover) {
    &:hover { border-top-color: var(--psg-primary); }
  }

  &--skeleton {
    height: 180px;
    opacity: 0.35;
    animation: dl-pulse 1.2s ease-in-out infinite;
  }
}

.dl-card-icon {
  color: var(--psg-text);
  opacity: 0.75;
}

.dl-card-info { flex: 1; }

.dl-card-platform {
  font-family: 'IBM Plex Sans', 'Noto Sans SC', sans-serif;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0;
  color: var(--psg-text);
  margin-bottom: 4px;
}

.dl-card-desc {
  font-size: 12px;
  color: var(--psg-text-muted);
  line-height: 1.5;
  margin-bottom: 6px;
}

.dl-card-meta {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  color: var(--psg-text-muted);
  letter-spacing: 0.04em;
}

/* ── Button group (multiple arch variants) ── */
.dl-btn-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.dl-btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 32px;
  padding: 0 14px;
  border-radius: var(--psg-radius-sm);
  background: var(--psg-primary);
  color: var(--psg-on-primary);
  font-family: var(--psg-font-sans);
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0;
  text-transform: none;
  text-decoration: none;
  cursor: pointer;
  border: none;
  transition: opacity 0.12s;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  @media (hover: hover) {
    &:hover { opacity: .88; }
  }
  &:active { opacity: .88; }
}

/* ── Error ── */
.dl-error {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 24px 0;
  font-size: 13px;
  color: var(--psg-danger);
}

/* ── Footer ── */
.dl-footer {
  display: flex;
  align-items: center;
  gap: 16px;
  padding-top: 20px;
  border-top: 1px solid var(--psg-border);
}

.dl-releases-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  font-weight: 500;
  color: var(--psg-text-muted);
  text-decoration: none;
  font-family: 'IBM Plex Sans', 'Noto Sans SC', sans-serif;

  @media (hover: hover) {
    &:hover { color: var(--psg-text); }
  }
}

.dl-version {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: var(--psg-text-muted);
  margin-left: auto;
}

@keyframes dl-pulse {
  0%, 100% { opacity: 0.35; }
  50%       { opacity: 0.15; }
}
</style>
