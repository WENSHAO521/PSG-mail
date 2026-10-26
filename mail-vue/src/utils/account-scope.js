import { ref, onMounted, watch } from 'vue'
import { accountListAll } from '@/request/account.js'
import { useAccountStore } from '@/store/account.js'

// "All accounts / This account" scope for folders that can mix mail from
// every address the user owns (Sent, Archive, Spam, Deleted, Search). The
// choice is remembered per folder in this browser and defaults to All; the
// chips are only offered when the user has more than one address.
//
// `refresh` reloads the folder's list. Switching the open account only needs
// a reload when the folder is showing that one account.
export function useAccountScope(storageKey, refresh) {
  const accountStore = useAccountStore()
  const multiAccount = ref(false)
  const allAccounts = ref(readScope())

  function readScope() {
    try { return localStorage.getItem(storageKey) !== '0' } catch { return true }
  }

  onMounted(() => {
    accountListAll().then(list => { multiAccount.value = list.length > 1 }).catch(() => {})
  })

  watch(() => accountStore.currentAccountId, () => {
    if (!allAccounts.value || !multiAccount.value) refresh()
  })

  function changeAccountScope(all) {
    if (all === allAccounts.value) return
    allAccounts.value = all
    try { localStorage.setItem(storageKey, all ? '1' : '0') } catch {}
    refresh()
  }

  // The allReceive flag the list endpoints take: 1 = every accessible account.
  function allReceive() {
    return allAccounts.value ? 1 : 0
  }

  return { multiAccount, allAccounts, changeAccountScope, allReceive }
}
