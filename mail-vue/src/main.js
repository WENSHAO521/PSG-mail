import {createApp} from 'vue';
import App from './App.vue';
import router from './router';

// PSG Mail design system — the entire app's presentation layer.
import './styles/tokens.css';
import './styles/base.css';
// element-plus's own dark css-vars must load before ours, or its
// `html.dark { --el-color-primary: #409eff; ... }` (same selector,
// same specificity) would win by import order and reintroduce EP blue.
import 'element-plus/theme-chalk/dark/css-vars.css';
import './styles/element-plus.css';
import './styles/platform.css';

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

// Belt-and-suspenders: force the font past Element Plus's own vendor
// chunk regardless of build-specific chunk/cascade ordering. An inline
// style on <html> beats any external stylesheet rule.
const PSG_FONT = "'IBM Plex Sans', 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei UI', 'Microsoft YaHei', sans-serif"
document.documentElement.style.setProperty('--el-font-family', PSG_FONT, 'important')
