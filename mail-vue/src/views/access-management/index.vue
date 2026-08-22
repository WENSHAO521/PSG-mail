<template>
  <div class="page-outer">
    <div class="space-y">
      <div class="page-header">
        <div>
          <h1 class="page-title">{{ $t('accessManagement') }}</h1>
          <p class="page-subtitle">{{ $t('accessManagementDesc') }}</p>
        </div>
        <el-button type="primary" class="primary-action-btn" @click="primaryAction">
          <Icon :icon="primaryActionIcon" width="16" height="16"/>
          {{ primaryActionLabel }}
        </el-button>
      </div>

      <nav class="tab-bar" role="tablist">
        <button v-if="hasPerm('user:query')" type="button" role="tab" class="tab-btn"
                :class="{ active: activeTab === 'users' }" :aria-selected="activeTab === 'users'"
                @click="setTab('users')">
          {{ $t('tabUsers') }}
        </button>
        <button v-if="hasPerm('role:query')" type="button" role="tab" class="tab-btn"
                :class="{ active: activeTab === 'roles' }" :aria-selected="activeTab === 'roles'"
                @click="setTab('roles')">
          {{ $t('tabRolesPermissions') }}
        </button>
        <button v-if="hasPerm('reg-key:query')" type="button" role="tab" class="tab-btn"
                :class="{ active: activeTab === 'keys' }" :aria-selected="activeTab === 'keys'"
                @click="setTab('keys')">
          {{ $t('tabRegistrationKeys') }}
        </button>
      </nav>

      <UsersTab v-if="activeTab === 'users'" ref="usersTabRef"/>
      <RolesTab v-else-if="activeTab === 'roles'" ref="rolesTabRef"/>
      <RegKeysTab v-else-if="activeTab === 'keys'" ref="keysTabRef"/>
    </div>
  </div>
</template>

<script setup>
import { computed, defineOptions, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { Icon } from '@iconify/vue'
import { hasPerm } from '@/perm/perm.js'
import UsersTab from './users-tab.vue'
import RolesTab from './roles-tab.vue'
import RegKeysTab from './reg-keys-tab.vue'

defineOptions({ name: 'access-mgmt' })

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const availableTabs = computed(() => [
  hasPerm('user:query') ? 'users' : null,
  hasPerm('role:query') ? 'roles' : null,
  hasPerm('reg-key:query') ? 'keys' : null,
].filter(Boolean))

const activeTab = ref(
  availableTabs.value.includes(route.query.tab) ? route.query.tab : availableTabs.value[0]
)

watch(() => route.query.tab, (tab) => {
  if (tab && availableTabs.value.includes(tab) && tab !== activeTab.value) {
    activeTab.value = tab
  }
})

function setTab(tab) {
  if (tab === activeTab.value) return
  activeTab.value = tab
  router.replace({ query: { ...route.query, tab } })
}

const usersTabRef = ref(null)
const rolesTabRef = ref(null)
const keysTabRef = ref(null)

const primaryActionLabel = computed(() => {
  if (activeTab.value === 'users') return t('addUser')
  if (activeTab.value === 'roles') return t('addRoleTitle')
  return t('createKey')
})

const primaryActionIcon = computed(() => {
  if (activeTab.value === 'users') return 'psg:user-plus'
  if (activeTab.value === 'roles') return 'psg:add-circle'
  return 'psg:key'
})

function primaryAction() {
  if (activeTab.value === 'users') usersTabRef.value?.openCreate()
  else if (activeTab.value === 'roles') rolesTabRef.value?.openCreate()
  else if (activeTab.value === 'keys') keysTabRef.value?.openCreate()
}
</script>

<style>
/* Global (unscoped): shared across all three tabs' MoreMenu dropdowns,
   since slotted <el-dropdown-item> content keeps the parent's scope id,
   not access-management/components/MoreMenu.vue's — a scoped rule here
   would never match it. */
.el-dropdown-menu__item.danger {
  color: var(--psg-danger);
}
.el-dropdown-menu__item.danger:not(.is-disabled):hover,
.el-dropdown-menu__item.danger:not(.is-disabled):focus {
  background: var(--psg-danger-muted);
  color: var(--psg-danger);
}
</style>
<style scoped lang="scss">
.page-outer {
  max-width: 1320px;
  margin: 0 auto;
  padding: 24px 32px 56px;
  @media (max-width: 960px) { padding: 20px 24px 40px; }
  @media (max-width: 640px) { padding: 16px 16px 32px; }
}

.space-y {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.page-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--psg-border);
  flex-wrap: wrap;
}

.page-title {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  color: var(--psg-text);
}

.page-subtitle {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--psg-text-secondary);
}

.primary-action-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.tab-bar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px;
  overflow-x: auto;
  background: var(--psg-surface-muted);
  border-radius: var(--psg-radius-md);
  width: fit-content;
  max-width: 100%;
}

.tab-btn {
  flex-shrink: 0;
  padding: 7px 16px;
  font-size: 13.5px;
  font-weight: 600;
  font-family: var(--psg-font-sans);
  color: var(--psg-text-secondary);
  background: transparent;
  border: none;
  border-radius: var(--psg-radius-sm);
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.14s ease, color 0.14s ease;

  @media (hover: hover) {
    &:not(.active):hover { color: var(--psg-text); }
  }

  &.active {
    background: var(--psg-surface);
    color: var(--psg-primary);
    box-shadow: var(--psg-shadow-xs);
  }
}
</style>
