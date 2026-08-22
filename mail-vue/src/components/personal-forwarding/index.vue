<template>
  <section class="personal-forwarding">
    <div class="forwarding-policy-note">
      <Icon icon="psg:shield" width="16" height="16" aria-hidden="true" />
      <span>{{ $t('personalForwardingRetainNote') }}</span>
    </div>

    <div v-if="!policy.allowPersonalForward" class="forwarding-blocked">
      {{ $t('personalForwardingAdminDisabled') }}
    </div>

    <div v-else>
      <div v-if="policy.allowForwardNotification && !policy.publicAppUrlConfigured" class="forwarding-blocked">
        {{ $t('personalForwardingPublicUrlMissing') }}
      </div>
      <div class="forwarding-add-row">
        <el-input v-model="targetEmail" :placeholder="$t('personalForwardingTargetPlaceholder')"
                  clearable @keyup.enter="addTarget" />
        <el-button type="primary" :loading="loading" @click="addTarget">
          {{ $t('personalForwardingAdd') }}
        </el-button>
      </div>
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
.personal-forwarding { padding: 18px 20px 24px; display: flex; flex-direction: column; gap: 14px; }
.forwarding-policy-note, .forwarding-blocked { display: flex; align-items: flex-start; gap: 9px; padding: 11px 12px; border: 1px solid var(--psg-border); border-radius: var(--psg-radius-xs); background: var(--psg-surface-muted); color: var(--psg-text-secondary); font-size: 12.5px; line-height: 1.5; }
.forwarding-policy-note { color: var(--psg-primary); }
.forwarding-blocked { color: var(--psg-danger); }
.forwarding-add-row { display: flex; gap: 9px; align-items: center; }
.forwarding-add-row :deep(.el-input) { flex: 1; min-width: 0; }
.forwarding-item { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12px 18px; padding: 14px 0; border-top: 1px solid var(--psg-border); }
.forwarding-address-row { display: flex; align-items: center; gap: 9px; flex-wrap: wrap; }
.forwarding-address { color: var(--psg-text); font-size: 14px; font-weight: 700; word-break: break-all; }
.forwarding-status { padding: 3px 7px; border-radius: var(--psg-radius-xs); font-size: 11px; font-weight: 700; }
.status-pending { background: var(--psg-warning-muted); color: var(--psg-warning); }
.status-verified, .status-enabled { background: var(--psg-primary-muted); color: var(--psg-primary); }
.status-disabled, .status-blocked { background: var(--psg-surface-muted); color: var(--psg-text-muted); }
.forwarding-item-hint { margin-top: 5px; color: var(--psg-text-secondary); font-size: 12px; line-height: 1.45; }
.forwarding-item-controls { display: flex; align-items: center; justify-content: flex-end; gap: 7px; flex-wrap: wrap; }
.forwarding-mode { width: 150px; }
.forwarding-verify-row { grid-column: 1 / -1; display: flex; gap: 8px; max-width: 420px; }
.forwarding-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; min-height: 150px; color: var(--psg-text-muted); font-size: 13px; }
@media (max-width: 640px) { .personal-forwarding { padding: 14px; } .forwarding-add-row, .forwarding-verify-row { align-items: stretch; flex-direction: column; max-width: none; } .forwarding-item { grid-template-columns: 1fr; gap: 10px; } .forwarding-item-controls { justify-content: flex-start; } .forwarding-mode { width: min(100%, 220px); } }
</style>
