import { defineStore } from 'pinia'
import { getAvatarsByEmails } from '@/request/my.js'
import { normalizeAvatarEmail } from '@/utils/avatar.js'

// The mail list asks for one avatar per row; requests made in the same tick
// are sent together, BATCH_MAX at a time, instead of one request per sender.
const BATCH_MAX = 50
let pending = new Set()
let flushScheduled = false

export const useAvatarCacheStore = defineStore('avatarCache', {
    state: () => ({
        // email → base64 string | null (null = fetch in-flight)
        cache: {}
    }),
    actions: {
        // Queue a server fetch if not already cached/loading.
        // Returns immediately; when the batch completes the reactive cache
        // entry updates and any component using get() re-renders.
        prefetch(email) {
            const normalizedEmail = normalizeAvatarEmail(email)
            if (!normalizedEmail || normalizedEmail in this.cache) return
            this.cache[normalizedEmail] = null   // mark in-flight
            pending.add(normalizedEmail)
            if (!flushScheduled) {
                flushScheduled = true
                queueMicrotask(() => this.flush())
            }
        },
        flush() {
            flushScheduled = false
            const emails = [...pending]
            pending = new Set()
            for (let i = 0; i < emails.length; i += BATCH_MAX) {
                const batch = emails.slice(i, i + BATCH_MAX)
                getAvatarsByEmails(batch)
                    .then(map => batch.forEach(e => { this.cache[e] = map?.[e] || '' }))
                    .catch(() => batch.forEach(e => { this.cache[e] = '' }))
            }
        },
        // Synchronous read + side-effect fetch. Use in templates.
        get(email) {
            this.prefetch(email)
            return this.cache[normalizeAvatarEmail(email)] || ''
        }
    }
})
