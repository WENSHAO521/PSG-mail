import { defineStore } from 'pinia'
import { labelList } from '@/request/label.js'

// Shared across the sidebar, per-label view, Settings management section,
// and the reading-pane label picker so they all see the same list without
// each independently re-fetching.
export const useLabelStore = defineStore('label', {
    state: () => ({
        labels: [],
        loaded: false,
    }),
    actions: {
        async load(force = false) {
            if (this.loaded && !force) return this.labels
            try {
                this.labels = await labelList()
                this.loaded = true
            } catch { /* leave previous list in place */ }
            return this.labels
        },
        upsertLocal(label) {
            const idx = this.labels.findIndex(l => l.labelId === label.labelId)
            if (idx > -1) this.labels[idx] = { ...this.labels[idx], ...label }
            else this.labels.push(label)
        },
        removeLocal(labelId) {
            this.labels = this.labels.filter(l => l.labelId !== labelId)
        },
    },
})
