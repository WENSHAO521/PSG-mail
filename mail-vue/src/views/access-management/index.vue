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

      <keep-alive>
        <component :is="tabComponents[activeTab]" ref="activeTabRef"/>
      </keep-alive>
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

const tabComponents = { users: UsersTab, roles: RolesTab, keys: RegKeysTab }
const activeTabRef = ref(null)

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
  activeTabRef.value?.openCreate()
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
  max-width: 1120px;
  margin: 0 auto;
  padding: 40px 32px 64px;
  @media (max-width: 960px) { padding: 24px 24px 40px; }
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
  padding-bottom: 8px;
  flex-wrap: wrap;

  @media (max-width: 1024px) {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
    padding-bottom: 0;
  }
}

.page-title {
  margin: 0;
  font-family: var(--psg-font-display);
  font-size: 32px;
  font-weight: 400;
  letter-spacing: -.01em;
  line-height: 40px;
  color: var(--psg-text);
  @media (max-width: 640px) { font-size: 26px; line-height: 32px; }
}

.page-subtitle {
  margin: 4px 0 0;
  font-size: 14px;
  color: var(--psg-text-secondary);
}

.primary-action-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

/* Tabs: text with the accent rule under the open one, on a hairline. */
.tab-bar {
  display: flex;
  align-items: stretch;
  gap: 24px;
  overflow-x: auto;
  border-bottom: 1px solid var(--psg-border);
  max-width: 100%;
  scrollbar-width: none;

  &::-webkit-scrollbar { display: none; }

  @media (max-width: 640px) { gap: 16px; }
}

.tab-btn {
  position: relative;
  flex-shrink: 0;
  height: 40px;
  padding: 0;
  font-size: 14px;
  font-weight: 400;
  font-family: var(--psg-font-sans);
  color: var(--psg-text-muted);
  background: transparent;
  border: none;
  cursor: pointer;
  white-space: nowrap;
  transition: color var(--psg-dur-fast) var(--psg-ease);

  &::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    bottom: -1px;
    height: 2px;
    border-radius: 2px 2px 0 0;
    background: transparent;
  }

  @media (hover: hover) {
    &:not(.active):hover { color: var(--psg-text); }
  }

  &.active {
    color: var(--psg-text);
    font-weight: 500;

    &::after { background: var(--psg-primary); }
  }
}
</style>
