import {createRouter, createWebHistory, createWebHashHistory} from 'vue-router'
import NProgress from 'nprogress';
import {useUiStore} from "@/store/ui.js";
import {useSettingStore} from "@/store/setting.js";
import {cvtR2Url} from "@/utils/convert.js";

const routes = [
    {
        path: '/',
        name: 'layout',
        redirect: '/inbox',
        component: () => import('@/layout/index.vue'),
        children: [
            {
                path: '/inbox',
                name: 'email',
                component: () => import('@/views/email/index.vue'),
                meta: {
                    title: 'inbox',
                    name: 'email',
                    menu: true
                }
            },
            {
                path: '/all-inbox',
                name: 'all-inbox',
                component: () => import('@/views/all-inbox/index.vue'),
                meta: {
                    title: 'allInbox',
                    name: 'all-inbox',
                    menu: true
                }
            },
            {
                path: '/settings',
                name: 'setting',
                component: () => import('@/views/setting/index.vue'),
                meta: {
                    title: 'settings',
                    name: 'setting',
                    menu: true
                }
            },
            {
                path: '/about',
                name: 'about',
                component: () => import('@/views/about/index.vue'),
                meta: {
                    title: 'about',
                    name: 'about',
                    menu: true
                }
            },
{
                path: '/archive',
                name: 'archive',
                component: () => import('@/views/archive/index.vue'),
                meta: { title: 'archiveFolder', name: 'archive', menu: true }
            },
            {
                path: '/spam',
                name: 'spam',
                component: () => import('@/views/spam/index.vue'),
                meta: { title: 'spam', name: 'spam', menu: true }
            },
            {
                path: '/trash',
                name: 'trash',
                component: () => import('@/views/trash/index.vue'),
                meta: { title: 'deletedMail', name: 'trash', menu: true }
            },
            {
                path: '/templates',
                name: 'templates',
                component: () => import('@/views/templates/index.vue'),
                meta: { title: 'templates', name: 'templates', menu: true }
            },
            {
                path: '/groups',
                name: 'groups',
                component: () => import('@/views/groups/index.vue'),
                meta: { title: 'contactGroups', name: 'groups', menu: true }
            },
            {
                path: '/starred',
                name: 'star',
                component: () => import('@/views/star/index.vue'),
                meta: {
                    title: 'starred',
                    name: 'star',
                    menu: true
                }
            },
            {
                path: '/send',
                name: 'send',
                component: () => import('@/views/send/index.vue'),
                meta: { title: 'sent', name: 'send', menu: true }
            },
            {
                path: '/draft',
                name: 'draft',
                component: () => import('@/views/draft/index.vue'),
                meta: { title: 'drafts', name: 'draft', menu: true }
            },
            {
                path: '/scheduled',
                name: 'scheduled',
                component: () => import('@/views/scheduled/index.vue'),
                meta: { title: 'scheduled', name: 'scheduled', menu: true }
            },
            {
                path: '/download',
                name: 'download',
                component: () => import('@/views/download/index.vue'),
                meta: { title: 'download', name: 'download', menu: true }
            },
            {
                path: '/vpn',
                name: 'vpn',
                component: () => import('@/views/vpn/index.vue'),
                meta: { title: 'vpn', name: 'vpn', menu: true }
            },
        ]

    },
    {
        path: '/login',
        name: 'login',
        component: () => import('@/views/login/index.vue')
    },
    {
        path: '/:pathMatch(.*)*',
        name: '404',
        component: () => import('@/views/404/index.vue')
    }
]


// Electron production loads from file:// — use hash history to avoid 404s
const router = createRouter({
    history: window.location.protocol === 'file:'
        ? createWebHashHistory()
        : createWebHistory(import.meta.env.BASE_URL),
    routes
})

NProgress.configure({
    showSpinner: false,   // 不显示旋转图标
    trickleSpeed: 50,    // 自动递增速度
    minimum: 0.1          // 最小百分比
});

let timer
let first = true

router.beforeEach((to, from, next) => {

    if (timer) {
        clearTimeout(timer)
    }

    if (!first) {
        timer = setTimeout(() => {
            NProgress.start()
        }, 100)
    }

    const token = localStorage.getItem('token')

    if (!token && to.name !== 'login') {
        return next({name: 'login'})
    }

    if (!token && to.name === 'login') {
        loadBackground(next)
        return
    }

    if (token && to.name === 'login') {
        return next(from.path)
    }

    next()

})

function loadBackground(next) {

    const settingStore = useSettingStore();

    if (settingStore.settings.background) {

        const src = cvtR2Url(settingStore.settings.background);

        const img = new Image();
        img.src = src;
        let done = false;
        const proceed = () => { if (!done) { done = true; next(); } };

        img.onload = proceed;
        img.onerror = () => { proceed(); };
        setTimeout(() => { proceed(); }, 3000);

    } else {
        next()
    }

}

router.afterEach(() => {
    clearTimeout(timer)
    if (first) {
        removeLoading()
    } else {
        NProgress.done();
    }
    first = false
})

function removeLoading() {
    const doc = document.getElementById('loading-first');
    if (!doc) {
        return;
    }

    doc.remove()
}

export default router
