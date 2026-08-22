<template>
  <section class="admin-forwarding">
    <div class="admin-forwarding-heading">
      <div><h3>个人转发策略</h3><p>控制用户能否把新邮件通知或完整副本发送到外部邮箱。</p></div>
      <el-button size="small" type="primary" :loading="saving" @click="savePolicy">保存策略</el-button>
    </div>
    <div class="admin-policy-grid">
      <div class="admin-policy-row"><span>允许个人转发</span><el-switch v-model="form.allowPersonalForward" :active-value="1" :inactive-value="0" /></div>
      <div class="admin-policy-row"><span>允许新邮件通知</span><el-switch v-model="form.allowForwardNotification" :active-value="1" :inactive-value="0" /></div>
      <div class="admin-policy-row"><span>允许完整副本</span><el-switch v-model="form.allowForwardFullCopy" :active-value="1" :inactive-value="0" /></div>
      <div class="admin-policy-row"><span>允许附件转发</span><el-switch v-model="form.allowForwardAttachments" :active-value="1" :inactive-value="0" /></div>
      <label class="admin-policy-field"><span>最多转发地址</span><el-input-number v-model="form.forwardMaxAddresses" :min="1" :max="20" size="small" /></label>
      <label class="admin-policy-field admin-policy-wide"><span>允许目标域名</span><el-input v-model="form.forwardAllowedDomains" placeholder="留空表示允许所有外部域名，多个域名用逗号分隔" /></label>
      <label class="admin-policy-field admin-policy-wide"><span>PSG Mail 公共地址</span><el-input v-model="form.publicAppUrl" placeholder="https://mail.example.com" /></label>
    </div>
    <div class="admin-forwarding-audit-head"><h3>个人转发审计</h3><el-button size="small" @click="loadAudit">刷新</el-button></div>
    <div v-if="!audit.length" class="admin-forwarding-empty">暂无个人转发记录</div>
    <div v-for="row in audit" :key="row.id" class="admin-forwarding-audit-row">
      <div class="audit-primary"><strong>{{ row.userEmail }}</strong><span>{{ row.accountEmail }}</span></div>
      <div class="audit-target"><span>{{ row.maskedEmail }}</span><small>{{ row.mode === 'full_copy' ? '完整副本' : '通知模式' }}</small></div>
      <div class="audit-status"><span>{{ row.verifiedAt ? '已验证' : '未验证' }}</span><span :class="row.status === 'enabled' ? 'is-enabled' : ''">{{ statusText(row.status) }}</span></div>
      <el-button v-if="row.status !== 'blocked'" size="small" type="danger" plain @click="disable(row)">停用</el-button>
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
.admin-forwarding { border-top: 1px solid var(--psg-border); padding: 18px 20px 22px; }
.admin-forwarding-heading, .admin-forwarding-audit-head { display:flex; align-items:center; justify-content:space-between; gap:12px; }
h3 { margin:0 0 4px; color:var(--psg-text); font-size:14px; } p { margin:0; color:var(--psg-text-secondary); font-size:12px; }
.admin-policy-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px 18px; margin:16px 0 22px; }
.admin-policy-row, .admin-policy-field { min-height:42px; display:flex; align-items:center; justify-content:space-between; gap:10px; color:var(--psg-text); font-size:12.5px; }
.admin-policy-field span { flex:0 0 auto; } .admin-policy-field :deep(.el-input), .admin-policy-wide :deep(.el-input) { min-width:0; flex:1; } .admin-policy-wide { grid-column:1 / -1; }
.admin-forwarding-audit-head { padding-top:14px; border-top:1px solid var(--psg-border); } .admin-forwarding-audit-head h3 { margin:0; }
.admin-forwarding-empty { padding:22px 0; color:var(--psg-text-muted); text-align:center; font-size:12px; }
.admin-forwarding-audit-row { display:grid; grid-template-columns:minmax(0,1.2fr) minmax(0,1fr) minmax(110px,auto) auto; gap:12px; align-items:center; padding:10px 0; border-bottom:1px solid var(--psg-border); font-size:12px; }
.audit-primary, .audit-target, .audit-status { min-width:0; display:flex; flex-direction:column; gap:3px; } .audit-primary strong, .audit-target span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--psg-text); } .audit-primary span, .audit-target small, .audit-status span { color:var(--psg-text-secondary); } .audit-status .is-enabled { color:var(--psg-primary); font-weight:700; }
@media (max-width:640px) { .admin-forwarding { padding:16px 14px; } .admin-policy-grid { grid-template-columns:1fr; } .admin-policy-wide { grid-column:auto; } .admin-forwarding-audit-row { grid-template-columns:1fr auto; gap:8px; } .audit-target, .audit-status { grid-column:1; } .admin-forwarding-audit-row > .el-button { grid-column:2; grid-row:1 / span 3; } }
</style>
