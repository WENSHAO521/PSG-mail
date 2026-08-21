import {createApp} from 'vue';
import App from './App.vue';
import router from './router';

// PSG Mail full-rebuild architecture (target: main.js imports only these four).
import './styles/tokens.css';
import './styles/base.css';
// element-plus's own dark css-vars must load before ours, or its
// `html.dark { --el-color-primary: #409eff; ... }` (same selector,
// same specificity) would win by import order and reintroduce EP blue.
import 'element-plus/theme-chalk/dark/css-vars.css';
import './styles/element-plus.css';
import './styles/platform.css';

// Legacy presentation layer — kept as a safety net while each area of the
// app is rebuilt on scoped component styles. Deleted at the final legacy
// deletion gate; do not add new rules to any of these files.
import './style.css';
import './ui-redesign.css';
import './ui-redesign-phase2.css';
import './ui-redesign-phase3.css';
import './ui-redesign-phase4.css';
import './ui-redesign-phase5.css';
import './ui-redesign-phase6.css';

// Fonts — bundled locally so Electron works offline
import '@fontsource/ibm-plex-sans/400.css'
import '@fontsource/ibm-plex-sans/500.css'
import '@fontsource/ibm-plex-sans/600.css'
import '@fontsource/ibm-plex-sans/700.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
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
await init()
app.use(router).use(i18n).directive('perm',perm)
app.config.devtools = true;

app.mount('#app');

// Vite's CSS minifier strips !important from custom property declarations,
// so :root { --el-font-family: ... !important } in style.css loses to the
// vendor-element-plus chunk (same :root specificity, later in document order).
// Setting via inline style on <html> beats all external stylesheet rules.
const PSG_FONT = "'IBM Plex Sans', 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei UI', 'Microsoft YaHei', sans-serif"
document.documentElement.style.setProperty('--el-font-family', PSG_FONT, 'important')
