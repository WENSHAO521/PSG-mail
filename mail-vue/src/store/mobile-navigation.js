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
                pushLayerMarker(key)
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
                && window.history.state?.[MOBILE_LAYER_MARKER] === key) {
                window.history.back()
            }
            return true
        },

        clearLayers() {
            this.layers.splice(0)
            handlers.clear()
            if (typeof window !== 'undefined'
                && window.history.state?.[MOBILE_LAYER_MARKER]) {
                window.history.replaceState(withoutMarker(window.history.state), '', window.location.href)
            }
        },

        async handlePopState() {
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
