<template>
  <div class="workspace-page">
    <section class="workspace-hero" aria-labelledby="scheduled-title">
      <div>
        <div class="workspace-eyebrow">
          <span class="workspace-eyebrow-mark" aria-hidden="true" />
          {{ $t('scheduled') }}
        </div>
        <h1 id="scheduled-title">{{ $t('scheduled') }}</h1>
        <p>{{ $t('scheduledDesc') }}</p>
      </div>
    </section>

    <section class="workspace-note" role="note">
      <Icon icon="psg:info-circle" width="17" height="17" aria-hidden="true" />
      <span>{{ $t('scheduledScopeNote') }}</span>
    </section>

    <section class="workspace-stats" aria-label="Scheduled mail summary">
      <div class="workspace-stat-card surface-card">
        <span class="workspace-stat-label">{{ $t('scheduledTotalCount') }}</span>
        <strong class="workspace-stat-value">{{ list.length }}</strong>
      </div>
      <div class="workspace-stat-card surface-card">
        <span class="workspace-stat-label">{{ $t('scheduledPendingCount') }}</span>
        <strong class="workspace-stat-value workspace-stat-value--accent">{{ pendingCount }}</strong>
      </div>
      <div class="workspace-stat-card workspace-stat-card--wide surface-card">
        <span class="workspace-stat-label">{{ $t('scheduledIssueCount') }}</span>
        <span class="workspace-stat-description">{{ issueCount }}</span>
      </div>
    </section>

    <section class="workspace-surface" aria-labelledby="scheduled-list-title">
      <header class="workspace-surface-header">
        <div>
          <h2 id="scheduled-list-title">{{ $t('scheduled') }}</h2>
          <p>{{ $t('scheduledListDesc') }}</p>
        </div>
        <button class="workspace-icon-button" :aria-label="$t('refresh')" :title="$t('refresh')" @click="load">
          <Icon icon="psg:refresh" width="16" height="16" />
        </button>
      </header>

      <div v-if="!list.length" class="workspace-empty">
        <div class="workspace-empty-icon">
          <Icon icon="psg:clock" width="26" height="26" aria-hidden="true" />
        </div>
        <h3>{{ $t('scheduledEmpty') }}</h3>
        <p>{{ $t('scheduledEmptyDesc') }}</p>
      </div>

      <div v-else class="item-list">
        <div class="item-row" v-for="row in list" :key="row.id">
          <div class="item-icon" :class="'status-' + row.status">
            <Icon :icon="statusIcon(row.status)" width="16" height="16"/>
          </div>
          <div class="item-body">
            <div class="item-name">{{ row.subject || $t('noSubject') }}</div>
            <div class="item-meta">
              <span class="item-sub">{{ (row.receiveEmail || []).join(', ') }}</span>
            </div>
            <div class="item-meta">
              <span class="status-badge" :class="'status-' + row.status">{{ $t('scheduledStatus' + statusKey(row.status)) }}</span>
              <span class="item-sub">{{ $t('scheduledSendAt') }}: {{ formatTime(row.status === 'sent' ? row.sentTime : row.scheduledAt) }}</span>
              <span class="item-sub" v-if="row.attachmentCount">
                <Icon icon="psg:paperclip" width="12" height="12"/> {{ row.attachmentCount }}
              </span>
            </div>
            <div class="item-meta" v-if="row.status === 'failed' && row.lastError">
              <span class="item-sub error-text">{{ $t('scheduledLastError') }}: {{ row.lastError }} ({{ row.attemptCount }} {{ $t('scheduledAttemptCount') }})</span>
            </div>
          </div>
          <div class="item-actions" v-if="row.status === 'pending'">
            <button class="act-btn" :title="$t('scheduledEdit')" :aria-label="$t('scheduledEdit')" @click="edit(row)">
              <Icon icon="psg:edit" width="14" height="14"/>
            </button>
            <button class="act-btn" :title="$t('scheduledSendNow')" :aria-label="$t('scheduledSendNow')" @click="sendNow(row)">
              <Icon icon="psg:send" width="14" height="14"/>
            </button>
            <button class="act-btn danger" :title="$t('cancelSchedule')" :aria-label="$t('cancelSchedule')" @click="cancel(row)">
              <Icon icon="psg:close-circle" width="14" height="14"/>
            </button>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, defineOptions } from 'vue'
import { useI18n } from 'vue-i18n'
import { Icon } from '@iconify/vue'
import { ElMessageBox } from 'element-plus'
import { useUiStore } from '@/store/ui.js'
import dayjs from 'dayjs'
import {
  emailScheduleList, emailScheduleCancel, emailScheduleSendNow, emailScheduleEdit,
} from '@/request/email.js'

defineOptions({ name: 'scheduled' })

const { t } = useI18n()
const uiStore = useUiStore()
const list = ref([])
const pendingCount = computed(() => list.value.filter(row => row.status === 'pending').length)
const issueCount = computed(() => list.value.filter(row => ['failed', 'processing'].includes(row.status)).length)

onMounted(load)

function load() {
  emailScheduleList().then(data => { list.value = data || [] }).catch(() => {})
}

function formatTime(v) {
  return v ? dayjs(v).format('YYYY-MM-DD HH:mm') : ''
}

function statusKey(status) {
  return { pending: 'Pending', processing: 'Processing', sent: 'Sent', failed: 'Failed', cancelled: 'Cancelled' }[status] || 'Pending'
}

function statusIcon(status) {
  return {
    pending: 'psg:clock',
    processing: 'psg:refresh',
    sent: 'psg:check-circle',
    failed: 'psg:warning',
    cancelled: 'psg:close-circle',
  }[status] || 'psg:clock'
}

function cancel(row) {
  ElMessageBox.confirm(t('scheduledCancelConfirm'), { confirmButtonText: t('confirm'), cancelButtonText: t('cancel'), type: 'warning' })
    .then(() => emailScheduleCancel(row.id))
    .then(() => {
      ElMessage({ message: t('scheduledCancelSuccess'), type: 'success', plain: true })
      load()
    })
    .catch((e) => {
      if (e === 'cancel') return
      ElMessage({ message: t('scheduledCancelFail'), type: 'error', plain: true })
      load()
    })
}

function sendNow(row) {
  ElMessageBox.confirm(t('scheduledSendNowConfirm'), { confirmButtonText: t('confirm'), cancelButtonText: t('cancel'), type: 'warning' })
    .then(() => emailScheduleSendNow(row.id))
    .then(() => {
      ElMessage({ message: t('scheduledSendNowSuccess'), type: 'success', plain: true })
      load()
    })
    .catch((e) => {
      if (e === 'cancel') return
      ElMessage({ message: e?.message || t('scheduledSendNowFail'), type: 'error', plain: true })
      load()
    })
}

async function edit(row) {
  try {
    const payload = await emailScheduleEdit(row.id)
    uiStore.writerRef?.openScheduled?.(payload)
    load()
  } catch (e) {
    ElMessage({ message: t('scheduledEditFail'), type: 'error', plain: true })
    load()
  }
}
</script>

<style lang="scss" scoped>
.item-list { overflow: hidden; }
.item-row {
  display: flex; align-items: flex-start; gap: 12px; padding: 16px 20px;
  border-bottom: 1px solid var(--psg-border); transition: background 0.12s ease;
  &:last-child { border-bottom: none; }
  @media (hover: hover) { .item-actions { opacity: 0; } &:hover { background: var(--psg-surface-muted); .item-actions { opacity: 1; } } }
}
.item-icon {
  width: 32px; height: 32px; border-radius: var(--psg-radius-sm); flex-shrink: 0;
  display: flex; align-items: center; justify-content: center; margin-top: 2px;
  background: var(--psg-surface-muted); border: 1px solid var(--psg-border); color: var(--psg-text-secondary);
  &.status-sent { background: var(--psg-surface-active); border-color: var(--psg-border-strong); color: var(--psg-text); }
  &.status-failed { background: var(--psg-danger-muted); border-color: var(--psg-danger); color: var(--psg-danger); }
  &.status-cancelled { background: var(--psg-surface-muted); border-color: var(--psg-border); color: var(--psg-text-secondary); }
}
.item-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.item-name { font-size: 13.5px; font-weight: 700; color: var(--psg-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.item-meta { display: flex; align-items: center; gap: 8px; min-width: 0; flex-wrap: wrap; }
.item-sub { font-size: 12px; color: var(--psg-text-secondary); display: inline-flex; align-items: center; gap: 3px; }
.error-text { color: var(--psg-danger); }

.status-badge {
  font-size: 10.5px; font-weight: 700; padding: 1px 7px; white-space: nowrap;
  color: var(--psg-text-secondary); background: var(--psg-surface-muted); border: 1px solid var(--psg-border);
  &.status-sent { color: var(--psg-text); background: var(--psg-surface-active); border-color: var(--psg-border-strong); }
  &.status-failed { color: var(--psg-danger); background: var(--psg-danger-muted); border-color: var(--psg-danger); }
  &.status-processing { color: var(--psg-primary); background: var(--psg-surface-muted); border-color: var(--psg-surface-active); }
}

.item-actions { display: flex; gap: 2px; flex-shrink: 0; transition: opacity 0.14s; }
.act-btn {
  display: flex; align-items: center; justify-content: center; width: 28px; height: 28px;
  border: none; background: transparent; border-radius: var(--psg-radius-sm); cursor: pointer;
  color: var(--psg-text-secondary); transition: background 0.10s, color 0.10s;
  &:hover { background: var(--psg-surface-muted); color: var(--psg-text); }
  &.danger:hover { background: var(--psg-danger-muted); color: var(--psg-danger); }
}
</style>
