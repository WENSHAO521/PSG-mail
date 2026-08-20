import { defineStore } from 'pinia'

// Recent searches only — the query text, not results (results are always
// re-fetched fresh from the backend).
export const useSearchStore = defineStore('search', {
    state: () => ({
        recent: [],
    }),
    actions: {
        remember(query) {
            const q = query.trim()
            if (!q) return
            this.recent = [q, ...this.recent.filter(r => r !== q)].slice(0, 10)
        },
        clear() {
            this.recent = []
        },
    },
    persist: true,
})
