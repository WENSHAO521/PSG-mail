import { defineStore } from 'pinia'

export const useEmailStore = defineStore('email', {
    state: () => ({
        deleteIds: null,
        starScroll: null,
        emailScroll: null,
        // Set by mailSyncService when a new email arrives while the Inbox
        // view isn't mounted (or belongs to a different account scope) —
        // the Inbox view refreshes and clears this on mount/activation.
        inboxDirty: false,
        cancelStarEmailId: 0,
        addStarEmailId: 0,
        inboxUnreadCount: 0,
        contentData: {
            email: null,
            delType: null,
            showStar: true,
            showReply: true,
            showUnread: false,
            emailIndex: 0,
            emailTotal: 0,
        },
        sendScroll: null,
        // The email list currently on screen (any folder): lets the reader
        // and keyboard shortcuts open the previous / next message.
        activeList: null,
        // One-shot commands for the open message (keyboard shortcuts):
        // { name: 'star' | 'delete', at: Date.now() }.
        readerCommand: null,
    }),
    persist: {
        pick: ['contentData'],
    },
})
