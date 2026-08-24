<template>
  <div class="send" v-show="show" :data-state="windowState">
    <div class="write-box" :data-state="windowState" ref="writeBoxRef"
         :style="windowState !== 'minimized' && (dragOffset.x || dragOffset.y)
           ? { transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)` } : null">

      <!-- ── Header — mousedown here drags the window; a plain click (no
           movement) still falls through to the minimize-restore toggle. ── -->
      <div class="wh" :class="{ 'wh-draggable': windowState !== 'minimized' }"
           @mousedown="startDrag" @click="windowState === 'minimized' && toggleMinimize()">
        <div class="wh-left">
          <div class="wh-badge">
            <span v-if="form.sendType === 'reply'">{{ $t('reply') }}</span>
            <span v-else-if="form.sendType === 'forward'">{{ $t('forward') }}</span>
            <span v-else>{{ $t('compose') }}</span>
          </div>
          <el-dropdown trigger="click" @command="selectSender" :disabled="senderAccounts.length <= 1"
                       popper-class="write-sender-dropdown">
            <div class="wh-sender" :class="{ selectable: senderAccounts.length > 1 }">
              <div class="wh-avatar">
                <img v-if="currentSenderAvatar" :src="currentSenderAvatar" class="wh-avatar-img"/>
                <span v-else>{{ senderInitial }}</span>
              </div>
              <div class="wh-info">
                <span class="wh-name">{{ form.name || form.sendEmail.split('@')[0] }}</span>
                <span class="wh-email">{{ form.sendEmail }}</span>
              </div>
              <Icon v-if="senderAccounts.length > 1"
                    icon="psg:chevron-down" width="12" height="12" class="sender-chevron"/>
            </div>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item
                  v-for="acc in senderAccounts"
                  :key="acc.accountId"
                  :command="acc"
                  :class="{ 'is-active-sender': acc.accountId === form.accountId }"
                >
                  <div class="sender-option">
                    <div class="sender-opt-avatar"
                         :style="storedAvatar(acc.email) ? { background: 'transparent', border: 'none', padding: 0, overflow: 'hidden' }
                                                         : { background: avatarBg(acc.email) + '18', borderColor: avatarBg(acc.email) + '40' }">
                      <img v-if="storedAvatar(acc.email)" :src="storedAvatar(acc.email)" class="opt-avatar-img"/>
                      <span v-else>{{ (acc.name || acc.email || '?')[0].toUpperCase() }}</span>
                    </div>
                    <div class="sender-opt-info">
                      <span class="sender-opt-name" v-if="acc.name">{{ acc.name }}</span>
                      <span class="sender-opt-email">{{ acc.email }}</span>
                    </div>
                    <Icon v-if="acc.accountId === form.accountId"
                          icon="psg:check-circle" width="14" height="14" class="sender-opt-check"/>
                  </div>
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
        <div class="wh-actions">
          <button type="button" class="wh-action-btn"
                  :title="windowState === 'minimized' ? $t('expand') : $t('minimize')"
                  :aria-label="windowState === 'minimized' ? $t('expand') : $t('minimize')"
                  @click.stop="toggleMinimize">
            <Icon icon="psg:minimize" width="15" height="15"/>
          </button>
          <button type="button" class="wh-action-btn"
                  :title="windowState === 'maximized' ? $t('restore') : $t('maximize')"
                  :aria-label="windowState === 'maximized' ? $t('restore') : $t('maximize')"
                  @click.stop="toggleMaximize">
            <Icon :icon="windowState === 'maximized' ? 'psg:restore' : 'psg:maximize'" width="14" height="14"/>
          </button>
          <button type="button" class="wh-action-btn wh-close" :title="$t('close')"
                  :aria-label="$t('close')" @click.stop="close">
            <Icon icon="psg:close" width="15" height="15"/>
          </button>
        </div>
      </div>

      <!-- ── Fields ─────────────────────────────── -->
      <div class="container">

        <!-- To -->
        <div class="field-row">
          <span class="field-label">{{ $t('recipient') }}</span>
          <el-input-tag class="field-tag" @add-tag="addTagChange" tag-type="primary"
                        @input="inputChange" size="default" v-model="form.receiveEmail">
            <template #prefix>
              <el-select ref="mySelect" class="write-select" popper-class="write-select"
                         :show-arrow="false" :no-match-text="' '" :no-data-text="' '"
                         @visible-change="selectStatusChange" @change="selectChange">
                <el-option v-for="item in selectRecipientList" :key="item"
                           :label="item" :value="item" style="color:#999"/>
              </el-select>
            </template>
          </el-input-tag>
          <div class="field-actions">
            <span v-if="!showCc"  class="field-toggle" @click.stop="showCc = true">{{ $t('cc') }}</span>
            <span v-if="!showBcc" class="field-toggle" @click.stop="showBcc = true">{{ $t('bcc') }}</span>
            <button type="button" class="icon-btn-sm" :title="$t('recentContacts')"
                    :aria-label="$t('recentContacts')" @click.stop="openContacts">
              <Icon icon="psg:user-plus" width="14" height="14"/>
            </button>
          </div>
        </div>

        <!-- Cc -->
        <div class="field-row" v-show="showCc">
          <span class="field-label">{{ $t('cc') }}</span>
          <el-input-tag ref="ccTagRef" class="field-tag" v-model="form.cc" tag-type="primary"
                        @add-tag="addCcTag" @input="v => ccPending = v" size="default"/>
        </div>

        <!-- Bcc -->
        <div class="field-row" v-show="showBcc">
          <span class="field-label">{{ $t('bcc') }}</span>
          <el-input-tag ref="bccTagRef" class="field-tag" v-model="form.bcc" tag-type="primary"
                        @add-tag="addBccTag" @input="v => bccPending = v" size="default"/>
        </div>

        <!-- Subject -->
        <div class="field-row subject-row">
          <el-input class="subject-input" v-model="form.subject"
                    :placeholder="t('subject')" />
        </div>

        <!-- Editor -->
        <div class="editor-wrap">
          <tinyEditor :def-value="defValue" ref="editor" radius="var(--compose-radius)"
                      @change="change" @focus="focusChange" />
        </div>

        <!-- Toolbar -->
        <div class="toolbar-bar">
          <div class="toolbar-left">
            <el-popover v-model:visible="aiPopoverOpen" placement="top-start" width="230"
                        trigger="click" popper-class="compose-ai-popper">
              <div class="compose-ai-actions">
                <button v-for="action in aiActions" :key="action.value" type="button" @click="runComposeAi(action.value)">
                  <Icon icon="lucide:sparkles" width="14" height="14" /> {{ t(action.labelKey) }}
                </button>
              </div>
              <template #reference>
                <button type="button" class="tb-btn tb-btn--label compose-ai-trigger" :aria-label="$t('aiTransform')">
                  <Icon icon="lucide:sparkles" width="16" height="16"/><span>{{ $t('aiTransform') }}</span>
                </button>
              </template>
            </el-popover>
            <div class="tb-btn tb-btn--label" @click="chooseFile">
              <Icon icon="psg:paperclip" width="16" height="16"/>
              <span>{{ $t('attachments') }}</span>
            </div>
            <button type="button" class="tb-btn" @click="clearContent" :title="$t('clear')"
                    :aria-label="$t('clear')">
              <Icon icon="psg:eraser" width="17" height="17"/>
            </button>
            <el-dropdown trigger="click" @command="insertTemplate" :hide-on-click="true"
                         popper-class="write-template-dropdown">
              <div class="tb-btn tb-btn--label">
                <Icon icon="psg:template" width="16" height="16"/>
                <span>{{ $t('insertTemplate') }}</span>
              </div>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item v-if="!templatesList.length" disabled>{{ $t('noTemplates') }}</el-dropdown-item>
                  <el-dropdown-item v-for="tpl in templatesList" :key="tpl.templateId" :command="tpl">
                    {{ tpl.name }}
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
            <div class="att-list">
              <div class="att-item" v-for="(item,index) in form.attachments" :key="index">
                <Icon v-bind="getIconByName(item.filename)" width="14" height="14"/>
                <span class="att-filename">{{ item.filename }}</span>
                <span class="att-size">{{ formatBytes(item.size) }}</span>
                <Icon icon="psg:close-circle" width="16" height="16"
                      style="cursor:pointer;flex-shrink:0" @click="delAtt(index)"/>
              </div>
            </div>
          </div>
          <div class="toolbar-right">
            <div v-if="showSchedulePicker" class="schedule-panel" role="dialog"
                 :aria-label="$t('sendLater')"
                 @touchstart.passive="scheduleTouchStart"
                 @touchmove="scheduleTouchMove"
                 @touchend="scheduleTouchEnd">
              <div class="schedule-panel-header">
                <span class="mobile-sheet-handle" aria-hidden="true"></span>
                <div class="schedule-panel-title">
                  <span class="schedule-panel-icon">
                    <Icon icon="psg:clock" width="16" height="16"/>
                  </span>
                  <span>
                    <strong>{{ $t('sendLater') }}</strong>
                    <small>{{ $t('schedulePanelHint') }}</small>
                  </span>
                </div>
                <button type="button" class="schedule-panel-close"
                        :aria-label="$t('cancel')" @click="cancelSchedulePicker">
                  <Icon icon="psg:close" width="15" height="15"/>
                </button>
              </div>

              <div class="schedule-panel-section">
                <div class="schedule-panel-label">{{ $t('scheduleQuick') }}</div>
                <div class="schedule-quick-grid">
                  <button v-for="preset in schedulePresets" :key="preset.value"
                          type="button" class="schedule-quick-btn"
                          :class="{ 'is-active': isSchedulePresetActive(preset.value) }"
                          :aria-pressed="isSchedulePresetActive(preset.value)"
                          @click="applySchedulePreset(preset.value)">
                    {{ $t(preset.labelKey) }}
                  </button>
                </div>
              </div>

              <div class="schedule-panel-section schedule-panel-custom">
                <div class="schedule-panel-label-row">
                  <span class="schedule-panel-label">{{ $t('scheduleFor') }}</span>
                  <span class="schedule-panel-timezone">{{ scheduleTimezone }}</span>
                </div>
                <el-date-picker
                  v-model="scheduledAt"
                  type="datetime"
                  :placeholder="$t('scheduleFor')"
                  format="YYYY-MM-DD HH:mm"
                  value-format="YYYY-MM-DD HH:mm:ss"
                  :disabled-date="isScheduleDateDisabled"
                  size="default"
                  class="schedule-picker"
                  popper-class="schedule-datetime-popper"
                />
              </div>

              <div class="schedule-panel-footer">
                <span class="schedule-panel-note">
                  <Icon icon="psg:clock" width="13" height="13"/>
                  {{ scheduleTimezone }}
                </span>
                <div class="schedule-panel-actions">
                  <el-button class="schedule-cancel-btn" @click="cancelSchedulePicker">
                    {{ $t('cancel') }}
                  </el-button>
                  <el-button class="schedule-confirm-btn" type="primary"
                             @click="sendScheduled" :disabled="!scheduledAt">
                    {{ $t('scheduleConfirmBtn') }}
                  </el-button>
                </div>
              </div>
            </div>

            <el-tooltip :content="$t('sendLater')" placement="top" :disabled="showSchedulePicker">
              <el-button class="send-later-btn" :class="{ 'is-active': showSchedulePicker }"
                         :aria-label="$t('sendLater')" :aria-expanded="showSchedulePicker"
                         @click="toggleSchedulePicker">
                <Icon icon="psg:clock" width="16" height="16"/>
                <span class="send-later-label">{{ $t('sendLater') }}</span>
              </el-button>
            </el-tooltip>
            <el-button class="send-btn" type="primary" @click="sendEmail">
              <Icon icon="psg:send" width="15" height="15" style="margin-right:6px"/>
              <span v-if="form.sendType === 'reply'">{{ $t('reply') }}</span>
              <span v-else-if="form.sendType === 'forward'">{{ $t('forward') }}</span>
              <span v-else>{{ $t('send') }}</span>
            </el-button>
          </div>
        </div>

      </div>
    </div>
    <el-dialog v-model="aiPreviewOpen" :title="$t('aiTransformPreview')" width="520px" class="compose-ai-dialog">
      <div class="compose-ai-preview">{{ aiPreviewText }}</div>
      <template #footer>
        <el-button @click="aiPreviewOpen = false">{{ $t('cancel') }}</el-button>
        <el-button type="primary" @click="replaceAiSelection">{{ $t('aiReplaceSelection') }}</el-button>
      </template>
    </el-dialog>
    <el-dialog top="10vh" v-model="showContacts" @closed="clearSelectContact"
               @touchstart.passive="contactsTouchStart"
               @touchmove="contactsTouchMove"
               @touchend="contactsTouchEnd"
               :title="t('recentContacts')" width="480" class="contacts-dialog">
      <el-tabs v-model="contactTab" @tab-change="onTabChange" class="contacts-tabs">

        <!-- Recent contacts -->
        <el-tab-pane :label="t('recentTab')" name="recent">
          <el-table ref="contactsTabRef" row-key="email" :data="contacts" style="height: 380px">
            <el-table-column type="selection" width="32" />
            <el-table-column property="email" :label="t('emailAccount')">
              <template #default="props">
                <div class="email-row">{{ props.row.email }}</div>
              </template>
            </el-table-column>
            <el-table-column width="44">
              <template #default>
                <Icon icon="psg:user" width="20" height="20" style="color:var(--psg-text-secondary)"/>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <!-- Internal directory -->
        <el-tab-pane :label="t('internalDirectory')" name="directory">
          <el-input
            v-model="directorySearch"
            :placeholder="t('directorySearch')"
            clearable
            style="margin-bottom:8px"
          >
            <template #prefix><Icon icon="psg:search" width="15" height="15"/></template>
          </el-input>
          <el-table
            ref="directoryTabRef"
            row-key="email"
            :data="filteredDirectory"
            v-loading="directoryLoading"
            style="height:340px"
          >
            <el-table-column type="selection" width="32" />
            <el-table-column :label="t('username')" width="130">
              <template #default="{ row }">
                <span class="dir-name">{{ row.name || '—' }}</span>
              </template>
            </el-table-column>
            <el-table-column :label="t('emailAccount')">
              <template #default="{ row }">
                <span class="email-row">{{ row.email }}</span>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <!-- Contact groups tab -->
        <el-tab-pane :label="$t('contactGroups')" name="groups">
          <div v-if="!groupsList.length" class="notif-empty" style="padding:20px 0">
            <el-empty :image-size="56" :description="$t('noGroups')"/>
          </div>
          <div v-else style="display:flex;flex-direction:column;gap:6px;height:380px;overflow-y:auto;padding:4px 0">
            <div v-for="g in groupsList" :key="g.groupId"
                 style="display:flex;align-items:center;justify-content:space-between;padding:8px 2px;border-bottom:1px solid var(--psg-border)">
              <div>
                <div style="font-weight:600;font-size:13px">{{ g.name }}</div>
                <div style="font-size:11.5px;color:var(--psg-text-secondary)">{{ g.contacts.map(c => c.name || c.email).join(', ') }}</div>
              </div>
              <el-button size="small" type="primary" @click="insertGroup(g)">{{ $t('insertGroup') }}</el-button>
            </div>
          </div>
        </el-tab-pane>

      </el-tabs>

      <div class="contacts-bottom">
        <el-button v-if="contactTab === 'recent'" type="default" @click="deleteContact">{{ t('clear') }}</el-button>
        <el-button type="primary" @click="chooseContact">{{ t('selectContacts') }}</el-button>
      </div>
    </el-dialog>
  </div>
</template>
<script setup>
import tinyEditor from '@/components/tiny-editor/index.vue'
import {h, nextTick, onMounted, onUnmounted, reactive, ref, toRaw, computed, watch} from "vue";
import {Icon} from "@iconify/vue";
import {useUserStore} from "@/store/user.js";
import {emailSend, emailSchedule, emailScheduleCancel} from "@/request/email.js";
import {useUiStore} from "@/store/ui.js";
import {isEmail} from "@/utils/verify-utils.js";
import {useAccountStore} from "@/store/account.js";
import {useEmailStore} from "@/store/email.js";
import {fileToBase64, formatBytes} from "@/utils/file-utils.js";
import {getIconByName} from "@/utils/icon-utils.js";
import sendPercent from "@/components/send-percent/index.vue"
import {toOssDomain} from "@/utils/convert.js";
import {formatDetailDate} from "@/utils/day.js";
import {useSettingStore} from "@/store/setting.js";
import {avatarBg, storedAvatar} from "@/utils/avatar.js";
import {userDraftStore} from "@/store/draft.js";
import {useWriterStore} from "@/store/writer.js";
import db from "@/db/db.js";
import dayjs from "dayjs";
import {useI18n} from "vue-i18n";
import router from "@/router/index.js";
import {ElMessageBox} from "element-plus";
import {ElMessage} from "element-plus";
import {getDirectory} from "@/request/my.js";
import {templateList} from "@/request/template.js";
import {contactGroupList} from "@/request/contact-group.js";
import {accountList} from "@/request/account.js";
import {aiComposeTransform} from "@/request/ai-mail.js";
import {useMobileNavigationStore} from "@/store/mobile-navigation.js";

defineExpose({
  open,
  openWithTemplate,
  openReply,
  openReplyAll,
  openForward,
  openDraft,
  openScheduled,
  requestMobileBack: () => close(),
})

const {t} = useI18n()
const writerStore = useWriterStore();
const draftStore = userDraftStore()
const settingStore = useSettingStore()
const uiStore = useUiStore()
const mobileNavigation = useMobileNavigationStore()
const emailStore = useEmailStore();
const accountStore = useAccountStore()
const editor = ref({})
const userStore = useUserStore();
const show = ref(false);
const windowState = ref('normal'); // 'normal' | 'minimized' | 'maximized'
function toggleMinimize() {
  windowState.value = windowState.value === 'minimized' ? 'normal' : 'minimized'
}
function toggleMaximize() {
  windowState.value = windowState.value === 'maximized' ? 'normal' : 'maximized'
}

// ── Draggable compose window (desktop only — .send docks it bottom-right
// by default via flex alignment; this just adds a transform offset on top
// of that, same "offset from a fixed base" approach as layout/index.vue's
// pane-divider drag). Disabled while minimized, where the header's click
// handler above owns restoring instead. ──────────────────────────────────
const writeBoxRef = ref(null)
const dragOffset = reactive({ x: 0, y: 0 })
let dragStartX = 0
let dragStartY = 0
let dragStartOffsetX = 0
let dragStartOffsetY = 0
let dragBaseRect = null

function startDrag(e) {
  if (windowState.value === 'minimized') return
  if (window.innerWidth < 768) return
  if (e.target.closest('button, .el-dropdown, .wh-sender')) return
  const box = writeBoxRef.value
  if (!box) return
  const rect = box.getBoundingClientRect()
  dragBaseRect = { left: rect.left - dragOffset.x, top: rect.top - dragOffset.y, width: rect.width, height: rect.height }
  dragStartX = e.clientX
  dragStartY = e.clientY
  dragStartOffsetX = dragOffset.x
  dragStartOffsetY = dragOffset.y
  document.body.style.userSelect = 'none'
  window.addEventListener('mousemove', onDrag)
  window.addEventListener('mouseup', stopDrag)
}

function onDrag(e) {
  if (!dragBaseRect) return
  const nextX = dragStartOffsetX + (e.clientX - dragStartX)
  const nextY = dragStartOffsetY + (e.clientY - dragStartY)
  // Keep at least `margin` px of the box reachable on every edge, so it
  // can never be dragged fully off-screen and lost.
  const margin = 40
  const minX = margin - (dragBaseRect.left + dragBaseRect.width)
  const maxX = window.innerWidth - margin - dragBaseRect.left
  const minY = margin - (dragBaseRect.top + dragBaseRect.height)
  const maxY = window.innerHeight - margin - dragBaseRect.top
  dragOffset.x = Math.min(maxX, Math.max(minX, nextX))
  dragOffset.y = Math.min(maxY, Math.max(minY, nextY))
}

function stopDrag() {
  dragBaseRect = null
  document.body.style.userSelect = ''
  window.removeEventListener('mousemove', onDrag)
  window.removeEventListener('mouseup', stopDrag)
}
const showCc = ref(false);
const showBcc = ref(false);
const percent = ref(0)
let percentMessage = null
let sending = false
const defValue = ref('')
const contactsTabRef = ref({})
const directoryTabRef = ref({})
const showContacts = ref(false)
let contactsTouchStartY = 0
let contactsTouchDeltaY = 0
let contactsDragging = false
const templatesList = ref([])
const contactTab = ref('recent')
const groupsList = ref([])
const groupsLoaded = ref(false)
const directoryList = ref([])
const directorySearch = ref('')
const directoryLoading = ref(false)
const directoryLoaded = ref(false)
const senderAccounts = ref([])
const senderLoaded = ref(false)
const showSchedulePicker = ref(false)
let scheduleTouchStartY = 0
let scheduleTouchDeltaY = 0
let scheduleDragging = false
const scheduledAt = ref('')
const aiPopoverOpen = ref(false)
const aiPreviewOpen = ref(false)
const aiPreviewText = ref('')
const aiSelectionText = ref('')
const aiActions = [
  { value: 'translate_zh', labelKey: 'aiTranslateZh' },
  { value: 'translate_en', labelKey: 'aiTranslateEn' },
  { value: 'rewrite', labelKey: 'aiPolish' },
  { value: 'formal', labelKey: 'aiFormal' },
  { value: 'concise', labelKey: 'aiConcise' },
  { value: 'grammar', labelKey: 'aiGrammar' },
]

watch(show, (open) => {
  if (open && window.innerWidth <= 1024) {
    mobileNavigation.openLayer('compose', () => close() === true)
  } else if (!open) {
    mobileNavigation.closeLayer('compose')
  }
})

function watchMobileSubLayer(source, key, close) {
  watch(source, (open) => {
    if (typeof window === 'undefined' || window.innerWidth > 1024) return
    if (open) {
      mobileNavigation.openLayer(key, () => {
        close()
        return true
      })
    } else {
      mobileNavigation.closeLayer(key)
    }
  })
}

watchMobileSubLayer(showContacts, 'compose-contacts', () => { showContacts.value = false })
watchMobileSubLayer(showSchedulePicker, 'compose-schedule', cancelSchedulePicker)
watchMobileSubLayer(aiPopoverOpen, 'compose-ai-menu', () => { aiPopoverOpen.value = false })
watchMobileSubLayer(aiPreviewOpen, 'compose-ai-preview', () => { aiPreviewOpen.value = false })

function escapeEditorText(value) {
  return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')
}

async function runComposeAi(operation) {
  const selectedText = editor.value?.getSelectedText?.() || ''
  const selectedHtml = editor.value?.getSelectedContent?.() || ''
  if (!selectedText.trim()) {
    ElMessage({ message: t('aiNoSelection'), type: 'warning', plain: true })
    return
  }
  aiPopoverOpen.value = false
  aiSelectionText.value = selectedText
  try {
    const data = await aiComposeTransform({ operation, text: selectedText, html: selectedHtml })
    aiPreviewText.value = data?.resultText || ''
    if (aiPreviewText.value) aiPreviewOpen.value = true
  } catch (error) {
    ElMessage({ message: error?.message || t('aiAssistantFail'), type: 'error', plain: true })
  }
}

function replaceAiSelection() {
  if (!aiPreviewText.value) return
  editor.value?.replaceSelection?.(escapeEditorText(aiPreviewText.value))
  aiPreviewOpen.value = false
}
const scheduleTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
const schedulePresets = [
  { value: 'nextHour', labelKey: 'scheduleNextHour' },
  { value: 'tomorrowMorning', labelKey: 'scheduleTomorrowMorning' },
  { value: 'nextWorkday', labelKey: 'scheduleNextWorkday' },
]

function schedulePresetDate(value) {
  const now = dayjs()
  if (value === 'tomorrowMorning') {
    return now.add(1, 'day').hour(9).minute(0).second(0).millisecond(0)
  }
  if (value === 'nextWorkday') {
    let date = now.add(1, 'day').hour(9).minute(0).second(0).millisecond(0)
    while (date.day() === 0 || date.day() === 6) date = date.add(1, 'day')
    return date
  }
  return now.add(1, 'hour').startOf('hour')
}

function applySchedulePreset(value) {
  scheduledAt.value = schedulePresetDate(value).format('YYYY-MM-DD HH:mm:ss')
}

function isSchedulePresetActive(value) {
  return scheduledAt.value === schedulePresetDate(value).format('YYYY-MM-DD HH:mm:ss')
}

function openSchedulePicker() {
  if (!scheduledAt.value) applySchedulePreset('nextHour')
  showSchedulePicker.value = true
}

function toggleSchedulePicker() {
  if (showSchedulePicker.value) {
    showSchedulePicker.value = false
    return
  }
  openSchedulePicker()
}

// On touch devices the schedule controls behave like a bottom sheet. Only
// the sheet header/handle owns the vertical gesture so date inputs and quick
// action buttons keep their native scrolling and tapping behavior.
function scheduleTouchStart(event) {
  if (typeof window === 'undefined' || window.innerWidth > 767) return
  if (!event.target?.closest?.('.schedule-panel-header')) return
  scheduleTouchStartY = event.touches?.[0]?.clientY ?? 0
  scheduleTouchDeltaY = 0
  scheduleDragging = true
}

function scheduleTouchMove(event) {
  if (!scheduleDragging) return
  const currentY = event.touches?.[0]?.clientY ?? scheduleTouchStartY
  scheduleTouchDeltaY = Math.max(0, currentY - scheduleTouchStartY)
  if (scheduleTouchDeltaY > 0) {
    event.preventDefault()
    const panel = event.currentTarget
    if (panel) panel.style.transform = `translateY(${Math.min(scheduleTouchDeltaY, 180)}px)`
  }
}

function scheduleTouchEnd() {
  if (!scheduleDragging) return
  const shouldClose = scheduleTouchDeltaY > 76
  scheduleDragging = false
  scheduleTouchDeltaY = 0
  const panel = document.querySelector('.schedule-panel')
  if (panel) panel.style.transform = ''
  if (shouldClose) cancelSchedulePicker()
}

function cancelSchedulePicker() {
  showSchedulePicker.value = false
  scheduledAt.value = ''
}

function isScheduleDateDisabled(date) {
  return dayjs(date).isBefore(dayjs().startOf('day'))
}

const filteredDirectory = computed(() => {
  const q = directorySearch.value.trim().toLowerCase()
  if (!q) return directoryList.value
  return directoryList.value.filter(u =>
    u.email.toLowerCase().includes(q) ||
    (u.name || '').toLowerCase().includes(q)
  )
})
const mySelect = ref()
let selectStatus = false
const backReply = reactive({
  receiveEmail: [],
  subject: '',
  content: '',
  sendType: ''
})
const form = reactive({
  sendEmail: '',
  receiveEmail: [],
  cc: [],
  bcc: [],
  accountId: -1,
  name: '',
  subject: '',
  content: '',
  sendType: '',
  text: '',
  emailId: 0,
  attachments: [],
  draftId: null,
})

const selectRecipientList = ref([])

// Track unconfirmed text in CC / BCC input-tag fields
const ccPending  = ref('')
const bccPending = ref('')

// Commit any pending (unconfirmed) text before sending
function commitPendingInputs() {
  if (ccPending.value.trim()) {
    const emails = ccPending.value.split(/[,，\s]+/).map(e => e.trim()).filter(e => e)
    emails.forEach(e => {
      if (isEmail(e) && !form.cc.includes(e)) form.cc.push(e)
    })
    ccPending.value = ''
  }
  if (bccPending.value.trim()) {
    const emails = bccPending.value.split(/[,，\s]+/).map(e => e.trim()).filter(e => e)
    emails.forEach(e => {
      if (isEmail(e) && !form.bcc.includes(e)) form.bcc.push(e)
    })
    bccPending.value = ''
  }
}

const senderInitial = computed(() => {
  const name = form.name?.trim()
  if (name) return name[0].toUpperCase()
  return form.sendEmail?.[0]?.toUpperCase() || '?'
})

// avatar of the currently selected sender account (switches on account change)
const currentSenderAvatar = computed(() => {
  // Try the specific sender account's avatar, then fall back to the logged-in user's avatar
  const primary = userStore.user?.email
  if (form.sendEmail === primary) return userStore.avatar
  return storedAvatar(form.sendEmail) || userStore.avatar
})

const contacts = computed(() => writerStore.sendRecipientRecord.map(item => ({email: item})))

function openContacts() {
  showContacts.value = true
  nextTick(() => {
    form.receiveEmail.forEach(item => {
      if (writerStore.sendRecipientRecord.includes(item)) {
        contactsTabRef.value.toggleRowSelection({email: item});
      }
    })
  })
}

function contactsTouchStart(event) {
  if (typeof window === 'undefined' || window.innerWidth > 767) return
  if (!event.target?.closest?.('.el-dialog__header')) return
  contactsTouchStartY = event.touches?.[0]?.clientY ?? 0
  contactsTouchDeltaY = 0
  contactsDragging = true
}

function contactsTouchMove(event) {
  if (!contactsDragging) return
  const currentY = event.touches?.[0]?.clientY ?? contactsTouchStartY
  contactsTouchDeltaY = Math.max(0, currentY - contactsTouchStartY)
  if (contactsTouchDeltaY > 0) {
    event.preventDefault()
    const panel = document.querySelector('.contacts-dialog')
    if (panel) panel.style.transform = `translateY(${Math.min(contactsTouchDeltaY, 180)}px)`
  }
}

function contactsTouchEnd() {
  if (!contactsDragging) return
  const shouldClose = contactsTouchDeltaY > 76
  contactsDragging = false
  contactsTouchDeltaY = 0
  const panel = document.querySelector('.contacts-dialog')
  if (panel) panel.style.transform = ''
  if (shouldClose) showContacts.value = false
}

function deleteContact() {
  ElMessageBox.confirm(t('confirmDeletionOfContacts'), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {
    const contactList = contactsTabRef.value.getSelectionRows().map(item => item.email);
    form.receiveEmail = form.receiveEmail.filter(item => !contactList.includes(item));
    writerStore.sendRecipientRecord = writerStore.sendRecipientRecord.filter(item => !contactList.includes(item));
  })
}

async function onTabChange(tab) {
  if (tab === 'directory' && !directoryLoaded.value) {
    directoryLoading.value = true
    try {
      directoryList.value = await getDirectory()
      directoryLoaded.value = true
    } finally {
      directoryLoading.value = false
    }
  }
  if (tab === 'groups' && !groupsLoaded.value) {
    try {
      groupsList.value = await contactGroupList()
      groupsLoaded.value = true
    } catch {}
  }
}

function insertGroup(g) {
  g.contacts.forEach(c => {
    if (c.email && !form.receiveEmail.includes(c.email)) form.receiveEmail.push(c.email)
  })
  showContacts.value = false
}

function chooseContact() {
  const tableRef = contactTab.value === 'directory' ? directoryTabRef.value : contactsTabRef.value
  const selected = tableRef.getSelectionRows().map(item => item.email)

  selected.forEach(email => {
    if (!form.receiveEmail.includes(email)) form.receiveEmail.push(email)
  })

  if (contactTab.value === 'recent') {
    form.receiveEmail = form.receiveEmail.filter(item =>
      selected.includes(item) || !writerStore.sendRecipientRecord.includes(item)
    )
  }

  showContacts.value = false
}

function clearSelectContact() {
  contactsTabRef.value?.clearSelection?.()
  directoryTabRef.value?.clearSelection?.()
  contactTab.value = 'recent'
  directorySearch.value = ''
}

function selectChange(value) {
  form.receiveEmail.push(value)
}

function selectStatusChange(status) {
  selectStatus = status
}

const openSelect = () => {
  mySelect.value.toggleMenu()
}

function inputChange(value) {

  selectRecipientList.value = writerStore.sendRecipientRecord.filter(item => value && !form.receiveEmail.includes(item) && item.startsWith(value)).slice(0, 10);

  if (!selectStatus && selectRecipientList.value.length > 0) {
    openSelect()
  }

  if (selectStatus && selectRecipientList.value.length === 0) {
    openSelect()
  }

}

function addTagChange(val) {

  const emails = Array.from(new Set(
      val.split(/[,，]/).map(item => item.trim()).filter(item => item)
  ));

  form.receiveEmail.splice(form.receiveEmail.length - 1, 1)

  let has = false
  emails.forEach(email => {
    if (isEmail(email) && !form.receiveEmail.includes(email)) {
      form.receiveEmail.push(email)
      has = true
    }
  })
  if (selectStatus && has) openSelect()
}

function clearContent() {
  ElMessageBox.confirm(t('clearContentConfirm'), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {
    resetForm()
  })

}

function delAtt(index) {
  form.attachments.splice(index, 1);
}

function chooseFile() {
  const doc = document.createElement("input")
  doc.setAttribute("type", "file")
  doc.multiple = true;
  doc.click()
  doc.onchange = async (e) => {

    const fileList = e.target.files;

    for (const file of fileList) {

      const size = file.size
      const filename = file.name
      const contentType = file.type

      const content = await fileToBase64(file)
      form.attachments.push({content, filename, size, contentType})

    }

  }
}

// Shared by sendEmail() and sendScheduled() — returns false (and shows the
// relevant message) if the form isn't ready to leave Compose at all, real
// send or scheduled.
function validateBeforeSend() {
  // Commit any text typed but not yet confirmed as a tag (user skipped pressing Enter)
  commitPendingInputs()

  if (form.receiveEmail.length === 0) {
    ElMessage({ message: t('emptyRecipientMsg'), type: 'error', plain: true })
    return false
  }

  if (!form.subject) {
    ElMessage({ message: t('emptySubjectMsg'), type: 'error', plain: true })
    return false
  }

  if (!form.content) {
    try { form.content = editor.value.getContent() } catch {}
  }

  if (!form.content) {
    ElMessage({ message: t('emptyContentMsg'), type: 'error', plain: true })
    return false
  }

  if (form.manyType === 'divide' && form.attachments.length > 0) {
    ElMessage({ message: t('noSeparateSendMsg'), type: 'error', plain: true })
    return false
  }

  return true
}

// Real server-side scheduling — POSTs to /email/schedule, which persists the
// full send payload and a cron dispatches it later (mail-worker/src/service/
// scheduled-email-service.js). This used to just call sendEmail() straight
// away, silently ignoring the chosen time and sending immediately.
async function sendScheduled() {
  if (!scheduledAt.value) return
  if (dayjs(scheduledAt.value).isBefore(dayjs())) {
    ElMessage({ message: t('schedulePastMsg'), type: 'error', plain: true })
    return
  }
  if (!validateBeforeSend()) return

  if (sending) {
    ElMessage({ message: t('sendingErrorMsg'), type: 'error', plain: true })
    return
  }

  sending = true
  try {
    await emailSchedule({
      ...toRaw(form),
      scheduledAt: scheduledAt.value,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    })
    ElNotification({
      title: t('scheduleSuccessMsg'),
      type: 'success',
      message: h('span', { style: 'color: teal' }, form.subject),
      position: 'bottom-right',
    })
    show.value = false
    resetForm()
  } catch (e) {
    ElNotification({
      title: t('scheduleFailMsg'),
      type: 'error',
      message: h('span', { style: 'color: teal' }, e.message || ''),
      position: 'bottom-right',
    })
  } finally {
    sending = false
  }
}

// Undo Send: reuses the exact same server-side scheduled_email queue as
// Scheduled Send (see mail-worker/src/service/scheduled-email-service.js —
// create() arms a precise short-delay dispatch under its
// FAST_PATH_THRESHOLD_MS, with the once-a-minute cron as a backstop), just
// with a short delay (uiStore.undoSendSeconds) instead of a user-picked
// future date. This is NOT a frontend setTimeout — the delayed delivery
// keeps happening server-side even if this tab/app closes; only the "Undo"
// button itself is naturally client-only (there's nothing to undo once the
// tab that could show it is gone, but the send still completing without an
// Undo option available is correct, not a bug).
async function sendWithUndo() {
  sending = true
  const snapshot = { ...toRaw(form) }
  const scheduledAt = new Date(Date.now() + uiStore.undoSendSeconds * 1000)
    .toISOString().slice(0, 19).replace('T', ' ')

  let scheduleId = null
  try {
    const created = await emailSchedule({
      ...snapshot,
      scheduledAt,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    })
    scheduleId = created.id
  } catch (e) {
    ElNotification({
      title: t('sendFailMsg'),
      type: 'error',
      message: h('span', { style: 'color: teal' }, e.message || ''),
      position: 'bottom-right',
    })
    sending = false
    return
  }

  show.value = false
  resetForm()
  sending = false

  let undone = false
  const notif = ElNotification({
    title: t('messageSending'),
    duration: uiStore.undoSendSeconds * 1000 + 500,
    position: 'bottom-right',
    message: () => h('div', { style: 'display:flex;align-items:center;gap:14px;justify-content:space-between' }, [
      h('span', { style: 'color:teal;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, snapshot.subject || t('noSubject')),
      h('button', {
        style: 'color:var(--psg-primary);background:none;border:none;cursor:pointer;font-weight:700;flex-shrink:0;font-size:13px',
        onClick: async () => {
          if (undone) return
          undone = true
          notif.close()
          try {
            await emailScheduleCancel(scheduleId)
            Object.assign(form, snapshot)
            defValue.value = ''
            setTimeout(() => { defValue.value = form.content })
            show.value = true
            ElMessage({ message: t('undoRestoredMsg'), type: 'success', plain: true })
          } catch (e) {
            // Already sent (fast path won the race against the click) — nothing to undo.
            ElMessage({ message: t('scheduledCancelFail'), type: 'error', plain: true })
          }
        },
      }, t('undo')),
    ]),
  })
}

async function sendEmail() {

  if (!validateBeforeSend()) return

  if (sending) {
    ElMessage({
      message: t('sendingErrorMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  if (uiStore.undoSendSeconds > 0) {
    await sendWithUndo()
    return
  }

  percentMessage = ElMessage({
    message: () => h(sendPercent, {value: percent.value, desc: t('sending')}),
    dangerouslyUseHTMLString: true,
    plain: true,
    duration: 0,
    customClass: 'message-bottom'
  })

  sending = true

  show.value = false

  emailSend(form, (e) => {
    percent.value = Math.round((e.loaded * 98) / e.total)
  }).then(emailList => {
    const email = emailList[0]
    emailList.forEach(item => {
      emailStore.sendScroll?.addItem(item)
    })

    ElNotification({
      title: t('sendSuccessMsg'),
      type: "success",
      message: h('span', {style: 'color: teal'}, email.subject),
      position: 'bottom-right'
    })

    userStore.refreshUserInfo();

    addRecipientRecord();

    if (form.draftId) {
      form.subject = ''
      form.content = ''
      form.receiveEmail = []
      draftStore.setDraft = {...toRaw(form)}
    }

    show.value = false
    resetForm();
  }).catch((e) => {
    ElNotification({
      title: t('sendFailMsg'),
      type: e.code === 403 ? 'warning' : 'error',
      message: h('span', {style: 'color: teal'}, e.message),
      position: 'bottom-right'
    })
    if (e.code === 401) {
      localStorage.removeItem('token');
      router.replace('/login');
    }
    show.value = true
    addRecipientRecord();
  }).finally(() => {
    percentMessage.close()
    percent.value = 0
    sending = false
  })
}

function addRecipientRecord() {
  writerStore.sendRecipientRecord = writerStore.sendRecipientRecord.filter(
      email => !form.receiveEmail.includes(email)
  );

  writerStore.sendRecipientRecord.unshift(...form.receiveEmail);
  writerStore.sendRecipientRecord = writerStore.sendRecipientRecord.slice(0, 500);
}

function resetForm() {
  form.receiveEmail = []
  form.cc = []
  form.bcc = []
  ccPending.value = ''
  bccPending.value = ''
  form.subject = ''
  form.content = ''
  form.manyType = null
  form.attachments = []
  form.sendType = ''
  form.emailId = 0
  form.draftId = null
  showCc.value = false
  showBcc.value = false
  backReply.content = ''
  backReply.subject = ''
  backReply.receiveEmail = []
  backReply.sendType = ''
  showSchedulePicker.value = false
  scheduledAt.value = ''
  editor.value.clearEditor()
}

function addCcTag(val) {
  const emails = val.split(/[,，]/).map(e => e.trim()).filter(e => e)
  form.cc.splice(form.cc.length - 1, 1)
  emails.forEach(email => {
    if (isEmail(email) && !form.cc.includes(email)) form.cc.push(email)
  })
}

function addBccTag(val) {
  const emails = val.split(/[,，]/).map(e => e.trim()).filter(e => e)
  form.bcc.splice(form.bcc.length - 1, 1)
  emails.forEach(email => {
    if (isEmail(email) && !form.bcc.includes(email)) form.bcc.push(email)
  })
}

function change(content, text) {
  form.content = content;
  form.text = text
}

function focusChange() {
  if (selectStatus) openSelect()
}

function sigBlock() {
  const sig = userStore.user.signature
  return sig ? `<p><br></p><p style="color:#999;margin-top:0">-- </p>${sig}` : ''
}

function openForward(email) {
  resetForm();

  email.subject = email.subject || ''

  form.subject = email.subject
  form.sendType = 'forward'

  defValue.value = ''

  setTimeout(() => {
    defValue.value = `
      ${sigBlock()}
      <p><br></p>
      ${formatImage(email.content) || `<pre style="font-family: inherit;word-break: break-word;white-space: pre-wrap;margin: 0">${email.text}</pre>`}
    `
    _showWindow()

    nextTick(() => {
      backReply.content = editor.value.getContent()
      backReply.subject = form.subject
      backReply.receiveEmail = form.receiveEmail
      backReply.sendType = form.sendType
    })

  });
}

function openReplyAll(email) {
  resetForm()
  email.subject = email.subject || ''

  // reply to original sender
  form.receiveEmail.push(email.sendEmail)

  // also add all original recipients except our own send address
  const selfEmail = (accountStore.currentAccount.email || userStore.user.email || '').toLowerCase()
  try {
    const recipients = JSON.parse(email.recipient || '[]')
    recipients.forEach(r => {
      if (r.address && r.address.toLowerCase() !== selfEmail && !form.receiveEmail.includes(r.address)) {
        form.receiveEmail.push(r.address)
      }
    })
  } catch {}

  // CC from original
  try {
    const ccList = JSON.parse(email.cc || '[]')
    ccList.forEach(r => {
      if (r.address && r.address.toLowerCase() !== selfEmail) {
        form.cc.push(r.address)
        showCc.value = true
      }
    })
  } catch {}

  form.subject = (
    email.subject.startsWith('Re:') ||
    email.subject.startsWith('Re：') ||
    email.subject.startsWith('回复：') ||
    email.subject.startsWith('回复:')) ? email.subject : 'Re: ' + email.subject
  form.sendType = 'reply'
  form.emailId = email.emailId

  defValue.value = ''
  setTimeout(() => {
    defValue.value = `
    ${sigBlock()}
    <div></div>
    <div><br>
        ${formatDetailDate(email.createTime)} ${email.name} &lt${email.sendEmail}&gt ${t('wrote')}:
    </div>
    <blockquote class="mceNonEditable" style="margin:0 0 0 0.8ex;border-left:1px solid rgb(204,204,204);padding-left:1ex;">
      <article>${formatImage(email.content) || `<pre style="font-family:inherit;word-break:break-word;white-space:pre-wrap;margin:0">${email.text}</pre>`}</article>
    </blockquote>`
    _showWindow()
    nextTick(() => {
      backReply.content = editor.value.getContent()
      backReply.subject = form.subject
      backReply.receiveEmail = form.receiveEmail
      backReply.sendType = form.sendType
    })
  })
}

function openReply(email) {

  resetForm();

  email.subject = email.subject || ''

  form.receiveEmail.push(email.sendEmail)
  form.subject = (
      email.subject.startsWith('Re:') ||
      email.subject.startsWith('Re：') ||
      email.subject.startsWith('回复：') ||
      email.subject.startsWith('回复:')) ? email.subject : 'Re: ' + email.subject
  form.sendType = 'reply'
  form.emailId = email.emailId

  defValue.value = ''

  setTimeout(() => {
    defValue.value = `
    ${sigBlock()}
    <div></div>
    <div>
    <br>
        ${formatDetailDate(email.createTime)} ${email.name} &lt${email.sendEmail}&gt ${t('wrote')}:
    </div>
    <blockquote class="mceNonEditable" style="margin: 0 0 0 0.8ex;border-left: 1px solid rgb(204,204,204);padding-left: 1ex;">
      <article>
          ${formatImage(email.content) || `<pre style="font-family: inherit;word-break: break-word;white-space: pre-wrap;margin: 0">${email.text}</pre>`}
      </article>
    </blockquote>`
    _showWindow()

    nextTick(() => {
      backReply.content = editor.value.getContent()
      backReply.subject = form.subject
      backReply.receiveEmail = form.receiveEmail
      backReply.sendType = form.sendType
    })
  })

}

function formatImage(content) {
  content = content || '';
  const domain = settingStore.settings.r2Domain;
  return content.replace(/{{domain}}/g, toOssDomain(domain) + '/');
}

function insertTemplate(tpl) {
  if (tpl.subject && !form.subject) form.subject = tpl.subject
  const current = editor.value.getContent()
  editor.value.clearEditor()
  setTimeout(() => {
    defValue.value = tpl.content + (current ? '<br>' + current : '')
  })
}

async function loadTemplates() {
  if (!templatesList.value.length) {
    try { templatesList.value = await templateList() } catch {}
  }
}

async function loadSenderAccounts() {
  if (senderLoaded.value) return
  try {
    const list = await accountList(0, 30, null)
    senderAccounts.value = Array.isArray(list) ? list : []
    senderLoaded.value = true
  } catch {}
}

function selectSender(acc) {
  form.sendEmail = acc.email
  form.accountId = acc.accountId
  form.name = acc.name || ''
}

// Shared setup called by open(), openReply(), openReplyAll(), openForward()
// Does NOT touch defValue — callers set their own editor content.
function _showWindow() {
  if (!accountStore.currentAccount.email) {
    form.sendEmail = userStore.user.email;
    form.accountId = userStore.user.account.accountId;
    form.name = userStore.user.name;
  } else {
    form.sendEmail = accountStore.currentAccount.email;
    form.accountId = accountStore.currentAccount.accountId;
    form.name = accountStore.currentAccount.name;
  }
  show.value = true;
  windowState.value = 'normal'
  dragOffset.x = 0
  dragOffset.y = 0
  try { editor.value.focus() } catch {}
  loadTemplates()
  loadSenderAccounts()
}

function open(prefill) {
  _showWindow()
  const sig = userStore.user.signature
  const sigHtml = sig
    ? `<p><br></p><p><br></p><p style="color:#999;margin-top:0">-- </p>${sig}`
    : ''
  defValue.value = ''
  setTimeout(() => { defValue.value = sigHtml })
  if (prefill?.to?.length) form.receiveEmail = [...new Set(prefill.to)]
  if (prefill?.bcc?.length) {
    form.bcc = [...new Set(prefill.bcc)]
    showBcc.value = true
  }
}

function openWithTemplate(tpl) {
  _showWindow()
  const sig = userStore.user.signature
  const sigHtml = sig
    ? `<p><br></p><p><br></p><p style="color:#999;margin-top:0">-- </p>${sig}`
    : ''
  form.subject = tpl.subject || ''
  defValue.value = ''
  setTimeout(() => { defValue.value = (tpl.content || '') + sigHtml })
}

function openDraft(draft) {
  Object.assign(form, {...draft})
  defValue.value = ''
  setTimeout(() => defValue.value = form.content)
  show.value = true;
  try { editor.value.focus() } catch {}
}

// Reopens Compose from a scheduled-email payload (the schedule was already
// cancelled server-side by /email/schedule/:id/edit before this is called —
// see mail-vue/src/request/email.js#emailScheduleEdit and
// scheduledEmailService.beginEdit). The payload has accountId but not the
// sender's email string, so resolve it against the loaded sender list the
// same way selectSender() does.
async function openScheduled(payload) {
  _showWindow()
  await loadSenderAccounts()

  const { id, scheduledAt: originalScheduledAt, timezone, ...sendFields } = payload
  Object.assign(form, sendFields)

  const acc = senderAccounts.value.find(a => a.accountId === payload.accountId)
  if (acc) {
    form.sendEmail = acc.email
    form.name = acc.name || form.name
  }

  defValue.value = ''
  setTimeout(() => defValue.value = form.content)

  if (originalScheduledAt) {
    scheduledAt.value = originalScheduledAt
    showSchedulePicker.value = true
  }

  show.value = true
  try { editor.value.focus() } catch {}
}

const handleKeyDown = (event) => {
  if (event.key === 'Escape') {
    close()
  }
};

let autoSaveTimer = null

async function autoSaveDraft() {
  if (!show.value) return
  const content = editor.value?.getContent?.() ?? form.content
  if (!content && !form.subject && form.receiveEmail.length === 0) return
  // Don't autosave a draft that only contains the signature with no user input
  if (!form.subject && form.receiveEmail.length === 0 && !form.draftId) {
    const sigOnly = userStore.user.signature
      ? content.includes(userStore.user.signature) && form.receiveEmail.length === 0
      : false
    if (sigOnly) return
  }

  form.content = content

  if (form.draftId) {
    draftStore.setDraft = { ...toRaw(form) }
  } else {
    const formData = { ...toRaw(form) }
    delete formData.draftId
    delete formData.attachments
    formData.createTime = dayjs().utc().format('YYYY-MM-DD HH:mm:ss')
    const draftId = await db.value.draft.add({ ...formData })
    db.value.att.add({ draftId, attachments: toRaw(form.attachments) })
    form.draftId = draftId
    draftStore.refreshList++
  }

  ElMessage({ message: t('autoSavedDraft'), type: 'success', plain: true, duration: 1500 })
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown);
  autoSaveTimer = setInterval(autoSaveDraft, 30000)
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown);
  clearInterval(autoSaveTimer)
  window.removeEventListener('mousemove', onDrag)
  window.removeEventListener('mouseup', stopDrag)
});

function close() {

  if (selectStatus) openSelect();

  if (!form.content) {
    form.content = editor.value.getContent();
  }

  if (form.draftId) {
    draftStore.setDraft = {...toRaw(form)}
    show.value = false
    resetForm()
    return true;
  }

  if (!(form.content || form.subject || form.receiveEmail.length > 0)) {
    show.value = false
    resetForm()
    return true;
  }

  if (backReply.sendType === 'reply' || backReply.sendType === 'forward') {
    let subjectFlag = form.subject === backReply.subject
    let contentFlag = editor.value.getContent() === backReply.content
    let receiveFlag = form.receiveEmail.length === 1 && form.receiveEmail[0] === backReply.receiveEmail[0]
    if (backReply.sendType === 'forward' && form.receiveEmail.length === 0) {
      receiveFlag = true;
    }
    if (subjectFlag && contentFlag && receiveFlag) {
      show.value = false
      resetForm()
      return true;
    }
  }

  ElMessageBox.confirm(t('saveDraftConfirm'), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning',
    distinguishCancelAndClose: true
  }).then(async () => {
    const formData = {...toRaw(form)};
    delete formData.draftId
    delete formData.attachments
    formData.createTime = dayjs().utc().format('YYYY-MM-DD HH:mm:ss');
    const draftId = await db.value.draft.add({...formData})
    await db.value.att.add({draftId, attachments: toRaw(form.attachments)})
    draftStore.refreshList++
    show.value = false
    await nextTick(() => {
      resetForm()
    })
  }).catch((action) => {
    if (action === 'cancel') {
      show.value = false
      resetForm()
    }
  })
  return undefined
}

</script>
<style>
.write-select .el-select-dropdown__list {
  padding: 4px 4px !important;
}
.write-select .el-select-dropdown__item {
  padding: 0 10px 0 10px;
}

.write-select .el-select-dropdown {
  min-width: 0 !important;
  border-radius: var(--psg-radius-xs) !important;
}

.write-sender-dropdown,
.write-template-dropdown {
  border-radius: var(--psg-radius-xs) !important;
}

/* Send-later date/time popup — desktop widget is fine anchored to the field,
   but on phones it overflowed and felt like an unrelated overlay popping up.
   Below 768px, pin it centered as its own compact sheet instead. */
@media (max-width: 767px) {
  .schedule-datetime-popper {
    position: fixed !important;
    top: 50% !important;
    left: 50% !important;
    right: auto !important;
    bottom: auto !important;
    transform: translate(-50%, -50%) !important;
    z-index: 3000 !important;
    margin: 0 !important;
  }
  .schedule-datetime-popper .el-popper__arrow {
    display: none !important;
  }
  .schedule-datetime-popper .el-picker-panel {
    width: min(320px, calc(100vw - 32px)) !important;
    border-radius: var(--psg-radius-xs) !important;
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.30) !important;
  }
  .schedule-datetime-popper .el-date-picker__content {
    width: auto !important;
  }
  .schedule-datetime-popper .el-date-table td {
    height: 36px;
  }
  .schedule-datetime-popper .el-picker-panel__footer {
    padding: 8px 12px;
  }
}
</style>
<style scoped lang="scss">
/* ── Overlay ── no backdrop-filter: TinyMCE repaints on every keystroke,
   blur forces GPU recompositing of all layers below → severe lag.
   Desktop: genuinely non-blocking — the wrapper only positions the panel,
   it doesn't capture clicks, so the inbox behind stays fully usable while
   composing (Gmail/Outlook-style floating window, not a modal dialog).
   Mobile: a real full-screen sheet, backdrop and all. */
.send {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(17, 17, 17, 0.12);
  z-index: 2000;

  html.dark & {
    background: rgba(0, 0, 0, 0.45);
  }

  @media (min-width: 768px) {
    align-items: flex-end;
    justify-content: flex-end;
    padding: 0 28px 28px 0;
    background: transparent;
    pointer-events: none;
  }
}

/* ── Dialog box ──────────────────────────────── */
.write-box {
  background: var(--psg-surface);
  --compose-radius: var(--psg-radius-xs);
  border-radius: var(--compose-radius);
  width: min(1300px, calc(100% - 16px));
  display: grid;
  grid-template-rows: auto 1fr;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.40), 0 4px 16px rgba(0,0,0,0.18);
  overflow: hidden;
  transition: width 0.16s ease, height 0.16s ease;

  @media (max-width: 767px) {
    width: 100%;
    height: 100%;
  }

  /* Desktop: the wrapper ignores clicks (see .send above), the panel
     itself takes them back. */
  @media (min-width: 768px) {
    pointer-events: auto;

    /* "Normal" — a productivity panel, not a centered 1300px modal. */
    &[data-state="normal"] {
      width: min(680px, calc(100vw - 56px));
      height: min(680px, calc(100vh - 88px));
    }

    &[data-state="maximized"] {
      width: min(1300px, calc(100vw - 56px));
      height: min(860px, calc(100vh - 56px));
    }

    &[data-state="minimized"] {
      width: 300px;
      height: 52px;
    }
  }
}

/* ── Header — ink bar, adapts with theme like the rest of the app's
   ink accent (compose buttons, active nav) ──────── */
.wh {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px 0 20px;
  background: var(--psg-primary);
  height: 52px;
  flex-shrink: 0;
  border-bottom: 2px solid var(--psg-primary);
}

.wh-draggable {
  cursor: move;

  .wh-sender, .wh-action-btn { cursor: pointer; }
}

.wh-left {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
}

.wh-badge {
  font-family: var(--psg-font-sans);
  font-size: 12.5px;
  font-weight: 600;
  letter-spacing: 0;
  text-transform: none;
  color: var(--psg-on-primary);
  white-space: nowrap;
  flex-shrink: 0;
}

.wh-sender {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
  padding-left: 14px;
  border-left: 1px solid color-mix(in srgb, var(--psg-on-primary) 15%, transparent);
  border-radius: var(--compose-radius);
  padding: 4px 8px 4px 14px;
  transition: background 0.14s;
  outline: none;
  cursor: default;

  &.selectable {
    cursor: pointer;
    &:hover { background: color-mix(in srgb, var(--psg-on-primary) 8%, transparent); }
  }
}

.sender-chevron {
  color: color-mix(in srgb, var(--psg-on-primary) 40%, transparent);
  flex-shrink: 0;
  margin-left: 2px;
  transition: transform 0.18s cubic-bezier(0.22,1,0.36,1);
}

/* Dropdown option rows */
.sender-option {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 220px;
  padding: 2px 0;
}

.sender-opt-avatar {
  width: 28px;
  height: 28px;
  border-radius: var(--compose-radius);
  background: var(--psg-surface-muted);
  border: 1px solid var(--psg-border);
  color: var(--psg-text-secondary);
  font-size: 11px;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  overflow: hidden;
}

.opt-avatar-img {
  width: 28px;
  height: 28px;
  object-fit: cover;
  display: block;
  border-radius: var(--compose-radius);
}

.sender-opt-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.sender-opt-name {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--psg-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sender-opt-email {
  font-size: 11.5px;
  font-family: var(--psg-font-mono);
  color: var(--psg-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sender-opt-check {
  color: var(--psg-primary);
  flex-shrink: 0;
}

:deep(.is-active-sender) {
  background: var(--psg-surface-active) !important;
}

.wh-avatar {
  width: 28px;
  height: 28px;
  border-radius: var(--compose-radius);
  background: var(--psg-on-primary);
  color: var(--psg-primary);
  font-size: 12px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  overflow: hidden;
}

.wh-avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.wh-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.wh-name {
  font-size: 12.5px;
  font-weight: 600;
  color: color-mix(in srgb, var(--psg-on-primary) 90%, transparent);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.wh-email {
  font-size: 10.5px;
  font-family: var(--psg-font-mono);
  color: color-mix(in srgb, var(--psg-on-primary) 45%, transparent);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.wh-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.wh-action-btn {
  width: 30px;
  height: 30px;
  border: none;
  border-radius: var(--compose-radius);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  background: transparent;
  color: color-mix(in srgb, var(--psg-on-primary) 60%, transparent);
  flex-shrink: 0;
  transition: background 0.12s, color 0.12s;

  @media (hover: hover) {
    &:hover {
      background: color-mix(in srgb, var(--psg-on-primary) 12%, transparent);
      color: var(--psg-on-primary);
    }
  }

  &.wh-close:hover {
    background: var(--psg-danger);
    color: #fff;
  }
}

/* Minimized: the header is the whole window and doubles as a restore
   button — everything except the action buttons re-expands on click. */
.write-box[data-state="minimized"] .wh {
  cursor: pointer;
}

.write-box[data-state="minimized"] .container {
  display: none;
}

/* ── Fields container ────────────────────────── */
.container {
  display: flex;
  flex-direction: column;
  height: 100%;
}

/* Each field row */
.field-row {
  display: flex;
  align-items: center;
  min-height: 46px;
  padding: 0 20px;
  border-bottom: 1px solid var(--psg-border);
  flex-shrink: 0;
  gap: 0;
}

.field-label {
  flex-shrink: 0;
  width: 62px;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0;
  text-transform: none;
  color: var(--psg-text-secondary);
}

.field-tag {
  flex: 1;
  min-width: 0;
}

.field-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  margin-left: 8px;
}

.field-toggle {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--psg-text-secondary);
  cursor: pointer;
  letter-spacing: 0.03em;
  user-select: none;
  padding: 3px 6px;
  border-radius: var(--compose-radius);
  transition: background 0.12s, color 0.12s;

  @media (hover: hover) {
    &:hover {
      background: var(--psg-surface-muted);
      color: var(--psg-text);
    }
  }
}

.icon-btn-sm {
  width: 26px;
  height: 26px;
  border: none;
  padding: 0;
  background: transparent;
  font: inherit;
  border-radius: var(--compose-radius);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--psg-text-secondary);
  transition: background 0.12s, color 0.12s;

  @media (hover: hover) {
    &:hover {
      background: var(--psg-surface-muted);
      color: var(--psg-text);
    }
  }
}

/* Subject row */
.subject-row {
  min-height: 50px;
  border-bottom: 1px solid var(--psg-border);
}

/* Editor fills remaining height */
.editor-wrap {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

/* Bottom toolbar */
.toolbar-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 9px 16px 10px;
  border-top: 1px solid var(--psg-border);
  background: var(--psg-surface-muted);
  flex-shrink: 0;
  gap: 12px;
  position: relative;
  overflow: visible;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
  min-width: 0;
}

.compose-ai-actions { display: flex; flex-direction: column; gap: 2px; }
.compose-ai-actions button { display: flex; align-items: center; gap: 8px; width: 100%; border: 0; border-radius: var(--psg-radius-xs); padding: 8px 9px; background: transparent; color: var(--psg-text); font-size: 12.5px; text-align: left; cursor: pointer; }
.compose-ai-actions button:hover { background: var(--psg-menu-active-bg); color: var(--psg-menu-active-text); }
.compose-ai-trigger { color: var(--psg-primary) !important; }
.compose-ai-preview { max-height: 320px; overflow: auto; white-space: pre-wrap; word-break: break-word; padding: 12px; border: 1px solid var(--psg-border); border-radius: var(--psg-radius-xs); background: var(--psg-surface-muted); color: var(--psg-text); line-height: 1.65; font-size: 13px; }

.tb-btn {
  height: 30px;
  min-width: 30px;
  border: none;
  padding: 0;
  background: transparent;
  font: inherit;
  border-radius: var(--compose-radius);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--psg-text-secondary);
  transition: background 0.12s, color 0.12s;
  flex-shrink: 0;

  @media (hover: hover) {
    &:hover {
      background: var(--psg-surface-active);
      color: var(--psg-text);
    }
  }
}

.tb-btn--label {
  gap: 5px;
  padding: 0 10px;
  font-size: 12.5px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.att-list {
  display: flex;
  flex-wrap: nowrap;
  gap: 6px;
  overflow-x: auto;
  padding: 0 4px;
  max-width: 100%;

  .att-item {
    display: flex;
    align-items: center;
    gap: 5px;
    height: 26px;
    font-size: 11.5px;
    padding: 0 8px;
    background: var(--psg-surface);
    border: 1px solid var(--psg-border);
    border-radius: var(--compose-radius);
    white-space: nowrap;
    flex-shrink: 0;
    max-width: 200px;

    .att-filename {
      max-width: 100px;
      white-space: nowrap;
      text-overflow: ellipsis;
      overflow: hidden;
      font-weight: 500;
    }

    .att-size {
      font-family: var(--psg-font-mono);
      font-size: 10px;
      color: var(--psg-text-secondary);
    }
  }
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  position: relative;
}

.send-btn {
  height: 34px !important;
  padding: 0 20px !important;
  font-size: 13.5px !important;
  font-weight: 600 !important;
  letter-spacing: 0 !important;
  text-transform: none !important;
  border-radius: var(--compose-radius) !important;
  display: inline-flex !important;
  align-items: center !important;
}

.send-later-btn {
  height: 34px !important;
  width: auto !important;
  min-width: 34px !important;
  padding: 0 11px !important;
  gap: 6px;
  border-radius: var(--compose-radius) !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  flex-shrink: 0;
}

.send-later-label {
  white-space: nowrap;
}

.send-later-btn.is-active {
  background: var(--psg-primary-muted) !important;
  border-color: var(--psg-primary-light-7) !important;
  color: var(--psg-primary) !important;
}

.schedule-panel {
  position: absolute;
  right: 0;
  bottom: calc(100% + 10px);
  width: min(368px, calc(100vw - 40px));
  padding: 16px;
  background: var(--psg-surface);
  border: 1px solid var(--psg-border);
  border-radius: var(--compose-radius);
  box-shadow: var(--psg-shadow-lg);
  color: var(--psg-text);
  z-index: 20;
}

.schedule-panel-header {
  position: relative;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 13px;
  border-bottom: 1px solid var(--psg-border);
}

.schedule-panel-title {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;

  > span:last-child {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }

  strong {
    font-size: 13px;
    font-weight: 700;
    line-height: 1.2;
  }

  small {
    color: var(--psg-text-muted);
    font-size: 11px;
    line-height: 1.3;
  }
}

.schedule-panel-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  border-radius: var(--compose-radius);
  background: var(--psg-primary-muted);
  color: var(--psg-primary);
}

.schedule-panel-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  border: 0;
  border-radius: var(--compose-radius);
  background: transparent;
  color: var(--psg-text-muted);
  cursor: pointer;

  &:hover,
  &:focus-visible {
    background: var(--psg-surface-active);
    color: var(--psg-text);
    outline: none;
  }
}

.schedule-panel-section {
  margin-top: 14px;
}

.schedule-panel-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 7px;
}

.schedule-panel-label {
  color: var(--psg-text-secondary);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.schedule-panel-timezone,
.schedule-panel-note {
  color: var(--psg-text-muted);
  font-family: var(--psg-font-mono);
  font-size: 10px;
}

.schedule-quick-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}

.schedule-quick-btn {
  min-width: 0;
  min-height: 34px;
  padding: 5px 7px;
  border: 1px solid var(--psg-border);
  border-radius: var(--compose-radius);
  background: var(--psg-surface-muted);
  color: var(--psg-text-secondary);
  font: inherit;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.25;
  cursor: pointer;
  transition: background 0.14s ease, border-color 0.14s ease, color 0.14s ease;

  &:hover,
  &:focus-visible,
  &.is-active {
    background: var(--psg-primary-muted);
    border-color: var(--psg-primary-light-7);
    color: var(--psg-primary);
    outline: none;
  }
}

.schedule-picker {
  width: 100% !important;

  :deep(.el-input__wrapper) {
    min-height: 34px;
    border-radius: var(--compose-radius) !important;
  }
}

.schedule-panel-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 15px;
  padding-top: 12px;
  border-top: 1px solid var(--psg-border);
}

.schedule-panel-note {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  white-space: nowrap;
}

.schedule-panel-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.schedule-confirm-btn,
.schedule-cancel-btn {
  height: 32px !important;
  padding: 0 12px !important;
  border-radius: var(--compose-radius) !important;
  font-size: 12px !important;
  font-weight: 600 !important;
}

/* Cancel is a Secondary action — it shouldn't compete with Confirm's
   primary green, so it stays a flat, low-contrast outline. */
.schedule-cancel-btn {
  background: var(--psg-surface-muted) !important;
  border-color: var(--psg-border) !important;
  color: var(--psg-text-secondary) !important;

  &:hover {
    background: var(--psg-surface-active) !important;
    border-color: var(--psg-border) !important;
    color: var(--psg-text) !important;
  }
}

/* El overrides — flat field inputs */
:deep(.field-tag .el-input-tag),
:deep(.field-tag .el-input__wrapper) {
  border-radius: var(--compose-radius) !important;
  box-shadow: none !important;
  border: none !important;
  background: transparent !important;
  padding-left: 0 !important;
}

:deep(.field-tag .el-tag) {
  border-radius: var(--compose-radius) !important;
}

:deep(.subject-input .el-input__wrapper) {
  border-radius: var(--compose-radius) !important;
  box-shadow: none !important;
  border: none !important;
  background: transparent !important;
  padding-left: 0 !important;
  transition: box-shadow 0.14s ease !important;

  &.is-focus {
    box-shadow: 0 0 0 3px var(--psg-primary-muted) !important;
    padding-left: 8px !important;
    margin-left: -8px;
  }

  .el-input__inner {
    font-size: 15px !important;
    font-weight: 500 !important;
    color: var(--psg-text) !important;
    letter-spacing: 0.01em !important;

    &::placeholder {
      font-weight: 400;
      color: var(--psg-text-muted);
    }
  }
}

:deep(.el-input-tag__suffix) { padding-right: 0; }

.email-row {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

:deep(.el-dialog) {
  width: 500px !important;
  border-radius: var(--psg-radius-xs) !important;
  overflow: hidden;
  @media (max-width: 540px) {
    width: calc(100% - 32px) !important;
  }
}

.contacts-bottom {
  display: flex;
  justify-content: flex-end;
  margin-top: 10px;
  gap: 8px;
}

.contacts-tabs {
  :deep(.el-tabs__header) { margin-bottom: 10px; }
}

.dir-name {
  font-weight: 600;
  color: var(--psg-text);
}

.email-row {
  font-size: 13px;
  color: var(--psg-text-secondary);
}

.write-select {
  position: absolute;
  width: 300px;
  left: 60px;
  z-index: 0;
  opacity: 0;
  pointer-events: none;
}

@media (max-width: 767px) {
  .send {
    align-items: stretch;
    justify-content: stretch;
    background: var(--psg-canvas);
  }

  .write-box {
    width: 100%;
    height: 100dvh;
    box-shadow: none;
    background: var(--psg-canvas);
  }

  /* Mobile fullscreen composer: header switches from the desktop ink bar
     to a flat surface bar with a large badge, matching mobile-header. */
  .wh {
    height: calc(64px + env(safe-area-inset-top, 0px));
    padding: calc(8px + env(safe-area-inset-top, 0px)) 10px 8px 16px;
    background: var(--psg-surface);
    border-bottom: 1px solid var(--psg-border);
  }

  .wh-left {
    gap: 10px;
    flex: 1;
    min-width: 0;
  }

  .wh-badge {
    font-family: inherit;
    font-size: 18px;
    font-weight: 800;
    letter-spacing: 0;
    text-transform: none;
    color: var(--psg-text);
  }

  .wh-sender {
    display: none;
  }

  /* Mobile is always a full-screen sheet — minimize/maximize don't apply. */
  .wh-actions .wh-action-btn:not(.wh-close) {
    display: none;
  }

  .wh-close {
    width: 42px;
    height: 42px;
    border-radius: var(--compose-radius);
    color: var(--psg-text-secondary);

    &:active {
      background: var(--psg-surface-muted);
    }
  }

  .container {
    min-height: 0;
    padding: 10px 12px 0;
  }

  .field-row {
    min-height: 54px;
    padding: 0 14px;
    gap: 8px;
    border-bottom: 1px solid var(--psg-border);
    margin-bottom: 8px;
  }

  .field-label {
    width: 44px;
    font-size: 12px;
    letter-spacing: 0;
    text-transform: none;
  }

  .field-actions {
    gap: 4px;
    margin-left: 4px;
  }

  .field-toggle {
    height: 30px;
    display: inline-flex;
    align-items: center;
    padding: 0 9px;
    border-radius: var(--compose-radius);
    background: var(--psg-surface-muted);
    font-size: 12px;
  }

  .subject-row {
    min-height: 56px;
  }

  :deep(.subject-input .el-input__wrapper .el-input__inner) {
    font-size: 16px !important;
    font-weight: 700 !important;
  }

  .editor-wrap {
    flex: 1;
    min-height: 220px;
    overflow: hidden;
  }

  .toolbar-bar {
    padding: 8px 12px calc(10px + env(safe-area-inset-bottom, 0px));
    gap: 8px;
  }

  .toolbar-left {
    overflow-x: auto;
  }

  .tb-btn {
    width: 40px;
    height: 40px;
    border-radius: var(--compose-radius);
    background: var(--psg-surface);
  }

  .tb-btn--label {
    width: auto;
    padding: 0 12px;
  }

  .toolbar-right {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .send-later-label {
    display: none;
  }

  .send-btn {
    height: 42px !important;
    min-width: 74px !important;
    border-radius: var(--compose-radius) !important;
    padding: 0 18px !important;
  }

  .send-later-btn {
    width: 42px !important;
    height: 42px !important;
    padding: 0 !important;
    border-radius: var(--compose-radius) !important;
  }

  .schedule-panel {
    position: fixed;
    left: 12px;
    right: 12px;
    bottom: calc(66px + env(safe-area-inset-bottom, 0px));
    width: auto !important;
    max-width: none;
    max-height: min(78dvh, 620px);
    overflow-y: auto;
    overscroll-behavior: contain;
    transition: transform 160ms ease;
  }

  .schedule-quick-grid {
    grid-template-columns: 1fr;
  }

  .schedule-quick-btn {
    min-height: 38px;
    text-align: left;
    padding: 0 12px;
  }

  .schedule-panel-footer {
    align-items: flex-end;
  }

  .schedule-panel-note {
    max-width: 40%;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .schedule-picker {
    position: static;
    left: auto;
    right: auto;
    bottom: auto;
    z-index: auto;
  }
}
</style>
