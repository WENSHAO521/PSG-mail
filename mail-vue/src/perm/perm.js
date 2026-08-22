import {useUserStore} from "@/store/user.js";

export default {
    mounted(el, binding) {
        const userStore = useUserStore();
        const permKeys = userStore.user.permKeys;
        const value = binding.value;

        if (permKeys.includes('*')) {
            return;
        }

        const hasPermission = Array.isArray(value)
            ? value.some(key => permKeys.includes(key))
            : permKeys.includes(value);

        if (!hasPermission) {
            el.parentNode && el.parentNode.removeChild(el);
        }
    }
}

export function hasPerm(permKey) {
    const {permKeys} = useUserStore().user;
    if (permKeys.includes('*')) return true;
    return Array.isArray(permKey)
        ? permKey.some(key => permKeys.includes(key))
        : permKeys.includes(permKey);
}


export function permsToRouter(permKeys) {
    const routerMap = new Map()
    Object.keys(routers).forEach(perm => {
        if (permKeys.includes(perm) || permKeys.includes('*')) {
            routers[perm].forEach(route => routerMap.set(route.name, route))
        }
    })
    return [...routerMap.values()];
}

export function preloadAdminRoutes(permKeys) {
    const load = () => {
        const seen = new Set()
        Object.keys(routers).forEach(perm => {
            if (permKeys.includes(perm) || permKeys.includes('*')) {
                routers[perm].forEach(route => {
                    if (seen.has(route.name)) return
                    seen.add(route.name)
                    route.component()
                })
            }
        })
    }
    if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(load, { timeout: 5000 })
    } else {
        setTimeout(load, 2000)
    }
}

const accessManagementRoute = {
    path: '/access-management',
    name: 'access-mgmt',
    component: () => import('@/views/access-management/index.vue'),
    meta: {
        title: 'accessManagement',
        name: 'access-mgmt',
        menu: true
    }
}

const routers = {
    'email:send': [
        {
            path: '/sent',
            name: 'send',
            component: () => import('@/views/send/index.vue'),
            meta: {
                title: 'sent',
                name: 'send',
                menu: true
            }
        },
        {
            path: '/drafts',
            name: 'draft',
            component: () => import('@/views/draft/index.vue'),
            meta: {
                title: 'drafts',
                name: 'draft',
                menu: true
            }
        }
    ],
    'user:query': [accessManagementRoute],
    'role:query': [accessManagementRoute],
    'reg-key:query': [accessManagementRoute],
    'setting:query': [{
        path: '/system-setting',
        name: 'sys-setting',
        component: () => import('@/views/sys-setting/index.vue'),
        meta: {
            title: 'SystemSettings',
            name: 'sys-setting',
            menu: true
        }
    }],
    'all-email:query': [{
        path: '/all-mail',
        name: 'all-email',
        component: () => import('@/views/all-email/index.vue'),
        meta: {
            title: 'allMail',
            name: 'all-email',
            menu: true
        }
    }],
    'analysis:query': [{
        path: '/analysis',
        name: 'analysis',
        component: () => import('@/views/analysis/index.vue'),
        meta: {
            title: 'analytics',
            name: 'analysis',
            menu: true
        }
    }]
}