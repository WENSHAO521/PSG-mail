import {useUserStore} from "@/store/user.js";
import {useSettingStore} from "@/store/setting.js";
import {useAccountStore} from "@/store/account.js";
import {useUiStore} from "@/store/ui.js";
import {loginUserInfo} from "@/request/my.js";
import {permsToRouter, preloadAdminRoutes} from "@/perm/perm.js";
import router from "@/router";
import {websiteConfig} from "@/request/setting.js";
import i18n from "@/i18n/index.js";

let systemThemeMediaQuery = null;
let systemThemeListener = null;

export async function init() {
    document.title = '\u200B'

    const settingStore = useSettingStore();
    const userStore = useUserStore();
    const accountStore = useAccountStore();
    const uiStore = useUiStore();

    // Apply the persisted theme before the first render. This also migrates
    // the legacy persisted `dark` boolean to the new explicit theme mode.
    uiStore.applyTheme();
    watchSystemTheme(uiStore);

    const token = localStorage.getItem('token');
    if (!settingStore.lang) {
        let lang = navigator.language.split('-')[0]
        lang = lang === 'zh' ? lang : 'en'
        settingStore.lang = lang
    }

    i18n.global.locale.value = settingStore.lang

    let setting = null;

    if (token) {
        const userPromise = loginUserInfo().catch(e => {
            console.error(e);
            return null;
        });

        const [s, user] = await Promise.all([websiteConfig(), userPromise]);
        setting = s;
        settingStore.settings = setting;
        settingStore.domainList = setting.domainList;
        document.title = setting.title;

        if (user) {
            accountStore.currentAccountId = user.account.accountId;
            accountStore.currentAccount = user.account;
            userStore.user = user;
            userStore.loadAvatar();

            const routers = permsToRouter(user.permKeys);
            routers.forEach(routerData => {
                router.addRoute('layout', routerData);
            });
            preloadAdminRoutes(user.permKeys);

            initPushNotifications();
        }

    } else {
        setting = await websiteConfig();
        settingStore.settings = setting;
        settingStore.domainList = setting.domainList;
        document.title = setting.title;
    }
}

function watchSystemTheme(uiStore) {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;

    if (systemThemeMediaQuery && systemThemeListener) {
        if (typeof systemThemeMediaQuery.removeEventListener === 'function') {
            systemThemeMediaQuery.removeEventListener('change', systemThemeListener);
        } else {
            systemThemeMediaQuery.removeListener?.(systemThemeListener);
        }
    }

    systemThemeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    systemThemeListener = () => uiStore.syncSystemTheme();
    if (typeof systemThemeMediaQuery.addEventListener === 'function') {
        systemThemeMediaQuery.addEventListener('change', systemThemeListener);
    } else {
        systemThemeMediaQuery.addListener?.(systemThemeListener);
    }
}

// Fire-and-forget: repairs an already-authorized push registration after a
// successful login. Initial app boot must not trigger an OS/browser permission
// prompt; the Settings page owns the explicit opt-in action.
//
// registerWebPush({ requestPermission: false }) only repairs an already
// granted browser permission. The Settings page calls registerWebPush()
// after the user explicitly clicks Enable/Reconnect.
export function initPushNotifications() {
    if (window.electronAPI?.sendNotification) return;

    import('@/utils/push-service.js')
        .then(({ initNativePush }) => initNativePush({ requestPermission: false }))
        .catch(e => console.error('Native push init failed', e));

    import('@/web-push.js')
        .then(({ registerWebPush }) => registerWebPush({ requestPermission: false }))
        .catch(e => console.error('Web push init failed', e));
}
