import {createApp} from 'vue';
import App from './App.vue';
import router from './router';

// PSG Mail design system — the entire app's presentation layer.
import './styles/tokens.css';
import './styles/base.css';
import './styles/workspace.css';
import './styles/mobile.css';
// element-plus ships its own `html.dark { --el-color-primary: #409eff; ... }`.
// `html.dark` outranks a bare `:root` by specificity, so element-plus.css
// re-declares every mapping under the same `html.dark` selector to match —
// import order alone doesn't settle it, matching specificity does.
import 'element-plus/theme-chalk/dark/css-vars.css';
import './styles/element-plus.css';
import './styles/platform.css';

// Fonts — bundled locally so Electron works offline
import '@fontsource/dm-sans/400.css'
import '@fontsource/dm-sans/500.css'
import '@fontsource/dm-sans/600.css'
import '@fontsource/dm-sans/700.css'
import '@fontsource/jetbrains-mono/500.css'
import '@fontsource/noto-sans-sc/chinese-simplified-400.css'
import '@fontsource/noto-sans-sc/chinese-simplified-500.css'
import '@fontsource/noto-sans-sc/chinese-simplified-700.css'
import { init } from '@/init/init.js';
import { createPinia } from 'pinia';
import piniaPersistedState from 'pinia-plugin-persistedstate';
import 'nprogress/nprogress.css';
import perm from "@/perm/perm.js";
const pinia = createPinia().use(piniaPersistedState)
import i18n from "@/i18n/index.js";
const app = createApp(App).use(pinia)
let booted = false
try {
    await init()
    booted = true
} catch (e) {
    console.error('App init failed', e)
    showBootError()
}

if (booted) {
    app.use(router).use(i18n).directive('perm',perm)
    app.config.devtools = true;
    app.mount('#app');
}

// init() needs the API (site config + current user). If it fails, the boot
// splash would otherwise spin forever with no way out but a manual reload.
function showBootError() {
    const host = document.querySelector('#loading-first .loading-icon')
    if (!host) return
    host.querySelector('.loading-progress')?.remove()
    const msg = document.createElement('p')
    msg.className = 'loading-error'
    msg.textContent = i18n.global.t('bootFailed')
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'loading-retry'
    btn.textContent = i18n.global.t('retry')
    btn.addEventListener('click', () => location.reload())
    host.append(msg, btn)
}

// Belt-and-suspenders: force the font past Element Plus's own vendor
// chunk regardless of build-specific chunk/cascade ordering. An inline
// style on <html> beats any external stylesheet rule.
const PSG_FONT = "'IBM Plex Sans', 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei UI', 'Microsoft YaHei', sans-serif"
document.documentElement.style.setProperty('--el-font-family', PSG_FONT, 'important')
