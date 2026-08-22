import { defineStore } from 'pinia'

const THEME_MODES = new Set(['light', 'dark', 'system'])

function normalizeThemeMode(mode, fallback = 'light') {
    return THEME_MODES.has(mode) ? mode : fallback
}

function prefersDarkSystemTheme() {
    return typeof window !== 'undefined'
        && typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-color-scheme: dark)').matches
}

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
        // `null` keeps compatibility with the older persisted `dark` boolean.
        // The first applyTheme() call migrates that value to an explicit mode.
        themeMode: null,
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
        applyTheme(mode = null) {
            const fallback = this.dark ? 'dark' : 'light'
            const nextMode = normalizeThemeMode(mode ?? this.themeMode, fallback)
            const nextDark = nextMode === 'dark'
                || (nextMode === 'system' && prefersDarkSystemTheme())

            this.themeMode = nextMode
            this.dark = nextDark

            if (typeof document !== 'undefined') {
                document.documentElement.classList.toggle('dark', nextDark)
                document.documentElement.dataset.theme = nextMode
            }
        },
        setThemeMode(mode) {
            this.applyTheme(mode)
        },
        toggleDark() {
            this.setThemeMode(this.dark ? 'light' : 'dark')
        },
        syncSystemTheme() {
            if (this.themeMode === 'system') this.applyTheme('system')
        },
        showNotice() {
            this.changeNotice ++
        },
        previewNotice(data) {
            this.previewData = data
            this.changePreview ++
        }
    },
    persist: {
        pick: ['dark', 'themeMode', 'undoSendSeconds', 'asideCollapsed'],
    },
})
