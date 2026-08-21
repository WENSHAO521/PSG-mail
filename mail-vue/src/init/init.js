import {useUserStore} from "@/store/user.js";
import {useSettingStore} from "@/store/setting.js";
import {useAccountStore} from "@/store/account.js";
import {loginUserInfo} from "@/request/my.js";
import {permsToRouter, preloadAdminRoutes} from "@/perm/perm.js";
import router from "@/router";
import {websiteConfig} from "@/request/setting.js";
import i18n from "@/i18n/index.js";

export async function init() {
    document.title = '\u200B'

    const settingStore = useSettingStore();
    const userStore = useUserStore();
    const accountStore = useAccountStore();

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

// Fire-and-forget: registers this device for push after a successful login.
// Never blocks app boot — permission prompts and network calls run in the
// background. Electron keeps its own native notifications + polling.
//
// registerWebPush() is idempotent (standards Web Push's subscribe() returns
// the existing subscription if one is already active, and the backend
// UPSERTs on endpoint) and, when Notification.permission is already
// 'granted', calling it never re-prompts — Notification.requestPermission()
// resolves immediately with the existing decision. So this is safe to call
// on every app boot/login, and is exactly what repairs a device that has
// permission granted but was never actually registered (see login/index.vue's
// saveToken(), which calls this too, and setting/index.vue's manual
// "reconnect push" button for the same repair on an already-open session).
export function initPushNotifications() {
    if (window.electronAPI?.sendNotification) return;

    import('@/utils/push-service.js')
        .then(({ initNativePush }) => initNativePush())
        .catch(e => console.error('Native push init failed', e));

    import('@/web-push.js')
        .then(({ registerWebPush }) => registerWebPush())
        .catch(e => console.error('Web push init failed', e));
}
