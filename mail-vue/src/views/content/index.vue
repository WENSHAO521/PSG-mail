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
        <el-tooltip :content="$t('markAsUnread')" placement="bottom"
                    v-if="emailStore.contentData.showUnread">
          <button type="button" class="icon-btn" :aria-label="$t('markAsUnread')" @click="handleMarkAsUnread">
            <Icon icon="psg:mail" width="19" height="19" />
          </button>
        </el-tooltip>
      </div>
      <div class="header-right">
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
              <Icon icon="psg:sparkles" width="18" height="18" />
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
        <el-dropdown placement="bottom-end" trigger="click">
          <button type="button" class="icon-btn" :aria-label="$t('more')" :title="$t('more')">
            <Icon icon="psg:more" width="19" height="19" />
          </button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item @click="handlePrint">
                <Icon icon="psg:printer" width="16" height="16" /> {{ $t('printEmail') }}
              </el-dropdown-item>
              <el-dropdown-item @click="handleDownloadEml">
                <Icon icon="psg:download" width="16" height="16" /> {{ $t('downloadEml') }}
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
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
              <Icon icon="psg:sparkles" width="16" height="16" /> {{ $t('aiMailSummary') }}
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

        <!-- Sender row: who, which of my addresses it was sent to, when. -->
        <div class="meta-card">
          <div class="meta-avatar" :style="avatarTint(email.sendEmail || email.name)">
            <span class="meta-initial">{{ (email.name || email.sendEmail || '?')[0].toUpperCase() }}</span>
            <img v-if="metaAvatarImg" :src="metaAvatarImg" class="meta-avatar-img" alt=""
                 @error="e => { e.target.style.display='none'; markGravatarMiss(email.sendEmail) }" />
          </div>
          <div class="meta-body">
            <div class="meta-sender-row">
              <span class="meta-sender-name">{{ email.name || email.sendEmail }}</span>
              <span class="meta-sender-email" v-if="email.name">{{ email.sendEmail }}</span>
            </div>
            <div class="meta-field" v-if="formateReceive(email.recipient)">
              <span class="meta-field-label">{{ $t('sentTo') }}</span>
              <span class="meta-field-value meta-field-value--to">{{ formateReceive(email.recipient) }}</span>
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
          <span class="meta-date">{{ formatDetailDate(email.createTime) }}</span>
        </div>
        <el-alert v-if="email.status === 3" :closable="false" :title="toMessage(email.message)"
                  class="email-status-alert" type="error" show-icon />
        <el-alert v-if="email.status === 4" :closable="false" :title="$t('complained')"
                  class="email-status-alert" type="warning" show-icon />
        <el-alert v-if="email.status === 5" :closable="false" :title="$t('delayed')"
                  class="email-status-alert" type="warning" show-icon />


        <!-- Spam notice: why it's here (AI verdict, when there is one) and a
             one-click way out that also trusts the sender from now on. -->
        <div v-if="email.isSpam" class="spam-banner" role="status">
          <Icon icon="psg:spam" width="18" height="18" class="spam-banner-icon" />
          <div class="spam-banner-text">
            <strong>{{ spamVerdict ? $t('aiSpamBannerTitle') : $t('spamBannerTitle') }}</strong>
            <span v-if="spamVerdict?.reason">{{ spamVerdict.reason }}</span>
            <span v-else-if="spamVerdict">{{ $t('aiSpamBannerFallback') }}</span>
          </div>
          <button type="button" class="spam-banner-btn" :disabled="notSpamBusy" @click="markNotSpam">{{ $t('notSpam') }}</button>
        </div>

        <!-- Tracker notice: open-tracking pixels the server blocked on
             receipt, with a way to load them anyway. -->
        <div v-if="trackerInfo.blocked || trackerInfo.clickTrackers" class="tracker-banner" role="status">
          <Icon icon="psg:shield" width="18" height="18" class="tracker-banner-icon" />
          <div class="tracker-banner-text">
            <strong v-if="trackerInfo.blocked">{{ showTrackers ? $t('trackersShown', { n: trackerInfo.blocked }, trackerInfo.blocked) : $t('trackersBlocked', { n: trackerInfo.blocked }, trackerInfo.blocked) }}</strong>
            <strong v-else>{{ $t('clickTrackersOnly') }}</strong>
            <span v-if="trackerInfo.vendors.length">{{ trackerInfo.vendors.join(' · ') }}</span>
            <span v-if="trackerInfo.clickTrackers">{{ $t('clickTrackersFound', { n: trackerInfo.clickTrackers }, trackerInfo.clickTrackers) }}</span>
          </div>
          <button v-if="trackerInfo.blocked" type="button" class="tracker-banner-btn" @click="showTrackers = !showTrackers">
            {{ showTrackers ? $t('blockTrackersAgain') : $t('loadTrackers') }}
          </button>
          <button v-if="trackerInfo.blocked && email?.sendEmail" type="button" class="tracker-banner-btn"
                  :disabled="trustBusy" @click="trustSender">
            {{ $t('trustSenderTrackers') }}
          </button>
        </div>

        <!-- Translate bar: the body below is swapped in place for the
             translation (Google Translate style); this bar says so and
             offers the way back. -->
        <div v-if="showTranslation" class="translate-bar" role="status">
          <Icon v-if="translating" icon="svg-spinners:3-dots-fade" width="18" height="18" class="translate-bar-icon" />
          <Icon v-else icon="psg:globe" width="16" height="16" class="translate-bar-icon" />
          <span class="translate-bar-text">
            {{ translating ? $t('translating') : $t('translatedInto', { lang: translateTargetLang === 'zh' ? $t('langZh') : $t('langEn') }) }}
          </span>
          <div class="translate-bar-actions" v-if="!translating">
            <button type="button" class="translate-bar-btn" @click="showTranslation = false">{{ $t('showOriginal') }}</button>
            <button type="button" class="translate-bar-btn" @click="switchTranslateLang">
              {{ translateTargetLang === 'zh' ? $t('translateToEn') : $t('translateToZh') }}
            </button>
          </div>
        </div>

        <div class="email-body" :class="{ 'is-zoomed': bodyZoom > 1, 'is-translating': translating }"
             @touchstart="zoomTouchStart" @touchmove="zoomTouchMove"
             @touchend="zoomTouchEnd" @touchcancel="zoomTouchEnd">
          <div class="email-zoom" :style="bodyZoom !== 1 ? { zoom: bodyZoom } : null">
            <ShadowHtml class="shadow-html" :html="bodyHtml" :show-trackers="showTrackers"
                        @trackers="trackerInfo = $event" v-if="email.content" />
            <pre v-else class="email-text">{{ bodyText }}</pre>
          </div>
        </div>

        <div v-if="aiPanel" class="ai-mail-panel">
          <div class="translate-panel-header">
            <span class="translate-panel-title"><Icon icon="psg:sparkles" width="15" height="15" /> {{ aiPanelTitle }}</span>
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

      </div>
    </el-scrollbar>

    <!-- Docked reply card: the everyday next action, always in reach. -->
    <div v-if="emailStore.contentData.showReply && hasPerm('email:send')" class="quick-reply">
      <button type="button" class="quick-reply-prompt" @click="openReply">
        <Icon icon="psg:reply" width="16" height="16" />
        <span>{{ $t('quickReplyTo', { name: email.name || email.sendEmail }) }}</span>
      </button>
      <div class="quick-reply-actions">
        <button type="button" class="quick-reply-btn" @click="openReplyAll">
          <Icon icon="psg:reply-all" width="16" height="16" />{{ $t('replyAll') }}
        </button>
        <button type="button" class="quick-reply-btn" @click="openForward">
          <Icon icon="psg:forward" width="15" height="15" />{{ $t('forward') }}
        </button>
        <button type="button" class="quick-reply-btn quick-reply-btn--primary" @click="openReply">
          <Icon icon="psg:reply" width="16" height="16" />{{ $t('reply') }}
        </button>
      </div>
    </div>

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
import { emailDelete, emailRead, emailUnread, emailSpamVerdict, emailUnmarkSpam } from '@/request/email.js'
import { translateSegments } from '@/request/translate.js'
import { trackerAllow } from '@/request/tracker.js'
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
import { avatarBg, avatarTint, storedAvatar, gravatarCandidate, markGravatarMiss } from '@/utils/avatar.js'
import { useAvatarCacheStore } from '@/store/avatar-cache.js'
import { downloadEml } from '@/utils/download-eml.js'
import { useLabelStore } from '@/store/label.js'
import { labelApply, labelRemove } from '@/request/label.js'
import { useMobileNavigationStore } from '@/store/mobile-navigation.js'
import { hasPerm } from '@/perm/perm.js'
import { parseMailHtml } from '@/utils/html-sanitize.js'

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
const translatedHtml = ref('')
const translateTargetLang = ref('zh')
let translateRun = 0
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

// Only used to pick a sensible default translate direction on first click --
// the actual translation request no longer sends this, since the AI model
// auto-detects the source language far more reliably than this CJK-ratio guess.
function detectLang(text) {
  const cjk = (text.match(/[一-鿿぀-ゟ゠-ヿ]/g) || []).length
  return cjk / Math.max(text.length, 1) > 0.1 ? 'zh' : 'en'
}

// Text nodes worth sending to the translator: visible, with at least one letter.
const SKIP_TRANSLATE_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TITLE', 'TEMPLATE', 'CODE'])
function translatableTextNodes(root) {
  const nodes = []
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      for (let el = node.parentElement; el && el !== root; el = el.parentElement) {
        if (SKIP_TRANSLATE_TAGS.has(el.tagName)) return NodeFilter.FILTER_REJECT
      }
      return /\p{L}/u.test(node.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
    }
  })
  while (walker.nextNode()) nodes.push(walker.currentNode)
  return nodes
}

// Keeps the node's own leading/trailing whitespace so inline spacing survives.
function replaceKeepingSpace(original, translated) {
  const lead = original.match(/^\s*/)[0]
  const trail = original.match(/\s*$/)[0]
  return lead + translated + trail
}

async function runTranslate(targetLang) {
  const e = email.value
  if (!e) return
  const emailId = e.emailId
  const runId = ++translateRun
  translating.value = true
  showTranslation.value = true
  try {
    if (e.content) {
      const doc = new DOMParser().parseFromString(formatImage(e.content), 'text/html')
      const nodes = translatableTextNodes(doc.body)
      if (!nodes.length) throw new Error(t('translateEmpty'))
      const res = await translateSegments({ segments: nodes.map(n => n.nodeValue.trim()), target_lang: targetLang })
      if (runId !== translateRun || email.value?.emailId !== emailId) return
      const out = res?.segments || []
      nodes.forEach((n, i) => { if (out[i]) n.nodeValue = replaceKeepingSpace(n.nodeValue, out[i]) })
      translatedHtml.value = doc.documentElement.outerHTML
    } else {
      const lines = String(e.text || '').split('\n')
      const idx = lines.map((l, i) => /\p{L}/u.test(l) ? i : -1).filter(i => i >= 0)
      if (!idx.length) throw new Error(t('translateEmpty'))
      const res = await translateSegments({ segments: idx.map(i => lines[i].trim()), target_lang: targetLang })
      if (runId !== translateRun || email.value?.emailId !== emailId) return
      const out = res?.segments || []
      idx.forEach((li, k) => { if (out[k]) lines[li] = replaceKeepingSpace(lines[li], out[k]) })
      translatedText.value = lines.join('\n')
    }
  } catch (error) {
    if (runId !== translateRun) return
    ElMessage({ message: error?.message || t('translateFailed'), type: 'error', plain: true })
    showTranslation.value = false
  } finally {
    if (runId === translateRun) translating.value = false
  }
}

const bodyHtml = computed(() => (showTranslation.value && translatedHtml.value)
  ? translatedHtml.value
  : formatImage(email.value?.content))
const bodyText = computed(() => (showTranslation.value && translatedText.value)
  ? translatedText.value
  : email.value?.text)

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
    translating.value = false
    translateRun++
    return
  }
  const e = email.value
  if (!e) return
  // Re-showing the same translation needs no new request.
  if (translatedHtml.value || translatedText.value) {
    showTranslation.value = true
    return
  }
  const sourceLang = detectLang(e.text || e.content || '')
  translateTargetLang.value = sourceLang === 'zh' ? 'en' : 'zh'
  runTranslate(translateTargetLang.value)
}

function switchTranslateLang() {
  translatedHtml.value = ''
  translatedText.value = ''
  translateTargetLang.value = translateTargetLang.value === 'zh' ? 'en' : 'zh'
  runTranslate(translateTargetLang.value)
}

const parsedCc  = computed(() => parseAddressList(email.value?.cc))
const parsedBcc = computed(() => parseAddressList(email.value?.bcc))

// Mark as read when email opens; reset translation state on switch
// ── Pinch to zoom the message body (touch) ──
// Two fingers scale the body 1–3×; double-tap toggles 1× / 2×. The zoomed
// body scrolls sideways inside itself, which the reader's swipe-between-
// messages gesture yields to. Resets for every message.
const bodyZoom = ref(1)
let pinch = null
let tap = null
let lastTapAt = 0
const touchDistance = t => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)
function zoomTouchStart(e) {
  if (e.touches.length === 2) {
    pinch = { d: touchDistance(e.touches), z: bodyZoom.value }
    tap = null
  } else if (e.touches.length === 1) {
    tap = { x: e.touches[0].clientX, y: e.touches[0].clientY, moved: false }
  }
}
function zoomTouchMove(e) {
  if (pinch && e.touches.length === 2) {
    e.preventDefault()
    const z = pinch.z * touchDistance(e.touches) / pinch.d
    bodyZoom.value = Math.round(Math.min(3, Math.max(1, z)) * 100) / 100
  } else if (tap && e.touches.length === 1) {
    if (Math.abs(e.touches[0].clientX - tap.x) > 10 || Math.abs(e.touches[0].clientY - tap.y) > 10) tap.moved = true
  }
}
function zoomTouchEnd(e) {
  if (e.touches.length < 2) pinch = null
  if (bodyZoom.value < 1.05) bodyZoom.value = 1
  if (tap && !tap.moved && e.touches.length === 0) {
    const now = Date.now()
    if (now - lastTapAt < 300) {
      bodyZoom.value = bodyZoom.value > 1 ? 1 : 2
      lastTapAt = 0
    } else lastTapAt = now
  }
  if (e.touches.length === 0) tap = null
}
watch(() => email.value?.emailId, () => { bodyZoom.value = 1 })

// Keyboard shortcuts for the open message (S star, # delete) — see layout.
watch(() => emailStore.readerCommand, (cmd) => {
  if (!cmd || !email.value) return
  if (cmd.name === 'star') changeStar()
  else if (cmd.name === 'delete') handleDelete()
})

// AI spam verdict for the open message (only fetched for mail in Spam).
const spamVerdict = ref(null)
const notSpamBusy = ref(false)
watch(() => email.value?.isSpam ? email.value.emailId : 0, async (emailId) => {
  spamVerdict.value = null
  if (!emailId) return
  try {
    const verdict = await emailSpamVerdict(emailId)
    if (email.value?.emailId === emailId) spamVerdict.value = verdict || null
  } catch {}
}, { immediate: true })

// Trackers blocked on receipt, as reported by ShadowHtml for the open message.
const NO_TRACKERS = { blocked: 0, vendors: [], clickTrackers: 0 }
const trackerInfo = ref(NO_TRACKERS)
const showTrackers = ref(false)
const trustBusy = ref(false)

// Future mail from this address skips tracker blocking; this message is
// shown with its images now. Undo in Settings → Account.
async function trustSender() {
  trustBusy.value = true
  try {
    await trackerAllow(email.value.sendEmail)
    showTrackers.value = true
    ElMessage({ message: t('trustSenderDone', { email: email.value.sendEmail }), type: 'success', plain: true })
  } finally {
    trustBusy.value = false
  }
}
watch(() => email.value?.emailId, () => {
  trackerInfo.value = NO_TRACKERS
  showTrackers.value = false
})

async function markNotSpam() {
  const target = email.value
  if (!target || notSpamBusy.value) return
  notSpamBusy.value = true
  try {
    await emailUnmarkSpam([target.emailId])
    target.isSpam = 0
    spamVerdict.value = null
    emailStore.deleteIds = [target.emailId]
    ElMessage({ message: t('notSpamDone'), type: 'success', plain: true })
  } catch {
    ElMessage({ message: t('operationFailMsg'), type: 'error', plain: true })
  } finally {
    notSpamBusy.value = false
  }
}

watch(email, (newEmail) => {
  if (newEmail && emailStore.contentData.showUnread && newEmail.unread === EmailUnreadEnum.UNREAD) {
    newEmail.unread = EmailUnreadEnum.READ
    emailRead([newEmail.emailId])
  }
  if (!newEmail) emailStore.contentData.showUnread = false
  showTranslation.value = false
  translating.value = false
  translateRun++
  translatedText.value = ''
  translatedHtml.value = ''
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
  return parseMailHtml(value).innerHTML
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
  height: 100%;
  background: var(--psg-surface);
  /* Sits a little above centre so it reads as "waiting", not "empty". */
  padding-bottom: 12%;
  box-sizing: border-box;

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
  background: var(--psg-surface);
}

/* ── Header ──────────────────────────────────────────────── */
.detail-header {
  min-height: 72px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  background: var(--psg-surface);
  flex-shrink: 0;
}

.header-left  { display: flex; align-items: center; gap: 6px; }
.header-right { display: flex; align-items: center; gap: 6px; }
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
  width: 38px;
  height: 38px;
  border: none;
  border-radius: var(--psg-radius-sm);
  background: var(--psg-surface-muted);
  cursor: pointer;
  color: var(--psg-text);
  transition: background 0.12s ease, color 0.12s ease;
  flex-shrink: 0;

  @media (hover: hover) {
    &:hover { background: var(--psg-surface-active); color: var(--psg-text); }
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
  font-family: var(--psg-font-sans);
  font-variant-numeric: tabular-nums;
  font-size: 13px;
  color: var(--psg-text-muted);
  white-space: nowrap;
  margin-left: 6px;
}

/* ── Scroll ──────────────────────────────────────────────── */
.detail-scroll { flex: 1; min-height: 0; }

.detail-content {
  /* Fills the reading pane at any width so there's no dead strip on the
     right; email HTML brings its own measure (most newsletters are
     600–700px tables), plain text wraps to the pane. */
  width: 100%;
  max-width: none;
  box-sizing: border-box;
  margin: 0;
  padding: 8px 48px 40px;
  @media (max-width: 1280px) { padding: 24px 24px 40px; }
  @media (max-width: 1024px) { padding: 20px 20px 36px; }
  @media (max-width: 767px)  { padding: 16px 16px 32px; }
  @media (max-width: 420px)  { padding: 16px 14px; }
}

/* ── Subject ─────────────────────────────────────────────── */
.email-title {
  font-size: 28px;
  font-weight: 700;
  letter-spacing: -.02em;
  line-height: 1.25;
  color: var(--psg-text);
  margin: 0 0 14px;
  text-wrap: balance;
  word-break: break-word;
  font-family: var(--psg-font-sans);
  letter-spacing: -0.01em;

  @media (max-width: 767px) {
    font-size: 22px;
    margin-bottom: 14px;
  }
}

.detail-label-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: -4px 0 16px;
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
  margin-bottom: 24px;

  @media (max-width: 767px) {
    gap: 10px;
    margin-bottom: 16px;
  }
}

.meta-avatar {
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
  border-radius: var(--psg-radius-md);

  .meta-initial { color: inherit; font-size: 16px; font-weight: 700; line-height: 1; }
  .meta-avatar-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
}

.meta-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.meta-sender-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
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
  font-family: var(--psg-font-sans);
  font-variant-numeric: tabular-nums;
  font-size: 12px;
  color: var(--psg-text-secondary);
  white-space: nowrap;
  flex-shrink: 0;
  padding-top: 2px;
}

.meta-sender-email {
  font-family: var(--psg-font-sans);
  font-size: 13px;
  color: var(--psg-text-secondary);
  min-width: 0;
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
  gap: 6px;
  font-size: 13px;
  line-height: 1.5;
}

.meta-field-label {
  font-family: var(--psg-font-sans);
  font-size: 13px;
  font-weight: 400;
  color: var(--psg-text-secondary);
  flex-shrink: 0;
}

.meta-field-value {
  color: var(--psg-text);
  word-break: break-word;
  font-size: 13px;
  line-height: 1.5;

  &--to { color: var(--psg-text); font-weight: 700; }
}

.email-status-alert {
  margin: -12px 0 20px;
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
  /* Pinch is handled in script (zoomTouch*), not by the browser. */
  touch-action: pan-x pan-y;

  &.is-zoomed { overflow-x: auto; overscroll-behavior-x: contain; }
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
  font-family: var(--psg-font-sans);
  font-variant-numeric: tabular-nums;
  .att-actions { display: flex; align-items: center; gap: 2px; flex-shrink: 0; }
}

/* ── Docked quick-reply card ─────────────────────────────── */
.quick-reply {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 24px 24px;
  padding: 8px 8px 8px 10px;
  box-sizing: border-box;
  border-radius: var(--psg-radius-lg);
  background: var(--psg-surface-muted);

  /* Phones get the fixed action bar instead (.mobile-reader-actions). */
  @media (max-width: 767px) { display: none; }
}

.quick-reply-prompt {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
  height: 44px;
  padding: 0 10px;
  border: 0;
  border-radius: var(--psg-radius-md);
  background: transparent;
  color: var(--psg-text-muted);
  font: inherit;
  font-size: 14px;
  text-align: left;
  cursor: text;

  span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  @media (hover: hover) {
    &:hover { background: var(--psg-surface); color: var(--psg-text-secondary); }
  }
}

.quick-reply-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}

.quick-reply-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 44px;
  padding: 0 14px;
  border: 0;
  border-radius: var(--psg-radius-md);
  background: transparent;
  color: var(--psg-text-secondary);
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;

  @media (hover: hover) {
    &:hover { background: var(--psg-surface); color: var(--psg-text); }
  }

  &--primary {
    padding: 0 20px;
    font-weight: 700;
    background: var(--psg-primary);
    color: var(--psg-on-primary);
    font-weight: 600;

    @media (hover: hover) {
      &:hover { background: var(--psg-primary-hover); color: var(--psg-on-primary); }
    }
  }
}

/* ── Translate bar (body is translated in place) ─────────── */
.translate-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 10px;
  margin: 0 0 16px;
  padding: 8px 10px 8px 12px;
  border: 1px solid var(--psg-border);
  border-radius: var(--psg-radius-md);
  background: var(--psg-surface-muted);
  font-size: 13px;
  color: var(--psg-text-secondary);
}
.translate-bar-icon { flex-shrink: 0; color: var(--psg-primary); }
.translate-bar-text { flex: 1; min-width: 0; font-weight: 600; }
.translate-bar-actions { display: flex; align-items: center; gap: 4px; }
.translate-bar-btn {
  border: 0;
  border-radius: var(--psg-radius-xs);
  background: transparent;
  padding: 4px 10px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--psg-primary);
  cursor: pointer;
  &:hover { background: var(--psg-menu-active-bg); }
}
.email-body.is-translating { opacity: .55; transition: opacity .2s; }

.ai-mail-panel { margin: 16px 0 8px; border: 1px solid var(--psg-border); border-radius: var(--psg-radius-md); overflow: hidden; background: var(--psg-surface-muted); }
.reader-ai-actions { display: flex; flex-direction: column; gap: 3px; }
.reader-ai-actions button { display: flex; align-items: center; gap: 8px; border: 0; border-radius: var(--psg-radius-xs); padding: 8px 9px; background: transparent; color: var(--psg-text); font-size: 12.5px; text-align: left; cursor: pointer; }
.reader-ai-actions button:hover { background: var(--psg-menu-active-bg); color: var(--psg-menu-active-text); }

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

@media (max-width: 767px) {
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
    flex-wrap: wrap;
    row-gap: 0;
  }

  .meta-avatar {
    width: 38px;
    height: 38px;
  }

  .meta-sender-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 0;
  }

  .meta-sender-name {
    font-size: 15px;
  }

  /* Date tucks under the sender block instead of fighting it for width. */
  .meta-date {
    order: 3;
    flex-basis: 100%;
    padding: 4px 0 0 48px;
  }

  .meta-field-value { word-break: break-all; }

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
  .translate-bar {
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
    padding: 10px 12px calc(12px + env(safe-area-inset-bottom, 0px));
    background: var(--psg-surface);
  }

  .mobile-reader-actions button {
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 48px;
    padding: 0 6px;
    border: 0;
    border-radius: var(--psg-radius-md);
    background: var(--psg-surface-muted);
    color: var(--psg-text);
    font-size: 13px;
    font-weight: 700;
  }

  .mobile-reader-actions button:first-child {
    background: var(--psg-primary);
    color: var(--psg-on-primary);
  }

  .mobile-reader-actions button:active {
    color: var(--psg-menu-active-text);
    background: var(--psg-menu-active-bg);
  }
}

/* ── Spam notice ── */
.spam-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0 0 18px;
  padding: 12px 14px 12px 16px;
  border-radius: var(--psg-radius-lg);
  background: color-mix(in srgb, var(--psg-warning) 12%, var(--psg-surface));
  color: var(--psg-text);
}
.spam-banner-icon { flex-shrink: 0; color: var(--psg-warning); }
.spam-banner-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 13px;
  line-height: 1.45;
  strong { font-size: 14px; font-weight: 700; }
  span { color: var(--psg-text-secondary); }
}
.spam-banner-btn {
  flex-shrink: 0;
  height: 36px;
  padding: 0 14px;
  border: 0;
  border-radius: var(--psg-radius-full);
  background: var(--psg-surface);
  color: var(--psg-text);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: var(--psg-shadow-xs);
  &:disabled { opacity: .6; cursor: default; }
  @media (hover: hover) { &:hover:not(:disabled) { background: var(--psg-surface-active); } }
}

/* ── Tracker notice ── */
.tracker-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0 0 18px;
  padding: 10px 14px 10px 16px;
  border-radius: var(--psg-radius-lg);
  background: color-mix(in srgb, var(--psg-primary) 8%, var(--psg-surface));
  color: var(--psg-text);
}
.tracker-banner-icon { flex-shrink: 0; color: var(--psg-primary); }
.tracker-banner-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 13px;
  line-height: 1.45;
  strong { font-size: 13px; font-weight: 600; }
  span { color: var(--psg-text-secondary); overflow-wrap: anywhere; }
}
.tracker-banner-btn {
  flex-shrink: 0;
  height: 32px;
  padding: 0 12px;
  border: 0;
  border-radius: var(--psg-radius-full);
  background: transparent;
  color: var(--psg-primary);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  @media (hover: hover) { &:hover { background: var(--psg-surface-active); } }
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
