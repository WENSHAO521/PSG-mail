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
        aiAssistantShow: false,
        mobileDetailOpen: false,
        // Phone composer pulled down into its docked bar.
        composeDocked: false,
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
                const root = document.documentElement
                const changed = root.classList.contains('dark') !== nextDark
                // Dozens of controls fade background/color at their own
                // speeds; letting them run on a theme flip makes the page
                // flash in patches. Switch everything in one frame instead.
                if (changed) root.classList.add('psg-theme-switching')
                root.classList.toggle('dark', nextDark)
                root.dataset.theme = nextMode
                document.getElementById('theme-color-meta')
                    ?.setAttribute('content', nextDark ? '#111317' : '#F4F5F7')
                if (changed) {
                    void root.offsetHeight
                    requestAnimationFrame(() => requestAnimationFrame(() => {
                        root.classList.remove('psg-theme-switching')
                    }))
                }
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
        pick: ['dark', 'themeMode', 'asideCollapsed'],
    },
})
