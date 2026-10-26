import {useSettingStore} from "@/store/setting.js";
export function cvtR2Url(key) {

    if (!key) {
        return + 'https://' + ''
    }

    if (key.startsWith('https://')) {
        return key
    }

    const { settings } = useSettingStore();

    let domain = settings.r2Domain

    if (!domain) {
        // No public bucket domain configured — proxy through the worker's own
        // /oss/:key route instead of returning a bare storage key (which isn't
        // a valid href and silently fails to download/render).
        return `${import.meta.env.VITE_BASE_URL}/oss/${key}`;
    }

    if (!domain.startsWith('http')) {
        return 'https://' + domain + '/' + key
    }

    if (domain.endsWith("/")) {
        domain = domain.slice(0, -1);
    }
    return domain + '/' + key
}

// Replaces the {{domain}} placeholder the worker leaves in stored mail HTML
// for inline (cid:) images. Without a public bucket domain the images go
// through the worker's /oss/ route, like cvtR2Url does for attachments.
export function fillImageDomain(content, domain) {
    const base = domain ? toOssDomain(domain) + '/' : `${import.meta.env.VITE_BASE_URL}/oss/`
    return (content || '').replace(/{{domain}}/g, base)
}

export function toOssDomain(domain) {

    if (!domain) {
        return ''
    }

    if (!domain.startsWith('http')) {
        return 'https://' + domain
    }

    if (domain.endsWith("/")) {
        domain = domain.slice(0, -1);
    }

    return domain
}
