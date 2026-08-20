import { defineStore } from 'pinia'

export const useUiStore = defineStore('ui', {
    state: () => ({
        asideShow: window.innerWidth > 1024,
        asideCollapsed: false,
        commandPaletteShow: false,
        accountShow: false,
        mobileDetailOpen: false,
        backgroundLoading: true,
        changeNotice: 0,
        writerRef: null,
        changePreview: 0,
        previewData: {},
        key: 0,
        dark: false,
        aiAssistantShow: false,
        // Undo Send grace period, seconds (0 = off). Purely a client-side
        // preference for how long a delay to request when scheduling a
        // just-clicked "Send" — the actual delayed delivery is enforced
        // server-side via the same scheduled_email queue Scheduled Send
        // uses (see mail-worker/src/service/scheduled-email-service.js),
        // never a bare frontend setTimeout.
        undoSendSeconds: 10,
        asideCount: {
            email: 0,
            send: 0,
            sysEmail: 0
        }
    }),
    actions: {
        showNotice() {
            this.changeNotice ++
        },
        previewNotice(data) {
            this.previewData = data
            this.changePreview ++
        }
    },
    persist: {
        pick: ['dark', 'undoSendSeconds'],
    },
})
