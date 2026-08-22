import { defineStore } from 'pinia'
import { getAvatarByEmail } from '@/request/my.js'
import { normalizeAvatarEmail } from '@/utils/avatar.js'

export const useAvatarCacheStore = defineStore('avatarCache', {
    state: () => ({
        // email → base64 string | null (null = fetch in-flight)
        cache: {}
    }),
    actions: {
        // Trigger a server fetch if not already cached/loading.
        // Returns immediately; when fetch completes the reactive cache
        // entry updates and any component using get() re-renders.
        prefetch(email) {
            const normalizedEmail = normalizeAvatarEmail(email)
            if (!normalizedEmail || normalizedEmail in this.cache) return
            this.cache[normalizedEmail] = null   // mark in-flight
            getAvatarByEmail(normalizedEmail)
                .then(res => { this.cache[normalizedEmail] = res?.avatar || '' })
                .catch(() => { this.cache[normalizedEmail] = '' })
        },
        // Synchronous read + side-effect fetch. Use in templates.
        get(email) {
            this.prefetch(email)
            return this.cache[normalizeAvatarEmail(email)] || ''
        }
    }
})
