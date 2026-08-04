<template>
  <!-- Empty state: no email selected — matches vfasky's empty detail panel -->
  <div v-if="!email" class="detail-empty surface-card">
    <Icon icon="solar:letter-unread-linear" width="40" height="40" class="empty-icon"/>
    <span class="empty-text">{{ $t('selectEmailHint') }}</span>
  </div>

  <!-- Email view: surface-card floating card -->
  <article v-else class="surface-card email-detail">

    <!-- Header: min-h-16, circular icon-buttons -->
    <header class="detail-header">
      <div class="header-left">
        <!-- Back button: always visible; clears selection on desktop, triggers mobile nav -->
        <button class="icon-btn detail-back-btn" @click="handleBack">
          <Icon icon="solar:alt-arrow-left-linear" width="20" height="20" />
        </button>
        <button v-perm="'email:delete'" class="icon-btn icon-danger" @click="handleDelete">
          <Icon icon="solar:trash-bin-trash-linear" width="19" height="19" />
        </button>
        <button class="icon-btn" @click="changeStar" v-if="emailStore.contentData.showStar">
          <Icon :icon="email.isStar ? 'fluent-color:star-16' : 'solar:star-line-duotone'"
                :width="email.isStar ? 20 : 18" :height="email.isStar ? 20 : 18" />
        </button>
        <template v-if="emailStore.contentData.showReply">
          <button class="icon-btn" v-perm="'email:send'" @click="openReply">
            <Icon icon="solar:reply-linear" width="21" height="21" />
          </button>
          <button class="icon-btn" v-perm="'email:send'" @click="openReplyAll">
            <Icon icon="solar:reply-all-linear" width="22" height="22" />
          </button>
          <button class="icon-btn" v-perm="'email:send'" @click="openForward">
            <Icon icon="solar:arrow-right-up-linear" width="20" height="20" />
          </button>
        </template>
      </div>
      <div class="header-right">
        <el-tooltip :content="$t('markAsUnread')" placement="bottom"
                    v-if="emailStore.contentData.showUnread">
          <button class="icon-btn" @click="handleMarkAsUnread">
            <Icon icon="solar:letter-linear" width="19" height="19" />
          </button>
        </el-tooltip>
        <el-tooltip :content="$t('printEmail')" placement="bottom">
          <button class="icon-btn" @click="handlePrint">
            <Icon icon="solar:printer-linear" width="19" height="19" />
          </button>
        </el-tooltip>
        <el-tooltip :content="$t('downloadEml')" placement="bottom">
          <button class="icon-btn" @click="handleDownloadEml">
            <Icon icon="solar:download-linear" width="19" height="19" />
          </button>
        </el-tooltip>
        <el-tooltip :content="translateBtnLabel" placement="bottom">
          <button class="icon-btn" :class="{ 'icon-btn--active': showTranslation }"
                  @click="handleTranslate" :disabled="translating">
            <Icon v-if="translating" icon="svg-spinners:3-dots-fade" width="20" height="20" />
            <Icon v-else icon="solar:global-linear" width="19" height="19" />
          </button>
        </el-tooltip>
        <span class="page-counter" v-if="emailStore.contentData.emailTotal > 0">
          {{ emailStore.contentData.emailIndex }}&thinsp;/&thinsp;{{ emailStore.contentData.emailTotal }}
        </span>
      </div>
    </header>

    <!-- Scrollable content -->
    <el-scrollbar class="detail-scroll">
      <div class="detail-content">

        <h1 class="email-title">{{ email.subject || $t('noSubject') }}</h1>

        <!-- Meta card: sender + fields + date all in one bordered block -->
        <div class="meta-card">
          <div class="meta-avatar" :style="{ background: metaAvatarBg }">
            <span class="meta-initial">{{ (email.name || email.sendEmail || '?')[0].toUpperCase() }}</span>
            <img v-if="metaAvatarImg" :src="metaAvatarImg" class="meta-avatar-img"
                 @error="e => { e.target.style.display='none'; markGravatarMiss(email.sendEmail) }" />
          </div>
          <div class="meta-body">
            <div class="meta-sender-row">
              <span class="meta-sender-name">{{ email.name || email.sendEmail }}</span>
              <span class="meta-date">{{ formatDetailDate(email.createTime) }}</span>
            </div>
            <div class="meta-sender-email" v-if="email.name">{{ email.sendEmail }}</div>
            <div class="meta-fields">
              <div class="meta-field" v-if="formateReceive(email.recipient)">
                <span class="meta-field-label">{{ $t('recipient') }}</span>
                <span class="meta-field-value">{{ formateReceive(email.recipient) }}</span>
              </div>
              <div class="meta-field" v-if="parsedCc.length > 0">
                <span class="meta-field-label">{{ $t('cc') }}</span>
                <span class="meta-field-value">{{ parsedCc.join(', ') }}</span>
              </div>
              <div class="meta-field" v-if="parsedBcc.length > 0">
                <span class="meta-field-label">{{ $t('bcc') }}</span>
                <span class="meta-field-value">{{ parsedBcc.join(', ') }}</span>
              </div>
            </div>
            <el-alert v-if="email.status === 3" :closable="false" :title="toMessage(email.message)"
                      class="email-status-alert" type="error" show-icon />
            <el-alert v-if="email.status === 4" :closable="false" :title="$t('complained')"
                      class="email-status-alert" type="warning" show-icon />
            <el-alert v-if="email.status === 5" :closable="false" :title="$t('delayed')"
                      class="email-status-alert" type="warning" show-icon />
          </div>
        </div>

        <div class="body-divider"></div>

        <div class="email-body">
          <ShadowHtml class="shadow-html" :html="formatImage(email.content)" v-if="email.content" />
          <pre v-else class="email-text">{{ email.text }}</pre>
        </div>

        <div v-if="showTranslation" class="translate-panel">
          <div class="translate-panel-header">
            <span class="translate-panel-title">
              <Icon icon="solar:global-linear" width="15" height="15" />
              {{ $t('translatedResult') }}
              <span class="translate-lang-tag">{{ translateTargetLang === 'zh' ? $t('translateToZh') : $t('translateToEn') }}</span>
            </span>
            <div class="translate-panel-actions">
              <button class="translate-switch-btn" @click="switchTranslateLang">
                {{ translateTargetLang === 'zh' ? $t('translateToEn') : $t('translateToZh') }}
              </button>
              <button class="icon-btn-sm" @click="showTranslation = false">
                <Icon icon="solar:close-linear" width="15" height="15" />
              </button>
            </div>
          </div>
          <div v-if="translating" class="translate-loading">
            <Icon icon="svg-spinners:3-dots-fade" width="24" height="24" />
          </div>
          <pre v-else class="translate-body">{{ translatedText }}</pre>
        </div>

        <div class="att-container" v-if="email.attList && email.attList.length > 0">
          <div class="att-header">
            <span class="att-title-text">{{ $t('attachments') }}</span>
            <span class="att-count">{{ $t('attCount', { total: email.attList.length }) }}</span>
          </div>
          <div class="att-list">
            <div class="att-item" v-for="att in email.attList" :key="att.attId" @click="showImage(att.key)">
              <Icon v-bind="getIconByName(att.filename)" class="att-icon-file" />
              <span class="att-name">{{ att.filename }}</span>
              <span class="att-size">{{ formatBytes(att.size) }}</span>
              <div class="att-actions">
                <button v-if="isImage(att.filename)" class="icon-btn-sm" @click.stop="showImage(att.key)">
                  <Icon icon="solar:eye-linear" width="18" height="18" />
                </button>
                <a class="icon-btn-sm" :href="cvtR2Url(att.key)" download @click.stop>
                  <Icon icon="solar:download-linear" width="18" height="18" />
                </a>
              </div>
            </div>
          </div>
        </div>

      </div>
    </el-scrollbar>
  </article>

  <el-image-viewer v-if="showPreview" :url-list="srcList" show-progress @close="showPreview = false" />
</template>

<script setup>
import ShadowHtml from '@/components/shadow-html/index.vue'
import { reactive, ref, watch, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { emailDelete, emailRead, emailUnread } from '@/request/email.js'
import { translateEmail } from '@/request/translate.js'
import { Icon } from '@iconify/vue'
import { useEmailStore } from '@/store/email.js'
import { useAccountStore } from '@/store/account.js'
import { useUiStore } from '@/store/ui.js'
import { useSettingStore } from '@/store/setting.js'
import { formatDetailDate } from '@/utils/day.js'
import { starAdd, starCancel } from '@/request/star.js'
import { getExtName, formatBytes } from '@/utils/file-utils.js'
import { cvtR2Url, toOssDomain } from '@/utils/convert.js'
import { getIconByName } from '@/utils/icon-utils.js'
import { allEmailDelete } from '@/request/all-email.js'
import { useI18n } from 'vue-i18n'
import { EmailUnreadEnum } from '@/enums/email-enum.js'
import { avatarBg, storedAvatar, gravatarCandidate, markGravatarMiss } from '@/utils/avatar.js'
import { useAvatarCacheStore } from '@/store/avatar-cache.js'
import { downloadEml } from '@/utils/download-eml.js'

const emit = defineEmits(['back'])

const uiStore = useUiStore()
const settingStore = useSettingStore()
const accountStore = useAccountStore()
const emailStore = useEmailStore()
const avatarCache = useAvatarCacheStore()
const { t } = useI18n()

// Reactive reference to the currently selected email
const email = computed(() => emailStore.contentData.email)

const metaAvatarImg = computed(() =>
  avatarCache.get(email.value?.sendEmail)
  || storedAvatar(email.value?.sendEmail)
  || gravatarCandidate(email.value?.sendEmail)
)
const metaAvatarBg = computed(() => avatarBg(email.value?.sendEmail || email.value?.name || ''))

const showPreview = ref(false)
const srcList = reactive([])

const translating = ref(false)
const showTranslation = ref(false)
const translatedText = ref('')
const translateTargetLang = ref('zh')

const translateBtnLabel = computed(() =>
  showTranslation.value ? t('showOriginal') : t('translateEmail')
)

function detectLang(text) {
  const cjk = (text.match(/[一-鿿぀-ゟ゠-ヿ]/g) || []).length
  return cjk / Math.max(text.length, 1) > 0.1 ? 'zh' : 'en'
}

async function runTranslate(targetLang) {
  const e = email.value
  if (!e) return
  translating.value = true
  showTranslation.value = true
  translatedText.value = ''
  const sourceLang = detectLang(e.text || e.content || '')
  try {
    const res = await translateEmail({
      html: e.content || undefined,
      text: e.content ? undefined : (e.text || ''),
      source_lang: sourceLang,
      target_lang: targetLang,
    })
    translatedText.value = res.data?.translated_text || ''
  } catch {
    ElMessage({ message: t('translateFailed'), type: 'error', plain: true })
    showTranslation.value = false
  } finally {
    translating.value = false
  }
}

function handleTranslate() {
  if (showTranslation.value) {
    showTranslation.value = false
    return
  }
  const e = email.value
  if (!e) return
  const sourceLang = detectLang(e.text || e.content || '')
  translateTargetLang.value = sourceLang === 'zh' ? 'en' : 'zh'
  runTranslate(translateTargetLang.value)
}

function switchTranslateLang() {
  translateTargetLang.value = translateTargetLang.value === 'zh' ? 'en' : 'zh'
  runTranslate(translateTargetLang.value)
}

const parsedCc  = computed(() => parseAddressList(email.value?.cc))
const parsedBcc = computed(() => parseAddressList(email.value?.bcc))

// Mark as read when email opens; reset translation state on switch
watch(email, (newEmail) => {
  if (newEmail && emailStore.contentData.showUnread && newEmail.unread === EmailUnreadEnum.UNREAD) {
    newEmail.unread = EmailUnreadEnum.READ
    emailRead([newEmail.emailId])
  }
  if (!newEmail) emailStore.contentData.showUnread = false
  showTranslation.value = false
  translatedText.value = ''
}, { immediate: true })

// Clear on account switch
watch(() => accountStore.currentAccountId, () => {
  emailStore.contentData.email = null
})

function handleBack() {
  emailStore.contentData.email = null
  emit('back')
}

function openReply()    { uiStore.writerRef.openReply(email.value) }
function openReplyAll() { uiStore.writerRef.openReplyAll(email.value) }
function openForward()  { uiStore.writerRef.openForward(email.value) }

function toMessage(message) {
  return message ? JSON.parse(message).message : ''
}

function formatImage(content) {
  content = content || ''
  const domain = settingStore.settings.r2Domain
  return content.replace(/{{domain}}/g, toOssDomain(domain) + '/')
}

function showImage(key) {
  if (!isImage(key)) return
  const url = cvtR2Url(key)
  srcList.length = 0
  srcList.push(url)
  showPreview.value = true
}

function isImage(filename) {
  return ['png', 'jpg', 'jpeg', 'bmp', 'gif', 'jfif', 'webp'].includes(getExtName(filename))
}

function formateReceive(recipient) {
  try { return JSON.parse(recipient || '[]').map(item => item.address).join(', ') }
  catch { return '' }
}

function parseAddressList(raw) {
  try {
    const list = JSON.parse(raw || '[]')
    return list.map(item => (typeof item === 'string' ? item : item.address)).filter(Boolean)
  } catch { return [] }
}

function changeStar() {
  const e = email.value
  if (!e) return
  if (e.isStar) {
    e.isStar = 0
    starCancel(e.emailId).then(() => {
      e.isStar = 0
      emailStore.cancelStarEmailId = e.emailId
      setTimeout(() => emailStore.cancelStarEmailId = 0)
      emailStore.starScroll?.deleteEmail([e.emailId])
    }).catch(() => { e.isStar = 1 })
  } else {
    e.isStar = 1
    starAdd(e.emailId).then(() => {
      e.isStar = 1
      emailStore.addStarEmailId = e.emailId
      setTimeout(() => emailStore.addStarEmailId = 0)
      emailStore.starScroll?.addItem(e)
    }).catch(() => { e.isStar = 0 })
  }
}

function handleMarkAsUnread() {
  const e = email.value
  if (!e) return
  e.unread = EmailUnreadEnum.UNREAD
  emailStore.contentData.showUnread = false
  emailUnread([e.emailId]).catch(() => { e.unread = EmailUnreadEnum.READ })
}

function handlePrint() {
  const e = email.value
  if (!e) return
  const win = window.open('', '_blank', 'width=800,height=600')
  const body = e.content
    ? `<div style="font-family:Arial,sans-serif;max-width:760px;margin:0 auto;padding:24px">${e.content}</div>`
    : `<pre style="font-family:Arial,sans-serif;max-width:760px;margin:0 auto;padding:24px;white-space:pre-wrap">${e.text || ''}</pre>`
  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>${e.subject || ''}</title>
    <style>@media print{body{margin:0}}</style></head><body>
    <h2 style="font-size:18px;margin-bottom:8px">${e.subject || '(No subject)'}</h2>
    <p style="color:#666;font-size:13px;margin-bottom:16px">From: ${e.name || ''} &lt;${e.sendEmail || ''}&gt; — ${e.createTime || ''}</p>
    <hr style="border:none;border-top:1px solid #ddd;margin-bottom:16px">
    ${body}
    </body></html>`)
  win.document.close()
  win.focus()
  setTimeout(() => { win.print(); win.close() }, 300)
}

function handleDownloadEml() {
  const e = email.value
  if (!e) return
  downloadEml(e.emailId).catch(() => ElMessage({ message: t('exportEmlFail'), type: 'error', plain: true }))
}

function handleDelete() {
  const e = email.value
  if (!e) return
  ElMessageBox.confirm(t('delEmailConfirm'), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {
    const doDelete = emailStore.contentData.delType === 'logic'
      ? emailDelete([e.emailId])
      : allEmailDelete([e.emailId])
    doDelete.then(() => {
      ElMessage({ message: t('delSuccessMsg'), type: 'success', plain: true })
      emailStore.deleteIds = [e.emailId]
      emailStore.contentData.email = null
    }).catch(() => {
      ElMessage({ message: t('delFailMsg'), type: 'error', plain: true })
    })
  })
}
</script>

<style scoped lang="scss">
/* ── Shared: both empty + email take full height ─────────── */
.detail-empty,
.email-detail {
  width: 100%;
  height: 100%;
}

/* ── Empty state ─────────────────────────────────────────── */
.detail-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  height: calc(100% - 24px);
  margin: 12px;
  border-radius: var(--radius-lg);
  background: var(--surface, #ffffff);
  border: 1px solid var(--light-border-color, #dcdcdc);
  box-shadow: var(--card-shadow);

  @media (max-width: 1024px) {
    height: 100%;
    margin: 0;
    border-radius: 0;
    border: none;
    box-shadow: none;
  }

  .empty-icon { color: var(--muted, #666666); opacity: 0.5; }

  .empty-text {
    font-size: 14px;
    font-family: 'IBM Plex Sans', 'Noto Sans SC', sans-serif;
    letter-spacing: 0;
    text-transform: none;
    color: var(--muted, #666666);
  }
}

/* ── surface-card ────────────────────────────────────────── */
.email-detail {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  height: calc(100% - 24px);
  margin: 12px;
  border-radius: var(--radius-lg);
  background: var(--surface, #ffffff);
  border: 1px solid var(--light-border-color, #dcdcdc);
  box-shadow: var(--card-shadow-hover);

  @media (max-width: 1024px) {
    height: 100%;
    margin: 0;
    border-radius: 0;
    border: none;
    box-shadow: none;
  }
}

/* ── Header ──────────────────────────────────────────────── */
.detail-header {
  min-height: 56px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  border-bottom: 1px solid var(--light-border-color, #dcdcdc);
  flex-shrink: 0;
}

.header-left  { display: flex; align-items: center; gap: 2px; }
.header-right { display: flex; align-items: center; gap: 2px; }

/* Back button: hidden on desktop, visible on mobile/tablet */
.detail-back-btn {
  @media (min-width: 1025px) { display: none; }
}

.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--muted, #666666);
  transition: background 0.12s ease, color 0.12s ease;
  flex-shrink: 0;

  @media (hover: hover) {
    &:hover { background: rgba(0,0,0,0.07); color: var(--el-text-color-primary); }
    &.icon-danger:hover { background: rgba(var(--red-accent-rgb), 0.08); color: var(--red-accent); }
  }
}

.icon-btn-sm {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--muted, #666666);
  text-decoration: none;
  transition: background 0.12s ease, color 0.12s ease;

  @media (hover: hover) {
    &:hover { background: rgba(0,0,0,0.07); color: var(--el-text-color-primary); }
  }
}

.page-counter {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 12px;
  color: var(--muted, #666666);
  white-space: nowrap;
  letter-spacing: 0.02em;
  font-variant-numeric: tabular-nums;
}

/* ── Scroll ──────────────────────────────────────────────── */
.detail-scroll { flex: 1; min-height: 0; }

.detail-content {
  padding: 28px 32px 48px;
  @media (max-width: 1280px) { padding: 24px 24px 40px; }
  @media (max-width: 1024px) { padding: 20px 20px 36px; }
  @media (max-width: 767px)  { padding: 16px 16px 32px; }
  @media (max-width: 420px)  { padding: 16px 14px; }
}

/* ── Subject ─────────────────────────────────────────────── */
.email-title {
  font-size: 22px;
  font-weight: 700;
  line-height: 1.35;
  color: var(--el-text-color-primary);
  margin: 0 0 20px;
  word-break: break-word;
  font-family: 'IBM Plex Sans', 'Noto Sans SC', sans-serif;
  letter-spacing: -0.01em;

  @media (max-width: 768px) {
    font-size: 18px;
    margin-bottom: 14px;
  }
}

/* ── Meta card ────────────────────────────────────────────── */
.meta-card {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 14px 16px;
  border: 1px solid var(--light-border-color, #dcdcdc);
  border-radius: var(--radius-md);
  margin-bottom: 0;
  background: var(--surface-secondary, #f9f9f9);

  @media (max-width: 767px) {
    padding: 12px 14px;
    gap: 10px;
  }
}

.meta-avatar {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
  margin-top: 2px;
  border-radius: var(--radius-full);

  .meta-initial { color: #fff; font-size: 15px; font-weight: 700; line-height: 1; }
  .meta-avatar-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
}

.meta-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.meta-sender-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: nowrap;

  @media (max-width: 540px) {
    flex-wrap: wrap;
    gap: 2px;
  }
}

.meta-sender-name {
  font-size: 14px;
  font-weight: 700;
  color: var(--el-text-color-primary);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  min-width: 0;
  flex-shrink: 1;
}

.meta-date {
  font-family: 'JetBrains Mono', 'IBM Plex Mono', monospace;
  font-size: 11px;
  color: var(--muted, #7e7576);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}

.meta-sender-email {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: var(--muted, #7e7576);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.meta-fields {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid var(--light-border-color, #dcdcdc);
}

.meta-field {
  display: flex;
  align-items: baseline;
  gap: 10px;
  font-size: 12.5px;
  line-height: 1.5;
}

.meta-field-label {
  font-family: 'IBM Plex Sans', 'Noto Sans SC', sans-serif;
  font-size: 11.5px;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: none;
  color: var(--muted, #7e7576);
  flex-shrink: 0;
  min-width: 28px;
}

.meta-field-value {
  color: var(--el-text-color-primary);
  word-break: break-word;
  font-size: 12.5px;
  line-height: 1.5;
}

.email-status-alert {
  margin-top: 10px;
  :deep(.el-alert) { border-radius: var(--radius-sm) !important; }
}

/* ── Divider between meta and body ───────────────────────── */
.body-divider {
  height: 1px;
  background: var(--light-border-color, #dcdcdc);
  margin: 24px 0;

  @media (max-width: 767px) { margin: 16px 0; }
}

/* ── Body ────────────────────────────────────────────────── */
.email-body {
  font-size: 15px;
  line-height: 1.75;
  color: var(--el-text-color-primary);
  word-break: break-word;
}

.shadow-html::after {
  content: ""; position: absolute; inset: 0;
  background: var(--message-block-color); pointer-events: none;
}

.email-text {
  font-family: 'IBM Plex Mono', 'Courier New', monospace;
  white-space: pre-wrap; word-break: break-word;
  margin: 0; font-size: 14px; line-height: 1.8; color: var(--muted, #666666);
}

/* ── Attachments ─────────────────────────────────────────── */
.att-container {
  margin-top: 40px; max-width: min(100%, 560px);
  border: 1px solid var(--light-border-color, #dcdcdc); border-radius: var(--radius-md); padding: 16px;
}
.att-header {
  display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;
}
.att-title-text {
  font-size: 13px; font-weight: 700; color: var(--el-text-color-primary);
  font-family: 'IBM Plex Sans', 'Noto Sans SC', sans-serif; text-transform: none; letter-spacing: 0;
}
.att-count {
  font-size: 12.5px; color: var(--muted, #666666);
  font-family: 'IBM Plex Sans', 'Noto Sans SC', sans-serif;
}
.att-list { display: flex; flex-direction: column; gap: 4px; }

.att-item {
  display: flex; align-items: center; gap: 10px;
  border: 1px solid var(--light-border-color, #dcdcdc);
  border-radius: var(--radius-sm);
  background: var(--surface-secondary, #f3f3f3);
  padding: 8px 12px; cursor: pointer; transition: background 0.12s ease;

  @media (hover: hover) {
    &:hover { background: var(--email-hover-background, #eeeeee); }
  }

  .att-icon-file { flex-shrink: 0; color: var(--muted, #666666); }
  .att-name { flex: 1; min-width: 0; font-size: 13px; font-weight: 500; color: var(--el-text-color-primary); overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .att-size { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--muted, #666666); flex-shrink: 0; white-space: nowrap; }
  .att-actions { display: flex; align-items: center; gap: 2px; flex-shrink: 0; }
}

/* ── Translation panel ─────────────────────────────── */
.translate-panel {
  margin: 16px 0 8px;
  border: 1px solid var(--light-border-color, #dcdcdc);
  border-radius: var(--radius-md);
  overflow: hidden;
  background: var(--surface-secondary, #f3f3f3);
}

.translate-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid var(--light-border-color, #e0e0e0);
}

.translate-panel-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: 'IBM Plex Sans', 'Noto Sans SC', sans-serif;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: none;
  color: var(--muted, #666666);
}

.translate-lang-tag {
  background: var(--red-accent);
  color: var(--on-accent);
  font-size: 10.5px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: var(--radius-full);
  letter-spacing: 0;
}

.translate-panel-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.translate-switch-btn {
  font-family: 'IBM Plex Sans', 'Noto Sans SC', sans-serif;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0;
  text-transform: none;
  color: var(--red-accent);
  border: 1px solid var(--red-accent);
  border-radius: var(--radius-full);
  background: transparent;
  padding: 3px 10px;
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
  &:hover { background: var(--red-accent); color: var(--on-accent); }
}

.translate-loading {
  display: flex;
  justify-content: center;
  padding: 24px;
  color: var(--muted, #999);
}

.translate-body {
  padding: 12px 16px;
  font-family: 'IBM Plex Sans', 'Noto Sans SC', sans-serif;
  font-size: 14px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--el-text-color-primary);
  background: transparent;
  margin: 0;
}

.icon-btn--active {
  color: var(--red-accent) !important;
}

@media (max-width: 768px) {
  .email-detail {
    background: linear-gradient(180deg, #f7f6f3 0%, #efeeeb 100%);
  }

  .detail-header {
    min-height: 64px;
    padding: 8px 10px;
    border-bottom: 1px solid rgba(0,0,0,0.08);
    /* Tinted to match the page's own cream gradient (#f7f6f3) instead of
       literal white, so the translucent header reads as "elevated" rather
       than "a different, whiter material sitting on top of the page." */
    background: rgba(247,246,243,0.92);
    box-shadow: 0 10px 24px rgba(0,0,0,0.06);
    backdrop-filter: blur(18px);
  }

  .header-left,
  .header-right {
    gap: 4px;
  }

  .header-left {
    min-width: 0;
  }

  .header-right {
    overflow-x: auto;
    justify-content: flex-end;
    max-width: calc(100vw - 58px);
  }

  .icon-btn {
    width: 42px;
    height: 42px;
    border-radius: 14px;
    color: var(--regular-text-color);

    &:active {
      background: rgba(var(--red-accent-rgb), 0.10);
      color: var(--red-accent);
    }
  }

  .page-counter {
    display: none;
  }

  .detail-scroll {
    background: transparent;
  }

  .detail-content {
    padding: 18px 14px 34px;
  }

  .email-title {
    font-size: 22px;
    line-height: 1.25;
    margin: 2px 2px 16px;
    letter-spacing: 0;
  }

  .meta-card {
    border: 1px solid rgba(0,0,0,0.08);
    border-left: none;
    border-radius: 22px;
    background: rgba(247,246,243,0.86);
    box-shadow: 0 12px 28px rgba(0,0,0,0.07);
    padding: 14px;
  }

  .meta-avatar {
    width: 44px;
    height: 44px;
  }

  .meta-sender-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
  }

  .meta-sender-name {
    font-size: 15px;
  }

  .meta-date,
  .meta-sender-email,
  .meta-field-label {
    letter-spacing: 0;
  }

  .meta-fields {
    border-top-color: rgba(0,0,0,0.08);
  }

  .meta-field {
    display: grid;
    grid-template-columns: 42px minmax(0, 1fr);
    gap: 8px;
  }

  .body-divider {
    margin: 18px 4px;
    background: rgba(0,0,0,0.08);
  }

  .email-body {
    padding: 0 2px;
    font-size: 16px;
    line-height: 1.72;
  }

  .email-text {
    font-size: 15px;
    line-height: 1.68;
  }

  .att-container,
  .translate-panel {
    border-radius: 20px;
    border: 1px solid rgba(0,0,0,0.08);
    border-left: 1px solid rgba(0,0,0,0.08);
    background: rgba(247,246,243,0.84);
    box-shadow: 0 10px 24px rgba(0,0,0,0.06);
  }

  .att-container {
    padding: 14px;
    margin-top: 28px;
  }

  .att-item {
    border-radius: 14px;
    border-color: rgba(0,0,0,0.08);
  }

  .dark .email-detail {
    background: linear-gradient(180deg, #151519 0%, #101014 100%);
  }

  .dark .detail-header,
  .dark .meta-card,
  .dark .att-container,
  .dark .translate-panel {
    background: rgba(28,28,33,0.90);
    border-color: rgba(255,255,255,0.08);
    box-shadow: 0 12px 28px rgba(0,0,0,0.26);
  }
}
</style>

/* Global: blockquote inside shadow-html */
<style>
.psg-shadow-blockquote,
.shadow-html-host blockquote,
blockquote {
  border-left: 3px solid var(--red-accent) !important;
  padding-left: 16px !important;
  margin: 16px 0 !important;
  color: #666666 !important;
}
</style>
