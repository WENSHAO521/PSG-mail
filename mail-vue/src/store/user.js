import { defineStore } from 'pinia'
import { loginUserInfo, updateSignatures, updateUndoSendSeconds, updateReplyFromReceived, saveAvatar as apiSaveAvatar, clearAvatar as apiClearAvatar } from '@/request/my.js'
import { normalizeAvatarEmail, storedAvatar } from '@/utils/avatar.js'

export const useUserStore = defineStore('user', {
    state: () => ({
        user: {},
        refreshList: 0,
        avatar: '',
    }),
    getters: {
        // Gmail-style signature list; older servers only send `signature`.
        signatureList(state) {
            const sigs = state.user?.signatures
            if (sigs && Array.isArray(sigs.items)) return sigs.items
            return state.user?.signature ? [{ id: 'default', name: '', html: state.user.signature }] : []
        },
        // Signature a fresh compose ('new') or a reply/forward ('reply') starts with.
        defaultSignature(state) {
            return (kind) => {
                const sigs = state.user?.signatures
                if (!sigs || !Array.isArray(sigs.items)) return state.user?.signature || ''
                const id = kind === 'reply' ? sigs.replyId : sigs.newId
                return sigs.items.find(i => i.id === id)?.html || ''
            }
        },
    },
    actions: {
        refreshUserList() {
            loginUserInfo().then(() => { this.refreshList++ })
        },
        refreshUserInfo() {
            loginUserInfo().then(user => {
                this.user = user
                this.loadAvatar()
            })
        },
        loadAvatar() {
            const avatar = this.user?.avatar
            if (avatar) {
                this.avatar = avatar
            } else {
                // localStorage is only an instant-load cache; the server value is authoritative.
                const email = this.user?.email
                this.avatar = email ? storedAvatar(email) : ''
            }
        },
        async saveAvatar(base64) {
            // Commit the local state only after the server confirms the write.
            // The server copy is the source of truth for other devices and
            // recipients' mailboxes; localStorage is only an instant-load cache.
            await apiSaveAvatar(base64)
            this.avatar = base64
            this.user.avatar = base64
            const email = this.user?.email
            if (email) localStorage.setItem(`psg_avatar_${normalizeAvatarEmail(email)}`, base64)
        },
        async clearAvatar() {
            await apiClearAvatar()
            this.avatar = ''
            this.user.avatar = ''
            const email = this.user?.email
            if (email) {
                const normalizedEmail = normalizeAvatarEmail(email)
                localStorage.removeItem(`psg_avatar_${normalizedEmail}`)
                if (email !== normalizedEmail) localStorage.removeItem(`psg_avatar_${email}`)
            }
        },
        async saveSignatures(data) {
            const saved = await updateSignatures(data)
            this.user.signatures = saved
            this.user.signature = saved.items.find(i => i.id === saved.newId)?.html || ''
        },
        async saveUndoSendSeconds(seconds) {
            await updateUndoSendSeconds(seconds)
            this.user.undoSendSeconds = seconds
        },
        async saveReplyFromReceived(enabled) {
            await updateReplyFromReceived(enabled)
            this.user.replyFromReceived = enabled
        }
    }
})
