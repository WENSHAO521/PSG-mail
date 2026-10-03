import { defineStore } from 'pinia'

const MOBILE_LAYER_MARKER = '__psgMobileLayer'
const handlers = new Map()

function isBrowserMobile() {
    return typeof window !== 'undefined' && window.innerWidth <= 1024
}

function withoutMarker(state) {
    if (!state || typeof state !== 'object') return null
    const next = { ...state }
    delete next[MOBILE_LAYER_MARKER]
    return next
}

function pushLayerMarker(key) {
    if (typeof window === 'undefined') return
    window.history.pushState(
        { ...(window.history.state || {}), [MOBILE_LAYER_MARKER]: key },
        '',
        window.location.href,
    )
}

function restoreLayerMarker(key) {
    if (typeof window === 'undefined') return
    window.history.pushState(
        { ...(window.history.state || {}), [MOBILE_LAYER_MARKER]: key },
        '',
        window.location.href,
    )
}

function currentMarker() {
    return typeof window === 'undefined' ? null : window.history.state?.[MOBILE_LAYER_MARKER] || null
}

// ── Consuming markers without racing navigation ──────────────────────────
// history.back() is asynchronous. If anything pushes a history entry before
// that traversal runs (the router navigating because a folder or a menu item
// was tapped, or another surface opening), the traversal undoes that push:
// the browser lands on the previous entry and the router follows it back to
// the old page — typically the inbox. So a button close only *schedules* the
// back; it is dropped when a navigation starts first (the router then
// replaces the marker entry instead, see onRouterBeforeEach) and is turned
// into a replaceState when another surface opens first.
//
// The popstate our own back() causes must also not be treated as the system
// back button, or it would close the next surface underneath (closing the
// reader's menu would close the reader too).
let pendingBack = null        // { key, steps, timer, reopen: [] }
let ownBacks = 0              // our traversals whose popstate hasn't arrived
let ownBacksTimer = null
let afterOwnBack = null       // re-push markers once our traversal lands
let routerNavigating = false
let popSeen = false

if (typeof window !== 'undefined') {
    window.addEventListener('popstate', () => { popSeen = true })
}

function pushStillOpen(keys) {
    const store = useMobileNavigationStore()
    keys.filter(key => store.layers.includes(key)).forEach(pushLayerMarker)
}

function runPendingBack() {
    const pending = pendingBack
    pendingBack = null
    if (!pending) return
    // A navigation started first: the router replaces the marker entry.
    if (routerNavigating) return
    if (currentMarker() !== pending.key) {
        pushStillOpen(pending.reopen)
        return
    }
    // Surfaces opened while the closed ones were still on top of history get
    // their markers once the traversal has landed.
    const reopen = pending.reopen
    afterOwnBack = reopen.length ? () => pushStillOpen(reopen) : null
    ownBacks++
    clearTimeout(ownBacksTimer)
    // Same-document traversals always fire popstate; the timeout only keeps
    // a lost event from swallowing a later system back.
    ownBacksTimer = setTimeout(() => { ownBacks = 0; afterOwnBack = null }, 1000)
    window.history.go(-pending.steps)
}

function scheduleBack(key) {
    if (pendingBack) {
        const reopened = pendingBack.reopen.indexOf(key)
        // Opened after the pending close: it has no marker of its own yet.
        if (reopened !== -1) pendingBack.reopen.splice(reopened, 1)
        // A surface under one that is already closing; their markers are
        // stacked directly below each other.
        else pendingBack.steps++
        return
    }
    pendingBack = { key, steps: 1, reopen: [], timer: setTimeout(runPendingBack, 0) }
}

// Router hooks (installed in router/index.js).
export function onRouterBeforeEach(to, from) {
    const fromPop = popSeen
    popSeen = false
    routerNavigating = true
    // A forward navigation from a page with an open surface: take the place
    // of its marker entry instead of stacking on top of it, so back from the
    // new page returns to the previous page in one step.
    if (!fromPop && !to.redirectedFrom && to.fullPath !== from.fullPath && currentMarker()) {
        return { path: to.path, query: to.query, hash: to.hash, replace: true }
    }
    return true
}

export function onRouterAfterEach() {
    routerNavigating = false
}

export const useMobileNavigationStore = defineStore('mobileNavigation', {
    state: () => ({
        layers: [],
        handlingPop: false,
    }),

    getters: {
        topLayer: state => state.layers[state.layers.length - 1] || null,
        hasLayer: state => key => state.layers.includes(key),
    },

    actions: {
        openLayer(key, onBack) {
            if (!isBrowserMobile() || !key) return false
            if (!this.layers.includes(key)) {
                this.layers.push(key)
                if (pendingBack?.steps === 1 && currentMarker() === pendingBack.key) {
                    // Reuse the entry of the surface that just closed.
                    clearTimeout(pendingBack.timer)
                    pendingBack = null
                    window.history.replaceState(
                        { ...(window.history.state || {}), [MOBILE_LAYER_MARKER]: key },
                        '',
                        window.location.href,
                    )
                } else if (pendingBack) {
                    pendingBack.reopen.push(key)
                } else {
                    pushLayerMarker(key)
                }
            }
            if (typeof onBack === 'function') handlers.set(key, onBack)
            return true
        },

        closeLayer(key, { fromHistory = false } = {}) {
            const index = this.layers.indexOf(key)
            if (index === -1) {
                handlers.delete(key)
                return false
            }

            const wasTop = index === this.layers.length - 1
            this.layers.splice(index, 1)
            handlers.delete(key)

            // A button/backdrop close must consume the marker we created for
            // this surface. A popstate close already consumed it.
            if (wasTop && !fromHistory && !this.handlingPop
                && (currentMarker() === key || pendingBack)) {
                scheduleBack(key)
            }
            return true
        },

        clearLayers() {
            this.layers.splice(0)
            handlers.clear()
            if (pendingBack) pendingBack.reopen = []
            if (typeof window !== 'undefined'
                && window.history.state?.[MOBILE_LAYER_MARKER]) {
                window.history.replaceState(withoutMarker(window.history.state), '', window.location.href)
            }
        },

        async handlePopState() {
            if (ownBacks > 0) {
                // The traversal a button close asked for, not a system back.
                ownBacks--
                const after = afterOwnBack
                afterOwnBack = null
                after?.()
                return true
            }
            if (!this.layers.length) return false

            const key = this.layers.pop()
            const handler = handlers.get(key)
            handlers.delete(key)
            this.handlingPop = true

            let result
            try {
                result = typeof handler === 'function'
                    ? await handler({ fromHistory: true })
                    : true
            } finally {
                this.handlingPop = false
            }

            // `false`/undefined means the surface is still open, usually
            // because a dirty-form confirmation dialog is waiting. Restore a
            // single marker so the next system back still belongs to PSG Mail.
            if (result !== true) {
                this.layers.push(key)
                if (typeof handler === 'function') handlers.set(key, handler)
                restoreLayerMarker(key)
            }
            return true
        },
    },
})

export { MOBILE_LAYER_MARKER }
