<template>
  <section class="admin-forwarding">
    <div class="af-head">
      <div><h3>个人转发策略</h3><p>控制用户能否把新邮件通知或完整副本发送到外部邮箱。</p></div>
      <el-button type="primary" :loading="saving" @click="savePolicy">保存策略</el-button>
    </div>
    <div class="af-card psg-well">
      <div class="af-row"><span>允许个人转发</span><el-switch v-model="form.allowPersonalForward" :active-value="1" :inactive-value="0" /></div>
      <div class="af-row"><span>允许新邮件通知</span><el-switch v-model="form.allowForwardNotification" :active-value="1" :inactive-value="0" /></div>
      <div class="af-row"><span>允许完整副本</span><el-switch v-model="form.allowForwardFullCopy" :active-value="1" :inactive-value="0" /></div>
      <div class="af-row"><span>允许附件转发</span><el-switch v-model="form.allowForwardAttachments" :active-value="1" :inactive-value="0" /></div>
      <label class="af-row"><span>最多转发地址</span><el-input-number v-model="form.forwardMaxAddresses" :min="1" :max="20" /></label>
      <label class="af-row af-row-field"><span>允许目标域名</span><el-input v-model="form.forwardAllowedDomains" placeholder="留空表示允许所有外部域名，多个域名用逗号分隔" /></label>
      <label class="af-row af-row-field"><span>PSG Mail 公共地址</span><el-input v-model="form.publicAppUrl" placeholder="https://mail.example.com" /></label>
    </div>

    <div class="af-head">
      <div><h3>个人转发审计</h3><p>用户已添加的外部转发地址。</p></div>
      <el-button @click="loadAudit">刷新</el-button>
    </div>
    <div class="af-card psg-well">
      <div v-if="!audit.length" class="af-empty">暂无个人转发记录</div>
      <div v-for="row in audit" :key="row.id" class="af-audit-row">
        <div class="audit-primary"><strong>{{ row.userEmail }}</strong><span>{{ row.accountEmail }}</span></div>
        <div class="audit-target"><span>{{ row.maskedEmail }}</span><small>{{ row.mode === 'full_copy' ? '完整副本' : '通知模式' }}</small></div>
        <div class="audit-status">
          <span class="af-badge" :class="row.status === 'enabled' ? 'is-enabled' : ''">{{ statusText(row.status) }}</span>
          <small>{{ row.verifiedAt ? '已验证' : '未验证' }}</small>
        </div>
        <el-button v-if="row.status !== 'blocked'" size="small" type="danger" plain @click="disable(row)">停用</el-button>
        <span v-else></span>
      </div>
    </div>
  </section>
</template>
<script setup>
import { onMounted, reactive, watch, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { settingSet } from '@/request/setting.js'
import { forwardingAdminQuery, forwardingAdminSetStatus } from '@/request/forwarding.js'
const props = defineProps({ setting: { type: Object, required: true } })
const emit = defineEmits(['saved'])
const saving = ref(false); const audit = ref([])
const form = reactive({ allowPersonalForward: 1, allowForwardNotification: 1, allowForwardFullCopy: 0, allowForwardAttachments: 0, forwardMaxAddresses: 3, forwardAllowedDomains: '', publicAppUrl: '' })
function syncForm(value) { Object.keys(form).forEach(key => { if (value?.[key] !== undefined) form[key] = value[key] }) }
function statusText(status) { return { pending: '待验证', verified: '已验证', enabled: '已启用', disabled: '已停用', blocked: '管理员已停用' }[status] || status }
async function savePolicy() { saving.value = true; try { await settingSet({ ...form }); emit('saved'); ElMessage({ message: '个人转发策略已保存', type: 'success', plain: true }) } finally { saving.value = false } }
async function loadAudit() { audit.value = await forwardingAdminQuery() || [] }
function disable(row) { ElMessageBox.confirm('停用后该用户必须重新完成验证才能启用，是否继续？', '停用个人转发', { type: 'warning', confirmButtonText: '停用', cancelButtonText: '取消' }).then(async () => { await forwardingAdminSetStatus(row.id, false); row.status = 'blocked' }).catch(() => {}) }
watch(() => props.setting, syncForm, { immediate: true, deep: true })
onMounted(() => { loadAudit().catch(() => {}) })
</script>
<style scoped lang="scss">
/* Same look as the system-setting groups above it: a heading, then a grey
   card of rows (label left, control right) with thin separators. */
.admin-forwarding { display: flex; flex-direction: column; margin-top: 28px; }

.af-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  margin: 0 0 12px;
  &:not(:first-child) { margin-top: 28px; }
  h3 { margin: 0 0 3px; color: var(--psg-text); font-size: 16px; font-weight: 700; }
  p { margin: 0; color: var(--psg-text-secondary); font-size: 13px; }
}

.af-card {
  overflow: hidden;
  border-radius: var(--psg-radius-lg);
  background: var(--psg-surface-muted);
}

.af-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  min-height: 64px;
  padding: 12px 22px;
  border-bottom: 1px solid color-mix(in srgb, var(--psg-border) 80%, var(--psg-surface));
  color: var(--psg-text);
  font-size: 14px;
  font-weight: 600;
  &:last-child { border-bottom: 0; }
  > span { flex-shrink: 0; }
}
.af-row-field :deep(.el-input) { flex: 1; max-width: 420px; min-width: 0; }

.af-empty { padding: 28px 22px; color: var(--psg-text-secondary); text-align: center; font-size: 13px; }

.af-audit-row {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr) minmax(90px, auto) auto;
  gap: 16px;
  align-items: center;
  padding: 14px 22px;
  border-bottom: 1px solid color-mix(in srgb, var(--psg-border) 80%, var(--psg-surface));
  font-size: 12px;
  &:last-child { border-bottom: 0; }
}
.audit-primary, .audit-target, .audit-status { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.audit-status { align-items: flex-start; }
.audit-primary strong { font-size: 14px; font-weight: 600; }
.audit-primary strong, .audit-target span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--psg-text); }
.audit-primary span, .audit-target small, .audit-status small { color: var(--psg-text-secondary); }
.af-badge {
  padding: 1px 8px;
  border-radius: var(--psg-radius-full);
  background: var(--psg-surface-active);
  color: var(--psg-text-secondary);
  font-size: 11px;
  font-weight: 600;
  line-height: 18px;
  &.is-enabled { background: color-mix(in srgb, var(--psg-primary) 16%, transparent); color: var(--psg-primary); }
}

@media (max-width: 640px) {
  .af-head { align-items: flex-start; flex-direction: column; }
  .af-row { padding: 12px 16px; }
  .af-row-field { flex-direction: column; align-items: stretch; gap: 8px; :deep(.el-input) { max-width: none; } }
  .af-audit-row { grid-template-columns: minmax(0, 1fr) auto; gap: 8px; padding: 14px 16px; }
  .audit-target, .audit-status { grid-column: 1; }
  .af-audit-row > :last-child { grid-column: 2; grid-row: 1 / span 3; }
}
</style>
