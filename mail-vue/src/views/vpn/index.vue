<template>
  <div class="vpn-view">
    <el-scrollbar>
      <div class="vpn-body">

        <!-- ── Hero: product, latest version, one-click download for this device ── -->
        <header class="vpn-hero">
          <img class="vpn-hero-icon" src="/image/psg-connect-logo.png" alt="PSG Connect" width="60" height="60">
          <div class="vpn-hero-copy">
            <h1>PSG Connect</h1>
            <p>{{ $t('vpnHeroSub') }}</p>
            <div v-if="latest" class="vpn-hero-meta">
              <span class="vpn-chip">{{ latest.tag_name }}</span>
              <span class="vpn-date">{{ formatDate(latest.published_at) }}</span>
            </div>
          </div>
          <a v-if="primary" class="vpn-primary" :href="primary.asset.browser_download_url" target="_blank" rel="noopener">
            <Icon icon="psg:download" width="18" height="18" />
            {{ $t('vpnDownloadFor', { platform: primary.name }) }}
          </a>
        </header>

        <!-- ── Setup steps ── -->
        <section class="vpn-steps" :aria-label="$t('vpnBeforeStart')">
          <h2>{{ $t('vpnBeforeStart') }}</h2>
          <ol>
            <li>
              <span class="vpn-step-no">1</span>
              <div>
                <strong>{{ $t('vpnStepServer') }}</strong>
                <span>{{ $t('vpnStepServerDesc') }}
                  <a href="https://www.racknerd.com/specials/" target="_blank" rel="noopener">{{ $t('vpnNoticeVpsLink') }}</a></span>
              </div>
            </li>
            <li>
              <span class="vpn-step-no">2</span>
              <div>
                <strong>{{ $t('vpnStepConfig') }}</strong>
                <span><a href="mailto:admin@panorama-sg.de">admin@panorama-sg.de</a></span>
              </div>
            </li>
            <li>
              <span class="vpn-step-no">3</span>
              <div>
                <strong>{{ $t('vpnStepInstall') }}</strong>
                <span>{{ $t('vpnStepInstallDesc') }}</span>
              </div>
            </li>
          </ol>
        </section>

        <!-- ── Platforms ── -->
        <section class="vpn-platforms">
          <h2>{{ $t('vpnPlatforms') }}</h2>

          <div v-if="loading" class="vpn-list">
            <div v-for="i in 4" :key="i" class="vpn-row vpn-row--skeleton" />
          </div>

          <div v-else-if="error" class="vpn-error">
            <Icon icon="psg:warning" width="22" height="22" />
            <span>{{ $t('vpnLoadError') }}</span>
            <div class="vpn-error-actions">
              <button type="button" class="vpn-pill" @click="load">{{ $t('retry') }}</button>
              <a class="vpn-pill" :href="RELEASES_URL" target="_blank" rel="noopener">{{ $t('vpnViewOnGitHub') }}</a>
            </div>
          </div>

          <div v-else class="vpn-list">
            <div v-for="p in platforms" :key="p.key" class="vpn-row" :class="{ 'vpn-row--current': p.key === detected }">
              <div class="vpn-row-icon"><Icon :icon="p.icon" width="22" height="22" /></div>
              <div class="vpn-row-info">
                <div class="vpn-row-title">
                  {{ p.name }}
                  <span v-if="p.key === detected" class="vpn-current">{{ $t('vpnThisDevice') }}</span>
                </div>
                <div class="vpn-row-desc">{{ $t(p.descKey) }} · {{ p.req }}</div>
              </div>
              <div v-if="p.groups" class="vpn-row-groups">
                <div v-for="g in p.groups" :key="g.arch" class="vpn-group">
                  <span class="vpn-group-arch">{{ g.arch }}</span>
                  <a v-for="a in g.items" :key="a.name" class="vpn-pill" :class="{ 'vpn-pill--accent': p.key === detected }"
                     :href="a.browser_download_url" target="_blank" rel="noopener" :title="a.name">
                    <Icon icon="psg:download" width="14" height="14" />
                    {{ a.fmt }}
                  </a>
                </div>
              </div>
              <div v-else class="vpn-row-actions">
                <a v-for="a in p.assets" :key="a.name" class="vpn-pill" :class="{ 'vpn-pill--accent': p.key === detected }"
                   :href="a.browser_download_url" target="_blank" rel="noopener" :title="a.name">
                  <Icon icon="psg:download" width="14" height="14" />
                  {{ a.label }}
                </a>
              </div>
            </div>
          </div>
        </section>

        <footer class="vpn-footer">
          <a :href="RELEASES_URL" target="_blank" rel="noopener">
            {{ $t('vpnAllReleases') }} <Icon icon="psg:chevron-right" width="14" height="14" />
          </a>
        </footer>
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

async function load() {
  loading.value = true
  error.value = false
  try {
    const res = await fetch(GITHUB_API)
    if (!res.ok) throw new Error(res.status)
    latest.value = await res.json()
  } catch {
    error.value = true
  } finally {
    loading.value = false
  }
}
onMounted(load)

function detectPlatform() {
  const ua = navigator.userAgent || ''
  if (/Android/i.test(ua)) return 'android'
  if (/Win/i.test(ua)) return 'win'
  if (/Mac/i.test(ua) && !/iPhone|iPad|iPod/i.test(ua)) return 'mac'
  if (/Linux/i.test(ua)) return 'linux'
  return null
}
const detected = detectPlatform()

const PLATFORMS = [
  { key: 'win',     name: 'Windows', icon: 'simple-icons:windows11', descKey: 'vpnWindowsDesc', req: 'Windows 10 / 11' },
  { key: 'mac',     name: 'macOS',   icon: 'simple-icons:apple',     descKey: 'vpnMacDesc',     req: 'macOS 12+' },
  { key: 'android', name: 'Android', icon: 'simple-icons:android',   descKey: 'vpnAndroidDesc', req: 'Android 5.0+' },
  { key: 'linux',   name: 'Linux',   icon: 'simple-icons:linux',     descKey: 'vpnLinuxDesc',   req: 'Ubuntu 22.04+' },
]

// Platforms that have a build in the latest release, this device first.
const platforms = computed(() => PLATFORMS
  .map(p => {
    const list = labelled(assets(p.key))
    return { ...p, assets: list, groups: p.key === 'linux' ? groupByArch(list) : null }
  })
  .filter(p => p.assets.length)
  .sort((a, b) => (b.key === detected) - (a.key === detected)))

// CPU architecture of this device: 'arm' | 'x86' | null (unknown).
// Chromium exposes it via UA Client Hints; Windows on ARM also says so in
// the UA string. Safari and Firefox on macOS report neither.
const deviceArch = ref(/Windows NT[^)]*ARM64/i.test(navigator.userAgent) ? 'arm' : null)
onMounted(async () => {
  try {
    const hints = await navigator.userAgentData?.getHighEntropyValues?.(['architecture'])
    if (hints?.architecture === 'arm') deviceArch.value = 'arm'
    else if (hints?.architecture === 'x86') deviceArch.value = 'x86'
  } catch {}
})

const isUniversal = n => /universal/i.test(n)
// CPU a build is for, from its file name: 'arm', 'x86', or null when the
// name doesn't say (a generic build).
function archOf(n) {
  if (/arm64|aarch64|armeabi|apple|silicon|\barm/i.test(n)) return 'arm'
  if (/x86_64|x64|amd64|x86|intel/i.test(n)) return 'x86'
  return null
}

// The build the hero button offers, or null when we can't tell which one
// this device needs — the platform row below then lets the user choose.
function pickForDevice(platform, list) {
  const named = list.map(a => ({ a, n: a.name.toLowerCase() }))
  const arch = deviceArch.value
  if (platform === 'android') {
    const apks = named.filter(x => x.n.endsWith('.apk'))   // .aab can't be installed directly
    const pick = apks.find(x => isUniversal(x.n))
      || (arch === 'x86' && apks.find(x => /x86_64/.test(x.n)))
      // ARM (or unknown — nearly every Android phone is arm64).
      || (arch !== 'x86' && apks.find(x => /arm64-v8a/.test(x.n)))
      || (apks.length === 1 && (!archOf(apks[0].n) || archOf(apks[0].n) === (arch ?? 'arm')) ? apks[0] : null)
    return pick?.a ?? null
  }
  if (platform === 'linux') return list.length === 1 ? list[0] : null   // .deb vs .AppImage vs .rpm depends on the distro
  const uni = named.find(x => isUniversal(x.n))
  if (uni) return uni.a
  // Windows defaults to x64 unless the device is known to be ARM; macOS
  // needs the architecture to be known — unless the only build is generic.
  const want = arch ?? (platform === 'win' ? 'x86' : null)
  if (!want) return list.length === 1 && !archOf(named[0].n) ? list[0] : null
  return (named.find(x => archOf(x.n) === want) || (list.length === 1 && !archOf(named[0].n) ? named[0] : null))?.a ?? null
}

const primary = computed(() => {
  const p = platforms.value.find(p => p.key === detected)
  const asset = p && pickForDevice(p.key, p.assets)
  return asset ? { name: p.name, asset } : null
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

// Arch labels, with the file format added where two builds would otherwise
// read the same (e.g. Linux x64 .deb and x64 AppImage).
function labelled(list) {
  const labels = list.map(a => archLabel(a.name))
  return list.map((a, i) => {
    const dup = labels.filter(l => l === labels[i]).length > 1
    const ext = (a.name.match(/\.([a-zA-Z0-9]+)$/)?.[1] || '').toLowerCase()
    const fmt = ext === 'appimage' ? 'AppImage' : ext.toUpperCase()
    return { ...a, fmt: fmt || labels[i], label: dup && fmt ? `${labels[i]} · ${fmt}` : labels[i] }
  })
}

// Linux ships up to three formats per architecture; one line per architecture
// reads better than a flat run of six pills.
const FORMAT_ORDER = ['AppImage', 'DEB', 'RPM']
function groupByArch(list) {
  const groups = new Map()
  for (const a of list) {
    const arch = archLabel(a.name)
    if (!groups.has(arch)) groups.set(arch, [])
    groups.get(arch).push(a)
  }
  const rank = a => { const i = FORMAT_ORDER.indexOf(a.fmt); return i < 0 ? FORMAT_ORDER.length : i }
  return [...groups]
    .map(([arch, items]) => ({ arch, items: items.sort((a, b) => rank(a) - rank(b)) }))
    .sort((a, b) => (a.arch === 'ARM64') - (b.arch === 'ARM64'))
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
.vpn-view {
  height: 100%;
  --psg-primary: #3B3A9E;
  --psg-primary-hover: #2E2D82;
  --psg-on-primary: #FFFFFF;
  --psg-primary-muted: rgba(59, 58, 158, .09);
}

html.dark .vpn-view {
  --psg-primary: #8F8CFF;
  --psg-primary-hover: #A5A3FF;
  --psg-on-primary: #14133A;
  --psg-primary-muted: rgba(143, 140, 255, .16);
}

.vpn-body {
  max-width: 820px;
  margin: 0 auto;
  padding: 40px 32px 56px;
  display: flex;
  flex-direction: column;
  gap: 28px;

  @media (max-width: 640px) { padding: 20px 16px 40px; gap: 22px; }
}

h2 {
  margin: 0 0 12px;
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -.01em;
  color: var(--psg-text);
}

/* ── Hero ── */
.vpn-hero {
  display: flex;
  align-items: center;
  gap: 18px;

  @media (max-width: 640px) { flex-wrap: wrap; }
}

.vpn-hero-icon {
  display: grid;
  place-items: center;
  width: 60px;
  height: 60px;
  flex-shrink: 0;
  border-radius: var(--psg-radius-lg);
  object-fit: cover;
}

.vpn-hero-copy {
  flex: 1;
  min-width: 0;

  h1 {
    margin: 0;
    font-size: 28px;
    font-weight: 700;
    letter-spacing: -.02em;
    line-height: 1.15;
    color: var(--psg-text);
  }

  p {
    margin: 4px 0 0;
    font-size: 14px;
    color: var(--psg-text-secondary);
    line-height: 1.5;
  }
}

.vpn-hero-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
}

.vpn-chip {
  padding: 3px 10px;
  border-radius: var(--psg-radius-full);
  background: var(--psg-surface-muted);
  font-size: 12px;
  font-weight: 700;
  color: var(--psg-text);
}

.vpn-date { font-size: 12px; color: var(--psg-text-muted); }

.vpn-primary {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 46px;
  padding: 0 20px;
  flex-shrink: 0;
  border-radius: var(--psg-radius-md);
  background: var(--psg-primary);
  color: var(--psg-on-primary);
  font-size: 14px;
  font-weight: 700;
  text-decoration: none;
  transition: background .14s ease;

  @media (hover: hover) { &:hover { background: var(--psg-primary-hover); } }
  @media (max-width: 640px) { width: 100%; justify-content: center; }
}

/* ── Steps ── */
.vpn-steps ol {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;

  @media (max-width: 720px) { grid-template-columns: 1fr; }
}

.vpn-steps li {
  display: flex;
  gap: 12px;
  padding: 16px;
  border-radius: var(--psg-radius-lg);
  background: var(--psg-surface-muted);

  > div { display: flex; flex-direction: column; gap: 4px; min-width: 0; }

  strong { font-size: 14px; font-weight: 700; color: var(--psg-text); line-height: 1.35; }

  span { font-size: 13px; color: var(--psg-text-secondary); line-height: 1.5; overflow-wrap: anywhere; }

  a { color: var(--psg-primary); font-weight: 600; text-decoration: none; }
  a:hover { text-decoration: underline; }
}

.vpn-step-no {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--psg-surface);
  color: var(--psg-primary);
  font-size: 13px !important;
  font-weight: 700;
}

/* ── Platform list ── */
.vpn-list { display: flex; flex-direction: column; gap: 8px; }

.vpn-row {
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: 72px;
  padding: 14px 16px;
  border-radius: var(--psg-radius-lg);
  background: var(--psg-surface-muted);
  flex-wrap: wrap;
  min-width: 0;

  &--current { box-shadow: inset 0 0 0 2px var(--psg-primary); }

  &--skeleton { animation: vpn-pulse 1.2s ease-in-out infinite; }
}

.vpn-row-icon {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  border-radius: var(--psg-radius-md);
  background: var(--psg-surface);
  color: var(--psg-text);
}

.vpn-row-info { flex: 1 1 160px; min-width: 0; overflow-wrap: anywhere; }

.vpn-row-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 700;
  color: var(--psg-text);
}

.vpn-current {
  padding: 1px 8px;
  border-radius: var(--psg-radius-full);
  background: var(--psg-primary-muted);
  color: var(--psg-primary);
  font-size: 11px;
  font-weight: 700;
}

.vpn-row-desc {
  margin-top: 2px;
  font-size: 13px;
  color: var(--psg-text-muted);
  line-height: 1.45;
}

.vpn-row-actions {
  display: flex;
  flex: 0 1 auto;
  flex-wrap: wrap;
  justify-content: flex-end;
  min-width: 0;
  max-width: 100%;
  gap: 6px;

  /* Not enough room beside the info: drop under it, aligned with the text. */
  @media (max-width: 900px) { flex: 1 1 100%; justify-content: flex-start; padding-left: 58px; }
}

.vpn-row-groups {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 0 1 auto;
  min-width: 0;

  @media (max-width: 900px) { flex: 1 1 100%; padding-left: 58px; }
  @media (max-width: 640px) { padding-left: 0; }
}

.vpn-group {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.vpn-group-arch {
  width: 64px;
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 700;
  color: var(--psg-text-muted);
}

.vpn-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 36px;
  padding: 0 14px;
  white-space: nowrap;
  border: 0;
  border-radius: var(--psg-radius-full);
  background: var(--psg-surface);
  color: var(--psg-text);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
  transition: background .14s ease, color .14s ease;

  @media (hover: hover) { &:hover { background: var(--psg-surface-active); } }

  &--accent {
    background: var(--psg-primary);
    color: var(--psg-on-primary);

    @media (hover: hover) { &:hover { background: var(--psg-primary-hover); } }
  }
}

.vpn-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 36px 20px;
  border-radius: var(--psg-radius-lg);
  background: var(--psg-surface-muted);
  color: var(--psg-text-secondary);
  font-size: 14px;

  > svg { color: var(--psg-danger); }
}

.vpn-error-actions { display: flex; gap: 8px; }

.vpn-footer a {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  font-weight: 600;
  color: var(--psg-text-muted);
  text-decoration: none;

  @media (hover: hover) { &:hover { color: var(--psg-text); } }
}

@keyframes vpn-pulse {
  0%, 100% { opacity: 1; }
  50%      { opacity: .55; }
}
</style>
