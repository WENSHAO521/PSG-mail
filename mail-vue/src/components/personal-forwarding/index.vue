<template>
  <section class="personal-forwarding">
    <div class="forwarding-notice" role="note">
      <Icon icon="psg:shield" width="17" height="17" class="forwarding-notice-icon" aria-hidden="true" />
      <span>{{ $t('personalForwardingRetainNote') }}</span>
    </div>

    <div v-if="!policy.allowPersonalForward" class="forwarding-notice is-warning" role="note">
      <Icon icon="psg:warning" width="17" height="17" class="forwarding-notice-icon" aria-hidden="true" />
      <span>{{ $t('personalForwardingAdminDisabled') }}</span>
    </div>
    <div v-else-if="policy.allowForwardNotification && !policy.publicAppUrlConfigured" class="forwarding-notice is-warning" role="note">
      <Icon icon="psg:warning" width="17" height="17" class="forwarding-notice-icon" aria-hidden="true" />
      <span>{{ $t('personalForwardingPublicUrlMissing') }}</span>
    </div>

    <div class="forwarding-card psg-well">
      <div v-if="policy.allowPersonalForward" class="forwarding-add-row">
        <el-input v-model="targetEmail" :placeholder="$t('personalForwardingTargetPlaceholder')"
                  clearable @keyup.enter="addTarget" />
        <el-button type="primary" :loading="loading" @click="addTarget">
          {{ $t('personalForwardingAdd') }}
        </el-button>
      </div>

      <div v-if="!items.length" class="forwarding-empty">
        <Icon icon="psg:forward" width="24" height="24" />
        <span>{{ $t('personalForwardingEmpty') }}</span>
      </div>

      <article v-for="item in items" :key="item.id" class="forwarding-item">
        <div class="forwarding-item-main">
          <div class="forwarding-address-row">
            <span class="forwarding-address">{{ item.maskedEmail || item.targetEmail }}</span>
            <span class="forwarding-status" :class="`status-${item.status}`">{{ statusText(item.status) }}</span>
          </div>
          <div class="forwarding-item-hint">
            <template v-if="item.status === 'pending'">{{ $t('personalForwardingPendingHint') }}</template>
            <template v-else-if="item.status === 'verified'">{{ $t('personalForwardingVerifiedHint') }}</template>
            <template v-else-if="item.status === 'enabled'">{{ $t('personalForwardingEnabledHint') }}</template>
            <template v-else-if="item.status === 'blocked'">{{ $t('personalForwardingBlockedHint') }}</template>
            <template v-else>{{ item.lastError || $t('personalForwardingDisabledHint') }}</template>
          </div>
        </div>

        <div class="forwarding-item-controls">
          <el-select v-if="item.status === 'verified' || item.status === 'enabled'"
                     v-model="item.mode" size="small" class="forwarding-mode"
                     @change="saveItem(item)">
            <el-option v-if="policy.allowForwardNotification" value="notification" :label="$t('personalForwardingNotificationMode')" />
            <el-option v-if="policy.allowForwardFullCopy" value="full_copy" :label="$t('personalForwardingFullCopyMode')" />
          </el-select>
          <el-switch v-if="item.mode === 'full_copy' && (item.status === 'verified' || item.status === 'enabled') && policy.allowForwardAttachments"
                     v-model="item.includeAttachments" :active-text="$t('personalForwardingAttachments')"
                     @change="saveItem(item)" />
          <el-button v-if="item.status === 'verified'" size="small" type="primary" @click="toggleItem(item, true)">
            {{ $t('enable') }}
          </el-button>
          <el-button v-else-if="item.status === 'enabled'" size="small" @click="toggleItem(item, false)">
            {{ $t('disable') }}
          </el-button>
          <el-button v-else-if="item.status === 'disabled'" size="small" type="primary" @click="toggleItem(item, true)">
            {{ $t('enable') }}
          </el-button>
          <el-button v-if="item.status === 'pending'" size="small" @click="resend(item)">
            {{ $t('personalForwardingResend') }}
          </el-button>
          <el-button size="small" type="danger" plain @click="removeItem(item)">
            {{ $t('delete') }}
          </el-button>
        </div>

        <div v-if="item.status === 'pending'" class="forwarding-verify-row">
          <el-input v-model="verificationCodes[item.id]" maxlength="6" inputmode="numeric"
                    :placeholder="$t('personalForwardingCodePlaceholder')" @keyup.enter="verify(item)" />
          <el-button type="primary" :loading="verifyingId === item.id" @click="verify(item)">
            {{ $t('personalForwardingVerify') }}
          </el-button>
        </div>
      </article>
    </div>
  </section>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Icon } from '@iconify/vue'
import { forwardingAdd, forwardingQuery, forwardingRemove, forwardingResend, forwardingUpdate, forwardingVerify } from '@/request/forwarding.js'

const items = ref([])
const policy = reactive({ allowPersonalForward: false, allowForwardNotification: false, allowForwardFullCopy: false, allowForwardAttachments: false, forwardMaxAddresses: 3, publicAppUrlConfigured: false })
const targetEmail = ref('')
const loading = ref(false)
const verifyingId = ref(null)
const verificationCodes = reactive({})

function statusText(status) {
  return { pending: '待验证', verified: '已验证', enabled: '已启用', disabled: '已停用', blocked: '管理员已停用' }[status] || status
}
async function load() {
  const data = await forwardingQuery()
  Object.assign(policy, data?.policy || {})
  items.value = data?.items || []
}
async function addTarget() {
  const value = targetEmail.value.trim()
  if (!value) return
  loading.value = true
  try {
    const row = await forwardingAdd(value)
    targetEmail.value = ''
    await load()
    if (row?.id) verificationCodes[row.id] = ''
    ElMessage({ message: '验证码已发送，请检查目标邮箱', type: 'success', plain: true })
  } finally { loading.value = false }
}
async function resend(item) { await forwardingResend(item.id); await load(); ElMessage({ message: '验证码已重新发送', type: 'success', plain: true }) }
async function verify(item) {
  const code = String(verificationCodes[item.id] || '').trim()
  if (!/^\d{6}$/.test(code)) { ElMessage({ message: '请输入 6 位验证码', type: 'warning', plain: true }); return }
  verifyingId.value = item.id
  try { await forwardingVerify(item.id, code); delete verificationCodes[item.id]; await load(); ElMessage({ message: '邮箱验证成功，请启用转发', type: 'success', plain: true }) }
  finally { verifyingId.value = null }
}
async function toggleItem(item, enabled) { await forwardingUpdate(item.id, { enabled, mode: item.mode, includeAttachments: item.includeAttachments }); await load() }
async function saveItem(item) {
  const payload = { mode: item.mode, includeAttachments: item.includeAttachments }
  // Changing the mode of a verified rule must not silently disable it. The
  // API treats an omitted `enabled` field as a configuration-only update.
  if (item.status === 'enabled') payload.enabled = true
  await forwardingUpdate(item.id, payload)
  await load()
}
function removeItem(item) {
  ElMessageBox.confirm('删除后需要重新验证该转发地址，是否继续？', '删除转发地址', { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' })
    .then(async () => { await forwardingRemove(item.id); await load() }).catch(() => {})
}
onMounted(() => { load().catch(() => {}) })
</script>

<style scoped lang="scss">
/* Same layout as the other settings sections (邮箱管理 / 标签管理):
   a rounded notice, then one grey card with an add row and separated rows. */
.personal-forwarding { display: flex; flex-direction: column; gap: 16px; }

.forwarding-notice {
  /* Info: same as the global .workspace-note (rules / scheduled pages).
     Warning: warning-tinted, like the other warning notices. */
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 14px 16px;
  border-radius: var(--psg-radius-lg);
  background: var(--psg-surface-muted);
  color: var(--psg-text-secondary);
  font-size: 13px;
  line-height: 1.55;
  &.is-warning {
    background: color-mix(in srgb, var(--psg-warning) 12%, var(--psg-surface));
    color: var(--psg-text);
  }
}
.forwarding-notice-icon { flex-shrink: 0; margin-top: 1px; color: var(--psg-primary); }
.is-warning .forwarding-notice-icon { color: var(--psg-warning); }

.forwarding-card {
  overflow: hidden;
  border-radius: var(--psg-radius-lg);
  background: var(--psg-surface-muted);
}

.forwarding-add-row {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 16px 16px 16px 22px;
  border-bottom: 1px solid var(--psg-border);
  :deep(.el-input) { flex: 1; min-width: 0; }
}

.forwarding-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px 18px;
  padding: 16px 16px 16px 22px;
  border-bottom: 1px solid var(--psg-border);
  &:last-child { border-bottom: 0; }
}
.forwarding-address-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; min-width: 0; }
.forwarding-address { color: var(--psg-text); font-size: 14px; font-weight: 600; word-break: break-all; }
.forwarding-status {
  flex-shrink: 0;
  padding: 1px 8px;
  border-radius: var(--psg-radius-full);
  font-size: 11px;
  font-weight: 600;
  line-height: 18px;
}
.status-pending { background: color-mix(in srgb, var(--psg-warning) 16%, transparent); color: var(--psg-warning); }
.status-verified, .status-enabled { background: color-mix(in srgb, var(--psg-primary) 16%, transparent); color: var(--psg-primary); }
.status-disabled, .status-blocked { background: var(--psg-surface-active); color: var(--psg-text-secondary); }
.forwarding-item-hint { margin-top: 3px; color: var(--psg-text-secondary); font-size: 12px; line-height: 1.45; }
.forwarding-item-controls { display: flex; align-items: center; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
.forwarding-mode { width: 150px; }
.forwarding-verify-row { grid-column: 1 / -1; display: flex; gap: 8px; max-width: 420px; }
.forwarding-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 140px;
  color: var(--psg-text-secondary);
  font-size: 13px;
}

@media (max-width: 640px) {
  .forwarding-add-row, .forwarding-item { padding: 14px 16px; }
  .forwarding-add-row, .forwarding-verify-row { align-items: stretch; flex-direction: column; max-width: none; }
  .forwarding-item { grid-template-columns: minmax(0, 1fr); gap: 10px; }
  .forwarding-item-controls { justify-content: flex-start; }
  .forwarding-mode { width: min(100%, 220px); }
}
</style>
