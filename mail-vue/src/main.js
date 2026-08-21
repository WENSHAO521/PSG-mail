import {createApp} from 'vue';
import App from './App.vue';
import router from './router';
import './style.css';
import './professional-mail.css';
import './professional-mail-components.css';

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
import 'element-plus/theme-chalk/dark/css-vars.css';
import 'nprogress/nprogress.css';
import perm from "@/perm/perm.js";
const pinia = createPinia().use(piniaPersistedState)
import i18n from "@/i18n/index.js";
const app = createApp(App).use(pinia)
await init()
app.use(router).use(i18n).directive('perm',perm)
app.config.devtools = true;

app.mount('#app');

// Keep one explicit application font token. Setting it on <html> wins over
// Element Plus' later-loaded root variable without forcing typography rules
// into every component stylesheet.
const PSG_FONT = "'IBM Plex Sans', 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei UI', 'Microsoft YaHei', sans-serif"
document.documentElement.style.setProperty('--el-font-family', PSG_FONT, 'important')
