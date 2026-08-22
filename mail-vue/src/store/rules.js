import { defineStore } from 'pinia'

export const useRulesStore = defineStore('rules', {
    state: () => ({
        rules: [],
    }),
    getters: {
        enabledRules: (s) => s.rules.filter(r => r.enabled),
    },
    actions: {
        addRule(rule) {
            const nextRule = {
                id: rule.id || globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                name: String(rule.name || '').trim(),
                conditionType: rule.conditionType || 'subject',
                conditionValue: String(rule.conditionValue || '').trim(),
                action: rule.action || 'star',
                enabled: rule.enabled !== false,
            }
            this.rules.push(nextRule)
            return nextRule
        },
        updateRule(rule) {
            const index = this.rules.findIndex(item => item.id === rule.id)
            if (index === -1) return null
            const updatedRule = {
                ...this.rules[index],
                ...rule,
                name: String(rule.name || '').trim(),
                conditionValue: String(rule.conditionValue || '').trim(),
                enabled: rule.enabled !== false,
            }
            this.rules.splice(index, 1, updatedRule)
            return updatedRule
        },
        removeRule(id) {
            this.rules = this.rules.filter(rule => rule.id !== id)
        },
        setEnabled(id, enabled) {
            const rule = this.rules.find(item => item.id === id)
            if (rule) rule.enabled = Boolean(enabled)
        },
        applyRules(email, { starAdd, archiveEmail, emailRead }) {
            const runAction = (callback, ...args) => {
                if (!callback) return
                try {
                    Promise.resolve(callback(...args)).catch(() => {})
                } catch {
                    // A failed background rule must not interrupt mail sync.
                }
            }

            for (const rule of this.enabledRules) {
                let match = false
                if (rule.conditionType === 'all') {
                    match = true
                } else if (rule.conditionType === 'sender') {
                    const value = String(rule.conditionValue || '').toLowerCase()
                    match = value.length > 0 && (
                        (email.sendEmail || '').toLowerCase().includes(value) ||
                        (email.name || '').toLowerCase().includes(value)
                    )
                } else if (rule.conditionType === 'subject') {
                    const value = String(rule.conditionValue || '').toLowerCase()
                    match = value.length > 0 && (email.subject || '').toLowerCase().includes(value)
                }
                if (!match) continue
                if (rule.action === 'star')      runAction(starAdd, email.emailId)
                if (rule.action === 'archive')   runAction(archiveEmail, email.emailId)
                if (rule.action === 'markRead')  runAction(emailRead, [email.emailId])
            }
        },
    },
    persist: true,
})
