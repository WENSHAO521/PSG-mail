import { defineStore } from 'pinia'
import { ruleList, ruleAdd, ruleUpdate, ruleDelete, ruleImport } from '@/request/rule.js'

// Rules live on the server and run in the worker when mail arrives (see
// mail-worker/src/service/mail-rule-service.js). Older versions kept them in
// this browser's localStorage under 'rules'; load() moves those up once.
const LEGACY_KEY = 'rules'

function takeLegacyRules() {
    try {
        const raw = localStorage.getItem(LEGACY_KEY)
        if (!raw) return []
        const rules = JSON.parse(raw)?.rules
        return Array.isArray(rules) ? rules : []
    } catch {
        return []
    }
}

export const useRulesStore = defineStore('rules', {
    state: () => ({
        rules: [],
        loaded: false,
    }),
    getters: {
        enabledRules: (s) => s.rules.filter(r => r.enabled),
    },
    actions: {
        async load() {
            const legacy = takeLegacyRules()
            this.rules = legacy.length ? await ruleImport(legacy) : await ruleList()
            if (legacy.length) localStorage.removeItem(LEGACY_KEY)
            this.loaded = true
        },
        async addRule(rule) {
            const saved = await ruleAdd(rule)
            this.rules.push(saved)
            return saved
        },
        async updateRule(rule) {
            const saved = await ruleUpdate(rule)
            const index = this.rules.findIndex(item => item.id === saved.id)
            if (index !== -1) this.rules.splice(index, 1, saved)
            return saved
        },
        async removeRule(id) {
            await ruleDelete(id)
            this.rules = this.rules.filter(rule => rule.id !== id)
        },
        async setEnabled(id, enabled) {
            const rule = this.rules.find(item => item.id === id)
            if (rule) await this.updateRule({ ...rule, enabled: Boolean(enabled) })
        },
    },
})
