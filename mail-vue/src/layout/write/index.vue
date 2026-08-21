<template>
  <div class="send" v-show="show">
    <div class="write-box">

      <!-- ── Header ─────────────────────────────── -->
      <div class="wh">
        <div class="wh-left">
          <div class="wh-badge">
            <span v-if="form.sendType === 'reply'">{{ $t('reply') }}</span>
            <span v-else-if="form.sendType === 'forward'">{{ $t('forward') }}</span>
            <span v-else>{{ $t('compose') }}</span>
          </div>
          <el-dropdown trigger="click" @command="selectSender" :disabled="senderAccounts.length <= 1">
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
                    icon="solar:alt-arrow-down-linear" width="12" height="12" class="sender-chevron"/>
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
                          icon="solar:check-circle-linear" width="14" height="14" class="sender-opt-check"/>
                  </div>
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
        <div class="wh-close" @click="close">
          <Icon icon="solar:close-circle-linear" width="22" height="22"/>
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
            <div class="icon-btn-sm" @click.stop="openContacts">
              <Icon icon="solar:user-plus-linear" width="14" height="14"/>
            </div>
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
          <tinyEditor :def-value="defValue" ref="editor" @change="change" @focus="focusChange" />
        </div>

        <!-- Toolbar -->
        <div class="toolbar-bar">
          <div class="toolbar-left">
            <div class="tb-btn tb-btn--label" @click="chooseFile">
              <Icon icon="solar:paperclip-linear" width="16" height="16"/>
              <span>{{ $t('attachments') }}</span>
            </div>
            <div class="tb-btn" @click="clearContent" :title="$t('clear')">
              <Icon icon="solar:eraser-linear" width="17" height="17"/>
            </div>
            <el-dropdown trigger="click" @command="insertTemplate" :hide-on-click="true">
              <div class="tb-btn tb-btn--label">
                <Icon icon="solar:document-text-linear" width="16" height="16"/>
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
                <Icon icon="solar:close-circle-linear" width="16" height="16"
                      style="cursor:pointer;flex-shrink:0" @click="delAtt(index)"/>
              </div>
            </div>
          </div>
          <div class="toolbar-right">
            <!-- Send Later inline picker -->
            <template v-if="showSchedulePicker">
              <el-date-picker
                v-model="scheduledAt"
                type="datetime"
                :placeholder="$t('scheduleFor')"
                format="YYYY-MM-DD HH:mm"
                value-format="YYYY-MM-DD HH:mm:ss"
                :disabled-date="d => d < new Date(Date.now() - 86400000)"
                size="small"
                class="schedule-picker"
                popper-class="schedule-datetime-popper"
              />
              <el-button size="small" class="schedule-confirm-btn" type="primary"
                         @click="sendScheduled" :disabled="!scheduledAt">
                {{ $t('scheduleConfirmBtn') }}
              </el-button>
              <el-button size="small" class="schedule-cancel-btn" @click="showSchedulePicker = false; scheduledAt = ''">
                {{ $t('cancel') }}
              </el-button>
            </template>
            <template v-else>
              <el-tooltip :content="$t('sendLater')" placement="top">
                <el-button class="send-later-btn" @click="showSchedulePicker = true">
                  <Icon icon="solar:clock-circle-linear" width="16" height="16"/>
                </el-button>
              </el-tooltip>
              <el-button class="send-btn" type="primary" @click="sendEmail">
                <Icon icon="solar:plain-3-bold" width="15" height="15" style="margin-right:6px"/>
                <span v-if="form.sendType === 'reply'">{{ $t('reply') }}</span>
                <span v-else-if="form.sendType === 'forward'">{{ $t('forward') }}</span>
                <span v-else>{{ $t('send') }}</span>
              </el-button>
            </template>
          </div>
        </div>

      </div>
    </div>
    <el-dialog top="10vh" v-model="showContacts" @closed="clearSelectContact" :title="t('recentContacts')" width="480">
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
                <Icon icon="solar:user-linear" width="20" height="20" style="color:var(--secondary-text-color)"/>
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
            <template #prefix><Icon icon="solar:magnifer-linear" width="15" height="15"/></template>
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
                 style="display:flex;align-items:center;justify-content:space-between;padding:8px 2px;border-bottom:1px solid var(--light-border-color)">
              <div>
                <div style="font-weight:600;font-size:13px">{{ g.name }}</div>
                <div style="font-size:11.5px;color:var(--regular-text-color)">{{ g.contacts.map(c => c.name || c.email).join(', ') }}</div>
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
import {h, nextTick, onMounted, onUnmounted, reactive, ref, toRaw, computed} from "vue";
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
import {getDirectory} from "@/request/my.js";
import {templateList} from "@/request/template.js";
import {contactGroupList} from "@/request/contact-group.js";
import {accountList} from "@/request/account.js";

defineExpose({
  open,
  openReply,
  openReplyAll,
  openForward,
  openDraft,
  openScheduled
})

const {t} = useI18n()
const writerStore = useWriterStore();
const draftStore = userDraftStore()
const settingStore = useSettingStore()
const uiStore = useUiStore()
const emailStore = useEmailStore();
const accountStore = useAccountStore()
const editor = ref({})
const userStore = useUserStore();
const show = ref(false);
const showCc = ref(false);
const showBcc = ref(false);
const percent = ref(0)
let percentMessage = null
let sending = false
const defValue = ref('')
const contactsTabRef = ref({})
const directoryTabRef = ref({})
const showContacts = ref(false)
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
const scheduledAt = ref('')

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
        style: 'color:#1890ff;background:none;border:none;cursor:pointer;font-weight:700;flex-shrink:0;font-size:13px',
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
  try { editor.value.focus() } catch {}
  loadTemplates()
  loadSenderAccounts()
}

function open() {
  _showWindow()
  const sig = userStore.user.signature
  const sigHtml = sig
    ? `<p><br></p><p><br></p><p style="color:#999;margin-top:0">-- </p>${sig}`
    : ''
  defValue.value = ''
  setTimeout(() => { defValue.value = sigHtml })
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
    return;
  }

  if (!(form.content || form.subject || form.receiveEmail.length > 0)) {
    show.value = false
    resetForm()
    return;
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
      return;
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
   blur forces GPU recompositing of all layers below → severe lag */
.send {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  /* A quiet scrim, not a heavy dark modal backdrop — the composer reads
     as a floating panel over the inbox, not a blocking full-screen dialog. */
  background: rgba(17, 17, 17, 0.12);
  z-index: 2000;

  @media (min-width: 768px) {
    align-items: flex-end;
    justify-content: flex-end;
    padding: 0 28px 28px 0;
  }
}

/* ── Dialog box ──────────────────────────────── */
.write-box {
  background: var(--el-bg-color);
  width: min(1300px, calc(100% - 16px));
  display: grid;
  grid-template-rows: auto 1fr;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.40), 0 4px 16px rgba(0,0,0,0.18);
  border-radius: var(--radius-lg);
  overflow: hidden;

  @media (max-width: 767px) {
    width: 100%;
    height: 100%;
    border-radius: var(--radius-lg);
  }

  /* Desktop "Normal" composer — Gmail-style floating panel, not a
     centered 1300px modal. */
  @media (min-width: 768px) {
    width: min(680px, calc(100vw - 56px));
    height: min(680px, calc(100vh - 88px));
  }
}

/* ── Header — flat editorial bar ──────── */
.wh {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px 0 20px;
  background: #111111;
  height: 52px;
  flex-shrink: 0;
  /* .wh is a fixed dark bar in both themes, so its accent must stay the
     dark-surface (light) tone regardless of --red-accent's current theme value */
  border-bottom: 2px solid #f4f4f4;
}

.wh-left {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
}

.wh-badge {
  font-family: 'IBM Plex Sans', 'Noto Sans SC', sans-serif;
  font-size: 12.5px;
  font-weight: 600;
  letter-spacing: 0;
  text-transform: none;
  color: #f4f4f4; /* .wh is always a dark bar — see note above */
  white-space: nowrap;
  flex-shrink: 0;
}

.wh-sender {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
  padding-left: 14px;
  border-left: 1px solid rgba(255,255,255,0.10);
  border-radius: var(--radius-sm);
  padding: 4px 8px 4px 14px;
  transition: background 0.14s;
  outline: none;
  cursor: default;

  &.selectable {
    cursor: pointer;
    &:hover { background: rgba(255,255,255,0.07); }
  }
}

.sender-chevron {
  color: rgba(255,255,255,0.35);
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
  border-radius: var(--radius-sm);
  background: rgba(var(--red-accent-rgb),0.10);
  border: 1px solid rgba(var(--red-accent-rgb),0.20);
  color: var(--red-accent);
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
  border-radius: var(--radius-sm);
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
  color: var(--el-text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sender-opt-email {
  font-size: 11.5px;
  font-family: 'IBM Plex Mono', monospace;
  color: var(--secondary-text-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sender-opt-check {
  color: var(--red-accent);
  flex-shrink: 0;
}

:deep(.is-active-sender) {
  background: rgba(var(--red-accent-rgb),0.05) !important;
}

.wh-avatar {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-sm);
  background: var(--red-accent);
  color: var(--on-accent);
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
  color: rgba(255,255,255,0.90);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.wh-email {
  font-size: 10.5px;
  font-family: 'IBM Plex Mono', monospace;
  color: rgba(255,255,255,0.38);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.wh-close {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: rgba(255,255,255,0.55);
  flex-shrink: 0;
  transition: background 0.12s, color 0.12s;

  @media (hover: hover) {
    &:hover {
      background: rgba(255,255,255,0.10);
      color: rgba(255,255,255,0.90);
    }
  }
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
  border-bottom: 1px solid var(--light-border-color);
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
  color: var(--secondary-text-color);
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
  color: var(--secondary-text-color);
  cursor: pointer;
  letter-spacing: 0.03em;
  user-select: none;
  padding: 3px 6px;
  border-radius: var(--radius-sm);
  transition: background 0.12s, color 0.12s;

  @media (hover: hover) {
    &:hover {
      background: var(--base-fill);
      color: var(--el-text-color-primary);
    }
  }
}

.icon-btn-sm {
  width: 26px;
  height: 26px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--secondary-text-color);
  transition: background 0.12s, color 0.12s;

  @media (hover: hover) {
    &:hover {
      background: var(--base-fill);
      color: var(--el-text-color-primary);
    }
  }
}

/* Subject row */
.subject-row {
  min-height: 50px;
  border-bottom: 1px solid var(--separator, #e5e5e5);
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
  border-top: 1px solid var(--light-border-color);
  background: var(--extra-light-fill);
  flex-shrink: 0;
  gap: 12px;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
  min-width: 0;
}

.tb-btn {
  height: 30px;
  min-width: 30px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--regular-text-color);
  transition: background 0.12s, color 0.12s;
  flex-shrink: 0;

  @media (hover: hover) {
    &:hover {
      background: var(--base-fill);
      color: var(--red-accent);
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
    background: var(--el-bg-color);
    border: 1px solid var(--light-border-color);
    border-radius: var(--radius-sm);
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
      font-family: 'IBM Plex Mono', monospace;
      font-size: 10px;
      color: var(--secondary-text-color);
    }
  }
}

.toolbar-right { flex-shrink: 0; }

.send-btn {
  height: 34px !important;
  padding: 0 20px !important;
  font-size: 13.5px !important;
  font-weight: 600 !important;
  letter-spacing: 0 !important;
  text-transform: none !important;
  border-radius: var(--radius-sm) !important;
  display: inline-flex !important;
  align-items: center !important;
}

.send-later-btn {
  height: 34px !important;
  width: 34px !important;
  padding: 0 !important;
  border-radius: var(--radius-sm) !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  flex-shrink: 0;
}

.schedule-picker {
  width: 200px !important;
  :deep(.el-input__wrapper) { border-radius: var(--radius-sm) !important; }
}

.schedule-confirm-btn,
.schedule-cancel-btn {
  height: 28px !important;
  border-radius: var(--radius-sm) !important;
  font-size: 12px !important;
  font-weight: 600 !important;
}

/* El overrides — flat field inputs */
:deep(.field-tag .el-input-tag),
:deep(.field-tag .el-input__wrapper) {
  border-radius: var(--radius-sm) !important;
  box-shadow: none !important;
  border: none !important;
  background: transparent !important;
  padding-left: 0 !important;
}

:deep(.subject-input .el-input__wrapper) {
  border-radius: var(--radius-sm) !important;
  box-shadow: none !important;
  border: none !important;
  background: transparent !important;
  padding-left: 0 !important;

  .el-input__inner {
    font-size: 15px !important;
    font-weight: 600 !important;
    color: var(--el-text-color-primary) !important;
    letter-spacing: 0.01em !important;
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
  color: var(--el-text-color-primary);
}

.email-row {
  font-size: 13px;
  color: var(--regular-text-color);
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
    background: var(--el-bg-color);
  }

  .write-box {
    width: 100%;
    height: 100dvh;
    box-shadow: none;
    background: linear-gradient(180deg, #f7f6f3 0%, #efeeeb 100%);
  }

  .wh {
    height: 64px;
    padding: 8px 10px 8px 16px;
    /* Tinted to match .write-box's own cream gradient (#f7f6f3) instead of
       literal white — see mail-vue/src/views/content/index.vue for the same
       fix applied to the email detail view. */
    background: rgba(247,246,243,0.94);
    border-bottom: 1px solid rgba(0,0,0,0.08);
    box-shadow: 0 10px 24px rgba(0,0,0,0.06);
    backdrop-filter: blur(18px);
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
    color: var(--el-text-color-primary);
  }

  .wh-sender {
    display: none;
  }

  .wh-close {
    width: 42px;
    height: 42px;
    border-radius: var(--radius-sm);
    color: var(--regular-text-color);

    &:active {
      background: rgba(0,0,0,0.08);
      color: var(--red-accent);
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
    border-bottom: none;
    border-radius: var(--radius-sm);
    background: rgba(247,246,243,0.86);
    border: 1px solid rgba(0,0,0,0.08);
    box-shadow: 0 8px 20px rgba(0,0,0,0.05);
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
    border-radius: var(--radius-sm);
    background: rgba(0,0,0,0.05);
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
    border-radius: var(--radius-sm);
    background: rgba(247,246,243,0.90);
    border: 1px solid rgba(0,0,0,0.08);
    border-bottom: none;
    box-shadow: 0 12px 28px rgba(0,0,0,0.06);
  }

  .toolbar-bar {
    padding: 8px 12px calc(10px + env(safe-area-inset-bottom, 0px));
    border-top: 1px solid rgba(0,0,0,0.08);
    background: rgba(247,246,243,0.94);
    gap: 8px;
  }

  .toolbar-left {
    overflow-x: auto;
  }

  .tb-btn {
    width: 40px;
    height: 40px;
    border-radius: var(--radius-sm);
    background: rgba(0,0,0,0.04);
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

  .send-btn {
    height: 42px !important;
    min-width: 74px !important;
    border-radius: var(--radius-sm) !important;
    padding: 0 18px !important;
  }

  .send-later-btn {
    width: 42px !important;
    height: 42px !important;
    border-radius: var(--radius-sm) !important;
  }

  .schedule-picker {
    position: fixed;
    left: 12px;
    right: 12px;
    bottom: calc(70px + env(safe-area-inset-bottom, 0px));
    width: auto !important;
    z-index: 5;
  }

  .dark .write-box {
    background: linear-gradient(180deg, #151519 0%, #101014 100%);
  }

  .dark .wh,
  .dark .field-row,
  .dark .editor-wrap,
  .dark .toolbar-bar {
    background: rgba(28,28,33,0.92);
    border-color: rgba(255,255,255,0.08);
    box-shadow: 0 12px 28px rgba(0,0,0,0.24);
  }
}
</style>
