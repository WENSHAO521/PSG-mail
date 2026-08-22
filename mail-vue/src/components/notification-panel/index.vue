<template>
  <el-popover
    placement="bottom-end"
    :width="320"
    trigger="click"
    popper-class="notif-popper"
    @show="notifStore.markAllRead()"
  >
    <template #reference>
      <div class="icon-btn notif-trigger">
        <el-badge
          :value="notifStore.unreadCount"
          :hidden="!notifStore.unreadCount"
          :max="99"
          class="notif-badge"
        >
          <Icon icon="psg:bell" width="20" height="20"/>
        </el-badge>
      </div>
    </template>

    <div class="notif-panel">
      <!-- Header -->
      <div class="notif-head">
        <span class="notif-title">{{ $t('notifications') }}</span>
        <button v-if="notifStore.items.length" class="notif-clear-btn" @click="notifStore.clear()">
          {{ $t('clearAll') }}
        </button>
      </div>

      <!-- List -->
      <div v-if="notifStore.items.length" class="notif-list">
        <div
          v-for="item in notifStore.items"
          :key="item.emailId"
          class="notif-item"
        >
          <div class="notif-sender">{{ item.name }}</div>
          <div class="notif-subject">{{ item.subject || $t('noSubject') }}</div>
          <div class="notif-time">{{ fromNow(item.time) }}</div>
        </div>
      </div>

      <!-- Empty -->
      <div v-else class="notif-empty">
        <el-empty :image-size="56" :description="$t('noNotifications')"/>
      </div>
    </div>
  </el-popover>
</template>

<script setup>
import { Icon } from '@iconify/vue'
import { useNotificationStore } from '@/store/notification.js'
import { useI18n } from 'vue-i18n'
import { fromNow } from '@/utils/day.js'

const { t } = useI18n()
const notifStore = useNotificationStore()
</script>

<style>
.notif-popper {
  padding: 0 !important;
  border-radius: var(--psg-radius-sm) !important;
  overflow: hidden;
}
</style>

<style lang="scss" scoped>
.notif-trigger {
  position: relative;
}

.notif-badge {
  display: flex;
  align-items: center;
  justify-content: center;

  :deep(.el-badge__content) {
    background: var(--psg-danger);
    color: var(--psg-on-primary);
    border-color: transparent;
    font-size: 10px;
    height: 16px;
    line-height: 16px;
    padding: 0 4px;
    min-width: 16px;
  }
}

.notif-panel {
  display: flex;
  flex-direction: column;
  max-height: 420px;
}

.notif-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px 10px;
  border-bottom: 1px solid var(--psg-border);
  flex-shrink: 0;

  .notif-title {
    font-size: 13px;
    font-weight: 700;
    color: var(--psg-text);
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .notif-clear-btn {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 11.5px;
    color: var(--psg-text-secondary);
    padding: 0;
    &:hover { color: var(--psg-text); }
  }
}


.notif-list {
  overflow-y: auto;
  flex: 1;
}

.notif-item {
  padding: 10px 14px;
  border-bottom: 1px solid var(--psg-border);
  cursor: default;

  &:last-child { border-bottom: none; }
  &:hover { background: var(--psg-surface-muted); }

  .notif-sender {
    font-size: 12.5px;
    font-weight: 700;
    color: var(--psg-text);
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .notif-subject {
    font-size: 12px;
    color: var(--psg-text-secondary);
    margin-top: 2px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .notif-time {
    font-size: 11px;
    color: var(--psg-text-muted);
    margin-top: 3px;
  }
}

.notif-empty {
  padding: 16px 0;
}
</style>
