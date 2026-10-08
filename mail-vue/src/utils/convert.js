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

// Prefix that replaces the "{{domain}}" placeholder in stored mail HTML.
// With a public bucket domain the object is fetched from there; otherwise
// through this deployment's access-controlled /oss route (the server signs
// each inline reference with ?exp=&sig=). Using VITE_BASE_URL rather than
// a bare "/" also makes inline images work in the desktop/Android builds,
// whose page origin is not the API server.
export function inlineObjectPrefix() {
    const { settings } = useSettingStore();
    const domain = settings.r2Domain
    if (domain) return toOssDomain(domain) + '/'
    return `${import.meta.env.VITE_BASE_URL}/oss/`
}

// Download/preview URL for an attachment row. Prefers the server-issued
// signed URL (att.url, relative to the API base) so it works under
// ATTACHMENT_ACCESS_MODE=enforce; falls back to the 3.x key-based URL.
export function attUrl(att) {
    if (!att) return ''
    const { settings } = useSettingStore();
    if (att.url && !settings.r2Domain) {
        return `${import.meta.env.VITE_BASE_URL}${att.url}`
    }
    return cvtR2Url(att.key)
}
