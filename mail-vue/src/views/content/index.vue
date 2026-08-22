<template>
  <!-- Empty state: no email selected — matches vfasky's empty detail panel -->
  <div v-if="!email" class="detail-empty surface-card">
    <Icon icon="psg:mail" width="40" height="40" class="empty-icon"/>
    <span class="empty-text">{{ $t('selectEmailHint') }}</span>
  </div>

  <!-- Email view: surface-card floating card -->
  <article v-else class="surface-card email-detail">

    <!-- Header: min-h-16, circular icon-buttons -->
    <header class="detail-header">
      <div class="header-left">
        <!-- Back button: always visible; clears selection on desktop, triggers mobile nav -->
        <button type="button" class="icon-btn detail-back-btn" :aria-label="$t('back')" :title="$t('back')" @click="handleBack">
          <Icon icon="psg:chevron-left" width="20" height="20" />
        </button>
        <template v-if="emailStore.contentData.showReply">
          <button type="button" class="icon-btn" v-perm="'email:send'" :aria-label="$t('reply')" :title="$t('reply')" @click="openReply">
            <Icon icon="psg:reply" width="21" height="21" />
          </button>
          <button type="button" class="icon-btn" v-perm="'email:send'" :aria-label="$t('replyAll')" :title="$t('replyAll')" @click="openReplyAll">
            <Icon icon="psg:reply-all" width="22" height="22" />
          </button>
          <button type="button" class="icon-btn" v-perm="'email:send'" :aria-label="$t('forward')" :title="$t('forward')" @click="openForward">
            <Icon icon="psg:forward" width="20" height="20" />
          </button>
        </template>
        <button type="button" class="icon-btn" @click="changeStar" v-if="emailStore.contentData.showStar"
                :aria-label="$t('star')" :title="$t('star')">
          <Icon :icon="email.isStar ? 'fluent-color:star-16' : 'psg:star'"
                :width="email.isStar ? 20 : 18" :height="email.isStar ? 20 : 18" />
        </button>
        <!-- Destructive action: kept last (never adjacent to Back/Reply muscle-memory
             position) and visually quiet at rest — only turns --psg-danger on hover. -->
        <button v-perm="'email:delete'" type="button" class="icon-btn icon-danger" @click="handleDelete"
                :title="$t('delete')" :aria-label="$t('delete')">
          <Icon icon="psg:trash" width="19" height="19" />
        </button>
      </div>
      <div class="header-right">
        <el-tooltip :content="$t('markAsUnread')" placement="bottom"
                    v-if="emailStore.contentData.showUnread">
          <button type="button" class="icon-btn" :aria-label="$t('markAsUnread')" @click="handleMarkAsUnread">
            <Icon icon="psg:mail" width="19" height="19" />
          </button>
        </el-tooltip>
        <el-tooltip :content="$t('printEmail')" placement="bottom">
          <button type="button" class="icon-btn" :aria-label="$t('printEmail')" @click="handlePrint">
            <Icon icon="psg:printer" width="19" height="19" />
          </button>
        </el-tooltip>
        <el-tooltip :content="$t('downloadEml')" placement="bottom">
          <button type="button" class="icon-btn" :aria-label="$t('downloadEml')" @click="handleDownloadEml">
            <Icon icon="psg:download" width="19" height="19" />
          </button>
        </el-tooltip>
        <el-popover placement="bottom-end" width="220" trigger="click">
          <template #reference>
            <button type="button" class="icon-btn" :title="$t('labelApply')" :aria-label="$t('labelApply')">
              <Icon icon="psg:tag" width="19" height="19" />
            </button>
          </template>
          <div class="label-popover-list">
            <div v-if="!labelStore.labels.length" class="label-popover-empty">{{ $t('labelEmpty') }}</div>
            <div v-for="l in labelStore.labels" :key="l.labelId" class="label-popover-item" @click="toggleLabel(l)">
              <span class="label-dot" :style="{ background: l.color }"></span>
              <span class="label-popover-name">{{ l.name }}</span>
              <Icon v-if="isLabelApplied(l.labelId)" icon="psg:check-circle" width="16" height="16" class="label-popover-check"/>
            </div>
          </div>
        </el-popover>
        <el-tooltip :content="translateBtnLabel" placement="bottom">
          <button type="button" class="icon-btn" :class="{ 'icon-btn--active': showTranslation }"
                  :aria-label="translateBtnLabel"
                  @click="handleTranslate" :disabled="translating">
            <Icon v-if="translating" icon="svg-spinners:3-dots-fade" width="20" height="20" />
            <Icon v-else icon="psg:globe" width="19" height="19" />
          </button>
        </el-tooltip>
        <el-popover placement="bottom-end" width="190" trigger="click">
          <template #reference>
            <button type="button" class="icon-btn" :class="{ 'icon-btn--active': !!aiPanel }"
                    :aria-label="$t('aiTransform')" :title="$t('aiTransform')">
              <Icon icon="lucide:sparkles" width="18" height="18" />
            </button>
          </template>
          <div class="reader-ai-actions">
            <button type="button" @click="runAiAction('summary')">
              <Icon icon="psg:mail" width="15" height="15" /> {{ $t('aiMailSummary') }}
            </button>
            <button type="button" @click="runAiAction('reply')">
              <Icon icon="psg:reply" width="15" height="15" /> {{ $t('aiReplySuggestion') }}
            </button>
          </div>
        </el-popover>
        <span class="page-counter" v-if="emailStore.contentData.emailTotal > 0" :title="$t('emailPositionHint')">
          {{ emailStore.contentData.emailIndex }}&thinsp;/&thinsp;{{ emailStore.contentData.emailTotal }}
        </span>
      </div>
      <el-dropdown ref="mobileMenuRef" class="mobile-reader-menu" placement="bottom-end" trigger="click"
                   @visible-change="handleMobileMenuVisible">
        <button type="button" class="icon-btn" :aria-label="$t('more')" :title="$t('more')">
          <Icon icon="psg:more" width="20" height="20" />
        </button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item v-if="emailStore.contentData.showStar" @click="changeStar">
              <Icon :icon="email.isStar ? 'fluent-color:star-16' : 'psg:star'" width="16" height="16" />
              {{ email.isStar ? $t('unstar') : $t('star') }}
            </el-dropdown-item>
            <el-dropdown-item v-if="emailStore.contentData.showUnread" @click="handleMarkAsUnread">
              <Icon icon="psg:mail" width="16" height="16" /> {{ $t('markAsUnread') }}
            </el-dropdown-item>
            <el-dropdown-item @click="handleTranslate">
              <Icon icon="psg:globe" width="16" height="16" /> {{ translateBtnLabel }}
            </el-dropdown-item>
            <el-dropdown-item @click="runAiAction('summary')">
              <Icon icon="lucide:sparkles" width="16" height="16" /> {{ $t('aiMailSummary') }}
            </el-dropdown-item>
            <el-dropdown-item @click="runAiAction('reply')" v-if="emailStore.contentData.showReply">
              <Icon icon="psg:reply" width="16" height="16" /> {{ $t('aiReplySuggestion') }}
            </el-dropdown-item>
            <el-dropdown-item divided @click="handleDelete" v-perm="'email:delete'">
              <Icon icon="psg:trash" width="16" height="16" /> {{ $t('delete') }}
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </header>

    <!-- Scrollable content -->
    <el-scrollbar class="detail-scroll">
      <div class="detail-content">

        <h1 class="email-title">{{ email.subject || $t('noSubject') }}</h1>

        <div class="detail-label-chips" v-if="email.labels && email.labels.length">
          <span v-for="l in email.labels" :key="l.labelId" class="detail-label-chip" :style="{ '--chip-color': l.color }">
            {{ l.name }}
          </span>
        </div>

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
              <Icon icon="psg:globe" width="15" height="15" />
              {{ $t('translatedResult') }}
              <span class="translate-lang-tag">{{ translateTargetLang === 'zh' ? $t('translateToZh') : $t('translateToEn') }}</span>
            </span>
            <div class="translate-panel-actions">
              <button type="button" class="translate-switch-btn" @click="switchTranslateLang">
                {{ translateTargetLang === 'zh' ? $t('translateToEn') : $t('translateToZh') }}
              </button>
              <button type="button" class="icon-btn-sm" :aria-label="$t('close')" :title="$t('close')" @click="showTranslation = false">
                <Icon icon="psg:close" width="15" height="15" />
              </button>
            </div>
          </div>
          <div v-if="translating" class="translate-loading">
            <Icon icon="svg-spinners:3-dots-fade" width="24" height="24" />
          </div>
          <div v-else class="translate-comparison">
            <div class="translate-column">
              <span class="translate-column-label">{{ $t('showOriginal') }}</span>
              <pre class="translate-body">{{ originalText }}</pre>
            </div>
            <div class="translate-column">
              <span class="translate-column-label">{{ $t('translatedResult') }}</span>
              <pre class="translate-body">{{ translatedText }}</pre>
            </div>
          </div>
        </div>

        <div v-if="aiPanel" class="ai-mail-panel">
          <div class="translate-panel-header">
            <span class="translate-panel-title"><Icon icon="lucide:sparkles" width="15" height="15" /> {{ aiPanelTitle }}</span>
            <button type="button" class="icon-btn-sm" :aria-label="$t('close')" @click="aiPanel = ''"><Icon icon="psg:close" width="15" height="15" /></button>
          </div>
          <div v-if="aiLoading" class="translate-loading"><Icon icon="svg-spinners:3-dots-fade" width="24" height="24" /></div>
          <pre v-else class="translate-body">{{ aiResult }}</pre>
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
                <button v-if="isImage(att.filename)" type="button" class="icon-btn-sm"
                        :aria-label="$t('preview')" :title="$t('preview')" @click.stop="showImage(att.key)">
                  <Icon icon="psg:eye" width="18" height="18" />
                </button>
                <a class="icon-btn-sm" :aria-label="$t('download')" :title="$t('download')"
                   :href="cvtR2Url(att.key)" download @click.stop>
                  <Icon icon="psg:download" width="18" height="18" />
                </a>
              </div>
            </div>
          </div>
        </div>

        <div class="reply-action-bar" v-if="emailStore.contentData.showReply">
          <button class="reply-action-btn" v-perm="'email:send'" @click="openReply">
            <Icon icon="psg:reply" width="17" height="17" />{{ $t('reply') }}
          </button>
          <button class="reply-action-btn" v-perm="'email:send'" @click="openReplyAll">
            <Icon icon="psg:reply-all" width="17" height="17" />{{ $t('replyAll') }}
          </button>
          <button class="reply-action-btn" v-perm="'email:send'" @click="openForward">
            <Icon icon="psg:forward" width="16" height="16" />{{ $t('forward') }}
          </button>
        </div>

      </div>
    </el-scrollbar>

    <nav v-if="emailStore.contentData.showReply" class="mobile-reader-actions" :aria-label="$t('emailActions')">
      <button type="button" @click="openReply">
        <Icon icon="psg:reply" width="17" height="17" />{{ $t('reply') }}
      </button>
      <button type="button" @click="openReplyAll">
        <Icon icon="psg:reply-all" width="17" height="17" />{{ $t('replyAll') }}
      </button>
      <button type="button" @click="openForward">
        <Icon icon="psg:forward" width="16" height="16" />{{ $t('forward') }}
      </button>
    </nav>
  </article>

  <el-image-viewer v-if="showPreview" :url-list="srcList" show-progress @close="showPreview = false" />
</template>

<script setup>
import ShadowHtml from '@/components/shadow-html/index.vue'
import { reactive, ref, watch, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { emailDelete, emailRead, emailUnread } from '@/request/email.js'
import { translateEmail } from '@/request/translate.js'
import { aiEmailSummary, aiReplySuggestion } from '@/request/ai-mail.js'
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
import { useLabelStore } from '@/store/label.js'
import { labelApply, labelRemove } from '@/request/label.js'
import { useMobileNavigationStore } from '@/store/mobile-navigation.js'

const emit = defineEmits(['back'])

const uiStore = useUiStore()
const settingStore = useSettingStore()
const accountStore = useAccountStore()
const emailStore = useEmailStore()
const avatarCache = useAvatarCacheStore()
const labelStore = useLabelStore()
const mobileNavigation = useMobileNavigationStore()
const { t } = useI18n()
const mobileMenuRef = ref(null)

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
const originalText = ref('')
const translateTargetLang = ref('zh')
const aiPanel = ref('')
const aiResult = ref('')
const aiLoading = ref(false)

function handleMobileMenuVisible(open) {
  if (typeof window === 'undefined' || window.innerWidth > 1024) return
  if (open) {
    mobileNavigation.openLayer('reader-menu', () => {
      mobileMenuRef.value?.handleClose?.()
      return true
    })
  } else {
    mobileNavigation.closeLayer('reader-menu')
  }
}

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
  originalText.value = e.text || e.content || ''
  const sourceLang = detectLang(e.text || e.content || '')
  try {
    const res = await translateEmail({
      html: e.content || undefined,
      text: e.content ? undefined : (e.text || ''),
      source_lang: sourceLang,
      target_lang: targetLang,
    })
    translatedText.value = res?.translated_text || ''
    originalText.value = res?.original_text || originalText.value
  } catch {
    ElMessage({ message: t('translateFailed'), type: 'error', plain: true })
    showTranslation.value = false
  } finally {
    translating.value = false
  }
}

const aiPanelTitle = computed(() => aiPanel.value === 'summary' ? t('aiSummaryTitle') : t('aiReplySuggestionTitle'))

async function runAiAction(action) {
  if (!email.value) return
  aiPanel.value = action
  aiLoading.value = true
  aiResult.value = ''
  try {
    const res = action === 'summary' ? await aiEmailSummary(email.value.emailId) : await aiReplySuggestion(email.value.emailId)
    aiResult.value = action === 'summary' ? (res?.summary || '') : (res?.suggestion || '')
  } catch (error) {
    aiPanel.value = ''
    ElMessage({ message: error?.message || t('aiAssistantFail'), type: 'error', plain: true })
  } finally {
    aiLoading.value = false
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
  originalText.value = ''
  aiPanel.value = ''
  aiResult.value = ''
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

const appliedLabelIds = computed(() => new Set((email.value?.labels || []).map(l => l.labelId)))

function isLabelApplied(labelId) {
  return appliedLabelIds.value.has(labelId)
}

function toggleLabel(label) {
  const e = email.value
  if (!e) return
  e.labels = e.labels || []
  const applied = isLabelApplied(label.labelId)
  if (applied) {
    e.labels = e.labels.filter(l => l.labelId !== label.labelId)
    labelRemove(label.labelId, [e.emailId]).then(() => {
      ElMessage({ message: t('labelRemoved'), type: 'success', plain: true })
    }).catch(() => { e.labels.push(label) })
  } else {
    e.labels.push({ labelId: label.labelId, name: label.name, color: label.color })
    labelApply(label.labelId, [e.emailId]).then(() => {
      ElMessage({ message: t('labelApplied'), type: 'success', plain: true })
    }).catch(() => { e.labels = e.labels.filter(l => l.labelId !== label.labelId) })
  }
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

function escapePrintText(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]))
}

function sanitizePrintHtml(value) {
  const root = document.createElement('div')
  root.innerHTML = String(value || '')
  root.querySelectorAll('script, noscript').forEach(node => node.remove())
  root.querySelectorAll('*').forEach(node => {
    Array.from(node.attributes).forEach(attr => {
      const name = attr.name.toLowerCase()
      if (/^on/i.test(name)) node.removeAttribute(attr.name)
      if (['href', 'src', 'xlink:href'].includes(name) && /^\s*javascript:/i.test(attr.value)) {
        node.removeAttribute(attr.name)
      }
    })
  })
  return root.innerHTML
}

function handlePrint() {
  const e = email.value
  if (!e) return
  const win = window.open('', '_blank', 'width=800,height=600')
  if (!win) {
    ElMessage({ message: t('popupBlocked'), type: 'warning', plain: true })
    return
  }
  const subject = escapePrintText(e.subject || t('noSubject'))
  const sender = escapePrintText(e.name || '')
  const address = escapePrintText(e.sendEmail || '')
  const received = escapePrintText(e.createTime || '')
  const body = e.content
    ? `<div style="font-family:Arial,sans-serif;max-width:760px;margin:0 auto;padding:24px">${sanitizePrintHtml(e.content)}</div>`
    : `<pre style="font-family:Arial,sans-serif;max-width:760px;margin:0 auto;padding:24px;white-space:pre-wrap">${escapePrintText(e.text || '')}</pre>`
  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>${subject}</title>
    <style>@media print{body{margin:0}}</style></head><body>
    <h2 style="font-size:18px;margin-bottom:8px">${subject}</h2>
    <p style="color:#666;font-size:13px;margin-bottom:16px">From: ${sender} &lt;${address}&gt; — ${received}</p>
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
  background: var(--psg-canvas);
  /* Centered reads as an error state on a tall/wide reader pane with nothing
     selected — nudge it above true center so it reads as "waiting", not "empty". */
  transform: translateY(-12%);

  .empty-icon { color: var(--psg-text-muted); opacity: 0.5; }

  .empty-text {
    font-size: 14px;
    font-family: var(--psg-font-sans);
    letter-spacing: 0;
    text-transform: none;
    color: var(--psg-text-muted);
  }
}

/* ── Document-first reading pane: flush, not a floating card ── */
.email-detail {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--psg-canvas);
}

/* ── Header ──────────────────────────────────────────────── */
.detail-header {
  min-height: 56px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  background: var(--psg-surface);
  border-bottom: 1px solid var(--psg-border);
  flex-shrink: 0;
}

.header-left  { display: flex; align-items: center; gap: 2px; }
.header-right { display: flex; align-items: center; gap: 2px; }
.mobile-reader-menu { display: none; }
.mobile-reader-actions { display: none; }

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
  border-radius: var(--psg-radius-md);
  background: transparent;
  cursor: pointer;
  color: var(--psg-text-secondary);
  transition: background 0.12s ease, color 0.12s ease;
  flex-shrink: 0;

  @media (hover: hover) {
    &:hover { background: var(--psg-surface-muted); color: var(--psg-text); }
    &.icon-danger:hover { background: var(--psg-danger-muted); color: var(--psg-danger); }
  }
}

.icon-btn-sm {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: none;
  border-radius: var(--psg-radius-sm);
  background: transparent;
  cursor: pointer;
  color: var(--psg-text-secondary);
  text-decoration: none;
  transition: background 0.12s ease, color 0.12s ease;

  @media (hover: hover) {
    &:hover { background: var(--psg-surface-muted); color: var(--psg-text); }
  }
}

.page-counter {
  font-family: var(--psg-font-mono);
  font-size: 12px;
  color: var(--psg-text-muted);
  white-space: nowrap;
  letter-spacing: 0.02em;
  font-variant-numeric: tabular-nums;
}

/* ── Scroll ──────────────────────────────────────────────── */
.detail-scroll { flex: 1; min-height: 0; }

.detail-content {
  /* Editorial reading measure — the pane itself can stretch on wide
     monitors, but prose stays capped for readability. */
  max-width: 880px;
  margin: 0 auto;
  padding: 28px 40px 48px;
  @media (max-width: 1280px) { padding: 24px 24px 40px; }
  @media (max-width: 1024px) { padding: 20px 20px 36px; }
  @media (max-width: 767px)  { padding: 16px 16px 32px; }
  @media (max-width: 420px)  { padding: 16px 14px; }
}

/* ── Subject ─────────────────────────────────────────────── */
.email-title {
  font-size: 30px;
  font-weight: 700;
  line-height: 1.3;
  color: var(--psg-text);
  margin: 0 0 20px;
  word-break: break-word;
  font-family: var(--psg-font-sans);
  letter-spacing: -0.01em;

  @media (max-width: 768px) {
    font-size: 22px;
    margin-bottom: 14px;
  }
}

.detail-label-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: -10px 0 16px;
}

.detail-label-chip {
  font-size: 11px;
  font-weight: 700;
  padding: 2px 9px;
  border-radius: var(--psg-radius-xs);
  color: var(--chip-color);
  background: color-mix(in srgb, var(--chip-color) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--chip-color) 30%, transparent);
}

.label-popover-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 280px;
  overflow-y: auto;
}

.label-popover-empty {
  padding: 10px 4px;
  font-size: 12.5px;
  color: var(--psg-text-secondary);
}

.label-popover-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 8px;
  border-radius: var(--psg-radius-sm);
  cursor: pointer;

  &:hover { background: var(--psg-surface-muted); }
}

.label-popover-name {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.label-popover-check {
  color: var(--el-color-primary);
  flex-shrink: 0;
}

.label-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

/* ── Meta card ────────────────────────────────────────────── */
.meta-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid var(--psg-border);
  border-radius: var(--psg-radius-md);
  box-shadow: var(--psg-shadow-xs);
  margin-bottom: 0;
  background: var(--psg-surface);

  @media (max-width: 767px) {
    padding: 12px 14px;
    gap: 10px;
  }
}

.meta-avatar {
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
  margin-top: 2px;
  border-radius: var(--psg-radius-xs);

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
  color: var(--psg-text);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  min-width: 0;
  flex-shrink: 1;
}

.meta-date {
  font-family: var(--psg-font-mono);
  font-size: 11px;
  color: var(--psg-text-muted);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}

.meta-sender-email {
  font-family: var(--psg-font-mono);
  font-size: 11px;
  color: var(--psg-text-muted);
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
  border-top: 1px solid var(--psg-border);
}

.meta-field {
  display: flex;
  align-items: baseline;
  gap: 10px;
  font-size: 12.5px;
  line-height: 1.5;
}

.meta-field-label {
  font-family: var(--psg-font-sans);
  font-size: 11.5px;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: none;
  color: var(--psg-text-muted);
  flex-shrink: 0;
  min-width: 28px;
}

.meta-field-value {
  color: var(--psg-text);
  word-break: break-word;
  font-size: 12.5px;
  line-height: 1.5;
}

.email-status-alert {
  margin-top: 10px;
  :deep(.el-alert) { border-radius: var(--psg-radius-sm) !important; }
}

/* ── Divider between meta and body ───────────────────────── */
.body-divider {
  height: 1px;
  background: var(--psg-border);
  margin: 24px 0;

  @media (max-width: 767px) { margin: 16px 0; }
}

/* ── Body ────────────────────────────────────────────────── */
.email-body {
  font-size: 16px;
  line-height: 1.75;
  color: var(--psg-text);
  word-break: break-word;
}

.email-text {
  font-family: var(--psg-font-mono);
  white-space: pre-wrap; word-break: break-word;
  margin: 0; font-size: 14px; line-height: 1.8; color: var(--psg-text-secondary);
}

/* ── Attachments ─────────────────────────────────────────── */
.att-container {
  margin-top: 40px; max-width: min(100%, 560px);
  border: 1px solid var(--psg-border); border-radius: var(--psg-radius-md); padding: 16px;
}
.att-header {
  display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;
}
.att-title-text {
  font-size: 13px; font-weight: 700; color: var(--psg-text);
  font-family: var(--psg-font-sans); text-transform: none; letter-spacing: 0;
}
.att-count {
  font-size: 12.5px; color: var(--psg-text-muted);
  font-family: var(--psg-font-sans);
}
.att-list { display: flex; flex-direction: column; gap: 4px; }

.att-item {
  display: flex; align-items: center; gap: 10px;
  border: 1px solid var(--psg-border);
  border-radius: var(--psg-radius-sm);
  background: var(--psg-surface-muted);
  padding: 8px 12px; cursor: pointer; transition: background 0.12s ease;

  @media (hover: hover) {
    &:hover { background: var(--psg-surface-active); }
  }

  .att-icon-file { flex-shrink: 0; color: var(--psg-text-muted); }
  .att-name { flex: 1; min-width: 0; font-size: 13px; font-weight: 500; color: var(--psg-text); overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .att-size { font-family: var(--psg-font-mono); font-size: 11px; color: var(--psg-text-muted); flex-shrink: 0; white-space: nowrap; }
  .att-actions { display: flex; align-items: center; gap: 2px; flex-shrink: 0; }
}

/* ── Reply / Reply All / Forward — the everyday next action, restated at
   the point the reader is done, not just as toolbar icons up top. ── */
.reply-action-bar {
  display: flex;
  gap: 10px;
  margin-top: 40px;
}

.reply-action-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 38px;
  padding: 0 18px;
  border: 1px solid var(--psg-border);
  border-radius: var(--psg-radius-xs);
  background: var(--psg-surface);
  color: var(--psg-text);
  font-family: var(--psg-font-sans);
  font-size: 13.5px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.14s ease, border-color 0.14s ease, color 0.14s ease;

  @media (hover: hover) {
    &:hover {
      background: var(--psg-primary-muted);
      border-color: var(--psg-primary);
      color: var(--psg-primary);
    }
  }
}

/* ── Translation panel ─────────────────────────────── */
.translate-panel {
  margin: 16px 0 8px;
  border: 1px solid var(--psg-border);
  border-radius: var(--psg-radius-md);
  overflow: hidden;
  background: var(--psg-surface-muted);
}

.translate-comparison { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1px; background: var(--psg-border); }
.translate-column { min-width: 0; padding: 10px 12px; background: var(--psg-surface-muted); }
.translate-column-label { display: block; margin-bottom: 6px; color: var(--psg-text-muted); font-size: 11px; font-weight: 700; }
.ai-mail-panel { margin: 16px 0 8px; border: 1px solid var(--psg-border); border-radius: var(--psg-radius-md); overflow: hidden; background: var(--psg-surface-muted); }
.reader-ai-actions { display: flex; flex-direction: column; gap: 3px; }
.reader-ai-actions button { display: flex; align-items: center; gap: 8px; border: 0; border-radius: var(--psg-radius-xs); padding: 8px 9px; background: transparent; color: var(--psg-text); font-size: 12.5px; text-align: left; cursor: pointer; }
.reader-ai-actions button:hover { background: var(--psg-menu-active-bg); color: var(--psg-menu-active-text); }

@media (max-width: 640px) {
  .translate-comparison { grid-template-columns: 1fr; }
}

.translate-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid var(--psg-border);
}

.translate-panel-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: var(--psg-font-sans);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: none;
  color: var(--psg-text-muted);
}

.translate-lang-tag {
  background: var(--psg-primary);
  color: var(--psg-on-primary);
  font-size: 10.5px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: var(--psg-radius-xs);
  letter-spacing: 0;
}

.translate-panel-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.translate-switch-btn {
  font-family: var(--psg-font-sans);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0;
  text-transform: none;
  color: var(--psg-text);
  border: 1px solid var(--psg-border);
  border-radius: var(--psg-radius-xs);
  background: transparent;
  padding: 3px 10px;
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
  &:hover { background: var(--psg-primary); color: var(--psg-on-primary); border-color: var(--psg-primary); }
}

.translate-loading {
  display: flex;
  justify-content: center;
  padding: 24px;
  color: var(--psg-text-muted);
}

.translate-body {
  padding: 12px 16px;
  font-family: var(--psg-font-sans);
  font-size: 14px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--psg-text);
  background: transparent;
  margin: 0;
}

.icon-btn--active {
  color: var(--psg-primary) !important;
}

@media (max-width: 768px) {
  .detail-header {
    min-height: calc(64px + env(safe-area-inset-top, 0px));
    padding: calc(8px + env(safe-area-inset-top, 0px)) 10px 8px;
  }

  .header-left,
  .header-right {
    gap: 4px;
  }

  .header-left {
    min-width: 0;
  }

  .header-right {
    overflow: hidden;
    justify-content: flex-end;
    max-width: 0;
  }

  .header-left .icon-btn:not(.detail-back-btn) { display: none; }
  .header-right > * { display: none; }
  .mobile-reader-menu { display: inline-flex; margin-left: auto; }

  .icon-btn {
    width: 42px;
    height: 42px;
    border-radius: var(--psg-radius-sm);
    color: var(--psg-text-secondary);

    &:active {
      background: var(--psg-surface-muted);
    }
  }

  .page-counter {
    display: none;
  }

  .detail-content {
    padding: 18px 14px calc(92px + env(safe-area-inset-bottom, 0px));
  }

  .email-title {
    font-size: 22px;
    line-height: 1.25;
    margin: 2px 2px 16px;
    letter-spacing: 0;
  }

  .meta-card {
    border-left: none;
    border-radius: var(--psg-radius-sm);
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

  .meta-field {
    display: grid;
    grid-template-columns: 42px minmax(0, 1fr);
    gap: 8px;
  }

  .body-divider {
    margin: 18px 4px;
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
    border-radius: var(--psg-radius-sm);
  }

  .att-container {
    padding: 14px;
    margin-top: 28px;
  }

  .att-item {
    border-radius: var(--psg-radius-sm);
  }

  .mobile-reader-actions {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 40;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px;
    padding: 8px 10px calc(8px + env(safe-area-inset-bottom, 0px));
    background: var(--psg-surface);
    border-top: 1px solid var(--psg-border);
    box-shadow: 0 -6px 18px rgba(20, 24, 21, .08);
  }

  .mobile-reader-actions button {
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 0 6px;
    border: 1px solid var(--psg-border);
    border-radius: var(--psg-radius-sm);
    background: var(--psg-surface);
    color: var(--psg-text);
    font-size: 12px;
    font-weight: 700;
  }

  .mobile-reader-actions button:active {
    color: var(--psg-menu-active-text);
    background: var(--psg-menu-active-bg);
  }
}
</style>

/* Global: blockquote inside shadow-html */
<style>
.psg-shadow-blockquote,
.shadow-html-host blockquote,
blockquote {
  border-left: 3px solid var(--psg-border-strong) !important;
  padding-left: 16px !important;
  margin: 16px 0 !important;
  color: var(--psg-text-secondary) !important;
}
</style>
