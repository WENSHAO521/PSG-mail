<template>
  <el-popover
    placement="bottom-end"
    :width="320"
    trigger="click"
    popper-class="notif-popper"
  >
    <template #reference>
      <button type="button" class="icon-btn notif-trigger" :aria-label="$t('notifications')">
        <el-badge
          :value="notifStore.unreadCount"
          :hidden="!notifStore.unreadCount"
          :max="99"
          class="notif-badge"
        >
          <Icon icon="psg:bell" width="20" height="20"/>
        </el-badge>
      </button>
    </template>

    <div class="notif-panel">
      <!-- Header -->
      <div class="notif-head">
        <span class="notif-title">{{ $t('notifications') }}</span>
        <div v-if="notifStore.items.length" class="notif-head-actions">
          <button
            v-if="notifStore.unreadCount"
            type="button"
            class="notif-action-btn"
            @click="notifStore.markAllRead()"
          >
            {{ $t('markAllRead') }}
          </button>
          <button type="button" class="notif-action-btn" @click="notifStore.clear()">
            {{ $t('clearAll') }}
          </button>
        </div>
      </div>

      <!-- List -->
      <div v-if="notifStore.items.length" class="notif-list">
        <button
          v-for="item in notifStore.items"
          :key="item.emailId"
          class="notif-item"
          :class="{ 'is-unread': !item.read }"
          type="button"
          @click="openNotification(item)"
        >
          <div class="notif-sender">{{ item.name }}</div>
          <div class="notif-subject">{{ item.subject || $t('noSubject') }}</div>
          <div class="notif-time">{{ fromNow(item.time) }}</div>
        </button>
      </div>

      <!-- Empty -->
      <div v-else class="notif-empty">
        <div class="notif-empty-icon" aria-hidden="true">
          <Icon icon="psg:bell" width="20" height="20"/>
        </div>
        <p class="notif-empty-text">{{ $t('noNotifications') }}</p>
      </div>
    </div>
  </el-popover>
</template>

<script setup>
import { Icon } from '@iconify/vue'
import { useNotificationStore } from '@/store/notification.js'
import { useI18n } from 'vue-i18n'
import { fromNow } from '@/utils/day.js'
import { openEmailById } from '@/utils/mail-sync-service.js'
import { onMounted } from 'vue'

const { t } = useI18n()
const notifStore = useNotificationStore()

onMounted(() => { notifStore.loadPersisted() })

async function openNotification(item) {
  await notifStore.markRead(item.emailId)
  await openEmailById(item.emailId)
}
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
  border: none;
  background: transparent;
  padding: 0;
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

  .notif-head-actions {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .notif-action-btn {
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
  display: block;
  width: 100%;
  border: 0;
  background: transparent;
  text-align: left;
  padding: 10px 14px;
  border-bottom: 1px solid var(--psg-border);
  cursor: pointer;

  &:last-child { border-bottom: none; }
  &:hover { background: var(--psg-surface-muted); }

  &:focus-visible {
    outline: 2px solid var(--psg-focus);
    outline-offset: -2px;
  }

  &.is-unread {
    background: var(--psg-primary-muted);
  }

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
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 156px;
  padding: 24px 18px;
  text-align: center;
}

.notif-empty-icon {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  color: var(--psg-text-muted);
  background: var(--psg-surface-muted);
  border: 1px solid var(--psg-border);
  border-radius: var(--psg-radius-xs);
}

.notif-empty-text {
  margin: 0;
  color: var(--psg-text-secondary);
  font-size: 12.5px;
  line-height: 1.4;
}
</style>
