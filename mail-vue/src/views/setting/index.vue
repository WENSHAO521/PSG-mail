<template>
  <div class="settings-container">
    <el-scrollbar class="scroll">
      <div class="scroll-body">
        <div class="settings-shell">

          <!-- ── Left sidebar nav ── -->
          <nav class="settings-sidebar" aria-label="Personal settings sections">
            <button
              v-for="item in navItems"
              :key="item.key"
              class="settings-nav-item"
              :class="{ active: activeSection === item.key }"
              type="button"
              @click="activeSection = item.key"
            >
              <Icon class="settings-nav-icon" :icon="item.icon" width="20" height="20"/>
              <span>{{ item.label }}</span>
            </button>
          </nav>

          <!-- ── Right panel ── -->
          <main class="settings-panel">

            <!-- Panel header -->
            <div class="settings-panel-header">
              <div>
                <h1>{{ activeMeta.label }}</h1>
                <p>{{ activeMeta.desc }}</p>
              </div>
              <!-- Section-specific save button -->
              <el-button
                v-if="activeSection === 'signature'"
                class="settings-save-button" type="primary"
                :loading="signatureLoading" @click="saveSignature"
              >{{ $t('save') }}</el-button>
              <el-button
                v-else-if="activeSection === 'autoreply' && autoReplyEnabled"
                class="settings-save-button" type="primary"
                :loading="autoReplySaving" @click="saveAutoReply"
              >{{ $t('save') }}</el-button>
            </div>

            <!-- ── Profile section ── -->
            <div v-show="activeSection === 'profile'" class="settings-card">
              <div class="avatar-strip">
                <div class="avatar-wrap" @click="triggerUpload">
                  <img v-if="userStore.avatar" :src="userStore.avatar" class="avatar-img"/>
                  <div v-else class="avatar-init">{{ userInitial }}</div>
                  <div class="avatar-lens">
                    <Icon icon="solar:camera-add-bold" width="18" height="18"/>
                  </div>
                  <input ref="fileInputRef" type="file" accept="image/*"
                         style="display:none" @change="handleFileChange"/>
                </div>
                <div class="avatar-meta">
                  <div class="meta-name">{{ userStore.user.name || userStore.user.email }}</div>
                  <div class="meta-email">{{ userStore.user.email }}</div>
                  <div class="meta-role" v-if="userStore.user.role?.name">{{ userStore.user.role.name }}</div>
                  <div class="avatar-links">
                    <button class="link-btn" @click="triggerUpload">{{ $t('uploadAvatar') }}</button>
                    <button class="link-btn dim" v-if="userStore.avatar" @click="removeAvatar">{{ $t('removeAvatar') }}</button>
                  </div>
                </div>
              </div>

              <div class="data-table">
                <div class="data-row">
                  <span class="data-key">{{ $t('username') }}</span>
                  <div class="data-val">
                    <template v-if="setNameShow">
                      <el-input v-model="accountName" size="small" style="width:160px"/>
                      <button class="link-btn" @click="setName">{{ $t('save') }}</button>
                      <button class="link-btn dim" @click="setNameShow = false">{{ $t('cancel') }}</button>
                    </template>
                    <template v-else>
                      <span class="val-str">{{ userStore.user.name || '—' }}</span>
                      <button class="link-btn" @click="showSetName">{{ $t('change') }}</button>
                    </template>
                  </div>
                </div>
                <div class="data-row">
                  <span class="data-key">{{ $t('emailAccount') }}</span>
                  <span class="val-str mono">{{ userStore.user.email }}</span>
                </div>
                <div class="data-row last">
                  <span class="data-key">{{ $t('password') }}</span>
                  <div class="data-val">
                    <span class="val-str">••••••••</span>
                    <button class="link-btn" @click="pwdShow = true">{{ $t('changePwdBtn') }}</button>
                  </div>
                </div>
              </div>
            </div>

            <!-- ── Language section ── -->
            <div v-show="activeSection === 'language'" class="settings-card">
              <div class="card-body">
                <el-select :model-value="langSelect" style="width:220px" @change="changeLang">
                  <el-option label="中文" value="zh" @pointerdown.prevent.stop="changeLang('zh')"/>
                  <el-option label="English" value="en" @pointerdown.prevent.stop="changeLang('en')"/>
                </el-select>
              </div>
            </div>

            <!-- ── Signature section ── -->
            <div v-if="activeSection === 'signature'" class="settings-card">
              <div class="card-body">
                <div class="card-desc">{{ $t('signatureDesc') }}</div>
                <div class="editor-shell">
                  <tinyEditor
                    ref="signatureEditorRef"
                    :def-value="signatureText"
                    editor-id="signature-editor"
                    toolbar="bold italic underline | forecolor | link | code"
                    height="200px"
                    :light-content="true"
                    @change="onSignatureChange"
                  />
                </div>
              </div>
            </div>

            <!-- ── Auto-reply section ── -->
            <div v-show="activeSection === 'autoreply'" class="settings-card">
              <div class="card-body">
                <div class="autoreply-toggle">
                  <div>
                    <div class="toggle-label">{{ $t('autoReply') }}</div>
                    <div class="card-desc" style="margin:0">{{ $t('autoReplyDesc') }}</div>
                  </div>
                  <el-switch v-model="autoReplyEnabled" @change="saveAutoReply"/>
                </div>
                <transition name="expand">
                  <div class="autoreply-body" v-if="autoReplyEnabled">
                    <el-input
                      v-model="autoReplyMessage"
                      type="textarea" :rows="5"
                      :placeholder="$t('autoReplyMessage')"
                      resize="none"
                    />
                  </div>
                </transition>
              </div>
            </div>

            <!-- ── Push notification section ── -->
            <div v-show="activeSection === 'notification'" class="settings-card">
              <div class="card-body">

                <!-- 桌面通知 permission — web/PWA only; Electron and Android have their
                     own OS-level permission flows surfaced by the rows below instead. -->
                <div class="autoreply-toggle" v-if="!isElectronPlatform && !isAndroidPlatform">
                  <div>
                    <div class="toggle-label">{{ $t('notifDesktopPermission') }}</div>
                    <div class="card-desc" style="margin:0">
                      {{ notifPermission === 'granted' ? $t('notifAllowed') : (notifPermission === 'denied' ? $t('notifDenied') : $t('notifNotAllowed')) }}
                    </div>
                  </div>
                  <el-button
                    v-if="notifPermission !== 'granted'"
                    size="small" :disabled="notifPermission === 'denied'"
                    @click="requestNotifPermission"
                  >{{ $t('enable') }}</el-button>
                </div>

                <!-- Web 后台通知 — standards Web Push connection status. -->
                <div class="autoreply-toggle" v-if="!isElectronPlatform && !isAndroidPlatform">
                  <div>
                    <div class="toggle-label">{{ $t('notifWebBackground') }}</div>
                    <div class="card-desc" style="margin:0">{{ notifStatusText }}</div>
                    <div v-if="pushRegisterErrorCode" class="card-desc" style="margin:0">{{ $t('notifErrorCode') }}: {{ pushRegisterErrorCode }}</div>
                  </div>
                  <el-button
                    v-if="pushGrantedButDisconnected"
                    size="small" :loading="notifReconnecting"
                    @click="reconnectPush"
                  >{{ $t('notifReconnect') }}</el-button>
                </div>

                <!-- Android — FCM stays Android's transport, unchanged. -->
                <div class="autoreply-toggle" v-if="isAndroidPlatform">
                  <div>
                    <div class="toggle-label">{{ $t('notifAndroidPush') }}</div>
                    <div class="card-desc" style="margin:0">{{ androidPushConnected ? $t('notifConnected') : $t('notifNotConnected') }}</div>
                  </div>
                </div>

                <!-- Electron — native OS notifications, no Firebase/Web Push concept. -->
                <div class="autoreply-toggle" v-if="isElectronPlatform">
                  <div>
                    <div class="toggle-label">{{ $t('notifSystemNotifications') }}</div>
                    <div class="card-desc" style="margin:0">{{ $t('notifElectronOn') }}</div>
                  </div>
                </div>

                <!-- Test actions -->
                <div class="notif-test-actions" v-if="isElectronPlatform || isAndroidPlatform || notifPermission === 'granted'">
                  <el-button size="small" :loading="notifTestSending" @click="sendTestNotif">
                    {{ isElectronPlatform ? $t('notifTestNative') : $t('notifSendTest') }}
                  </el-button>
                  <el-button v-if="!isElectronPlatform && !isAndroidPlatform" size="small" @click="sendLocalTestNotif">
                    {{ $t('notifLocalTest') }}
                  </el-button>
                </div>

                <!-- Registered devices — web push subscriptions + Android FCM devices,
                     merged. Electron has no server-side device concept at all. -->
                <div class="notif-devices" v-if="!isElectronPlatform">
                  <div class="toggle-label" style="margin:16px 0 8px">{{ $t('notifDevices') }}</div>
                  <div v-if="!allNotifDevices.length" class="card-desc">{{ $t('notifNoDevices') }}</div>
                  <div v-for="d in allNotifDevices" :key="d.key" class="notif-device-row">
                    <div class="notif-device-main">
                      <span class="notif-device-name">{{ d.deviceName || d.platformLabel }}</span>
                      <span class="notif-device-platform">{{ d.platformLabel }}</span>
                      <span v-if="!d.enabled" class="notif-device-tag">{{ $t('notifDisabled') }}</span>
                    </div>
                    <div class="notif-device-meta">
                      <span>{{ $t('notifLastSeen') }}: {{ d.lastSeenTime ? dayjs(d.lastSeenTime).format('YYYY-MM-DD HH:mm') : $t('notifNever') }}</span>
                      <button class="link-btn dim" @click="removeNotifDeviceRow(d)">{{ $t('notifRemoveDevice') }}</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- ── Mail management section ── -->
            <div v-show="activeSection === 'mail'" class="settings-card">
              <div class="auto-delete-notice">
                <Icon icon="solar:danger-triangle-bold" width="15" height="15" style="flex-shrink:0"/>
                {{ $t('autoDeleteDaysUserWarn', { n: settingStore.settings.autoDeleteDays > 0 ? settingStore.settings.autoDeleteDays : 30 }) }}
              </div>
              <div class="card-body">
                <div class="autoreply-toggle">
                  <div>
                    <div class="toggle-label">{{ $t('undoSendSetting') }}</div>
                    <div class="card-desc" style="margin:0">{{ $t('undoSendSettingDesc') }}</div>
                  </div>
                  <el-select v-model="uiStore.undoSendSeconds" style="width:100px">
                    <el-option :value="0" :label="$t('undoSendOff')"/>
                    <el-option v-for="n in [5,10,20,30]" :key="n" :value="n" :label="$t('undoSendSeconds', { n })"/>
                  </el-select>
                </div>
              </div>
              <div class="card-body mail-body">
                <Account />
              </div>
            </div>

            <!-- ── Labels section ── -->
            <div v-show="activeSection === 'labels'" class="settings-card">
              <div class="card-body backup-body">
                <div class="card-desc">{{ $t('labelManageDesc') }}</div>
                <div class="label-create-row">
                  <el-input v-model="newLabelName" :placeholder="$t('newLabelPrompt')" size="default" @keyup.enter="createLabelFromSettings"/>
                  <div class="label-color-swatches">
                    <button v-for="c in LABEL_COLOR_OPTIONS" :key="c"
                            class="label-swatch" :class="{ active: newLabelColor === c }"
                            :style="{ background: c }" @click="newLabelColor = c"/>
                  </div>
                  <el-button type="primary" size="default" @click="createLabelFromSettings">{{ $t('newLabel') }}</el-button>
                </div>

                <div v-if="!labelStore.labels.length" class="backup-empty-state">{{ $t('labelEmpty') }}</div>
                <div v-for="l in labelStore.labels" :key="l.labelId" class="backup-provider-row">
                  <div class="backup-provider-info">
                    <span class="label-dot-lg" :style="{ background: l.color }"></span>
                    <div class="backup-provider-meta">
                      <template v-if="editingLabelId === l.labelId">
                        <el-input v-model="editingLabelName" size="small" style="width:180px" @keyup.enter="saveLabelRename(l)"/>
                      </template>
                      <template v-else>
                        <div class="backup-provider-name">{{ l.name }}</div>
                        <div class="backup-provider-status">{{ l.emailCount || 0 }}</div>
                      </template>
                    </div>
                  </div>
                  <div class="backup-provider-actions">
                    <template v-if="editingLabelId === l.labelId">
                      <el-button size="small" type="primary" @click="saveLabelRename(l)">{{ $t('save') }}</el-button>
                      <el-button size="small" @click="editingLabelId = null">{{ $t('cancel') }}</el-button>
                    </template>
                    <template v-else>
                      <el-button size="small" @click="startLabelRename(l)">{{ $t('labelRename') }}</el-button>
                      <el-button size="small" type="danger" plain @click="deleteLabel(l)">{{ $t('labelDelete') }}</el-button>
                    </template>
                  </div>
                </div>
              </div>
            </div>

            <!-- ── Cloud backup section ── -->
            <div v-show="activeSection === 'backup'" class="settings-card">
              <div class="card-body backup-body">
                <div v-if="availableProviders.length === 0" class="backup-empty-state">
                  {{ $t('backupNotConfigured') }}
                </div>
                <div
                  v-for="p in availableProviders"
                  :key="p.key"
                  class="backup-provider-row"
                >
                  <div class="backup-provider-info">
                    <Icon :icon="p.icon" width="28" height="28" class="backup-provider-logo"/>
                    <div class="backup-provider-meta">
                      <div class="backup-provider-name">{{ p.label }}</div>
                      <div class="backup-provider-status">
                        <template v-if="backupStatusData[p.key]">
                          <span class="backup-connected-dot"/>
                          {{ $t('backupConnected') }}
                          <span class="backup-stat">
                            · {{ $t('backupLastTime') }}: {{ formatBackupTime(backupStatusData[p.key].lastBackupAt) }}
                          </span>
                          <span v-if="backupStatusData[p.key].backupCount" class="backup-stat">
                            · {{ $t('backupCount', { n: backupStatusData[p.key].backupCount }) }}
                          </span>
                        </template>
                        <template v-else>
                          <span class="backup-disconnected-dot"/>
                          {{ $t('backupDisconnect') }}
                        </template>
                      </div>
                    </div>
                  </div>
                  <div class="backup-provider-actions">
                    <template v-if="backupStatusData[p.key]">
                      <el-button
                        size="small"
                        :loading="backupLoading[p.key]"
                        @click="triggerBackup(p.key)"
                      >{{ $t('backupNow') }}</el-button>
                      <el-button
                        size="small"
                        type="danger"
                        plain
                        @click="disconnectProvider(p.key)"
                      >{{ $t('backupDisconnect') }}</el-button>
                    </template>
                    <el-button
                      v-else
                      size="small"
                      type="primary"
                      @click="connectProvider(p.key)"
                    >{{ p.key === 'google' ? $t('backupConnectGoogle') : $t('backupConnectMicrosoft') }}</el-button>
                  </div>
                </div>
              </div>
            </div>

            <!-- ── External API section ── -->
            <div v-show="activeSection === 'apikey'" class="settings-card">
              <div class="card-body backup-body">
                <div class="card-desc">{{ $t('apiKeyDesc') }}</div>
                <el-button size="small" type="primary" style="align-self:flex-start" @click="createApiKey">
                  {{ $t('apiKeyCreate') }}
                </el-button>
                <div v-if="apiKeyList.length === 0" class="backup-empty-state">
                  {{ $t('apiKeyEmpty') }}
                </div>
                <div v-for="k in apiKeyList" :key="k.id" class="backup-provider-row">
                  <div class="backup-provider-info">
                    <Icon icon="solar:key-bold-duotone" width="24" height="24" class="backup-provider-logo"/>
                    <div class="backup-provider-meta">
                      <div class="backup-provider-name">{{ k.name || t('apiKeyUnnamed') }}</div>
                      <div class="backup-provider-status">
                        <span class="mono">{{ k.keyPrefix }}••••••••</span>
                        <span class="backup-stat">· {{ $t('apiKeyCreatedAt') }} {{ dayjs(k.createTime).format('YYYY-MM-DD HH:mm') }}</span>
                        <span class="backup-stat" v-if="k.lastUsedTime">· {{ $t('apiKeyLastUsed') }} {{ dayjs(k.lastUsedTime).format('YYYY-MM-DD HH:mm') }}</span>
                      </div>
                    </div>
                  </div>
                  <div class="backup-provider-actions">
                    <el-button size="small" type="danger" plain @click="revokeApiKey(k)">{{ $t('apiKeyRevoke') }}</el-button>
                  </div>
                </div>
              </div>
            </div>

            <!-- ── Danger zone section ── -->
            <div v-show="activeSection === 'danger'" class="settings-card">
              <div class="danger-inner">
                <div class="danger-text">
                  <div class="danger-heading">{{ $t('deleteUserBtn') }}</div>
                  <div class="danger-desc-text">{{ $t('delAccountMsg') }}</div>
                </div>
                <el-button type="danger" size="small" @click="deleteConfirm">
                  {{ $t('deleteUserBtn') }}
                </el-button>
              </div>
            </div>

          </main>
        </div>
      </div>
    </el-scrollbar>

    <!-- Password dialog -->
    <el-dialog v-model="pwdShow" :title="$t('changePassword')" width="380">
      <div class="pwd-form">
        <div class="pwd-field">
          <label class="pwd-label">{{ $t('newPassword') }}</label>
          <el-input type="password" v-model="form.password" autocomplete="off" show-password/>
        </div>
        <div class="pwd-field">
          <label class="pwd-label">{{ $t('confirmPassword') }}</label>
          <el-input type="password" v-model="form.newPwd" autocomplete="off" show-password/>
        </div>
        <el-button type="primary" :loading="setPwdLoading" @click="submitPwd" style="align-self:flex-end">
          {{ $t('save') }}
        </el-button>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { reactive, ref, computed, defineOptions, onMounted, onActivated, watch } from 'vue'
import Account from '@/layout/account/index.vue'
import { resetPassword, userDelete } from "@/request/my.js"
import { useUserStore } from "@/store/user.js"
import router from "@/router/index.js"
import { accountSetName } from "@/request/account.js"
import { useAccountStore } from "@/store/account.js"
import { useI18n } from "vue-i18n"
import { useSettingStore } from "@/store/setting.js"
import { useUiStore } from "@/store/ui.js"
import { useLabelStore } from "@/store/label.js"
import { labelCreate, labelUpdate, labelDelete } from "@/request/label.js"
import { Icon } from "@iconify/vue"
import tinyEditor from "@/components/tiny-editor/index.vue"
import http from "@/axios/index.js"
import { hasPerm } from "@/perm/perm.js"
import { backupProviders, backupConnectUrl, backupStatus, backupDisconnect, backupStart } from "@/request/backup.js"
import { apikeyList as fetchApiKeyList, apikeyCreate, apikeyRevoke } from "@/request/apikey.js"
import { listDevices, removeDevice, sendTestNotification } from "@/request/notification.js"
import { listWebPushSubscriptions, removeWebPushSubscription, sendWebPushTest } from "@/request/web-push.js"
import { useNotificationStore } from "@/store/notification.js"
import { Capacitor } from "@capacitor/core"
import dayjs from "dayjs"

const { t } = useI18n()
const accountStore = useAccountStore()
const settingStore = useSettingStore()
const uiStore = useUiStore()
const userStore = useUserStore()
const setPwdLoading = ref(false)
const setNameShow = ref(false)
const accountName = ref(null)
const langSelect = ref(settingStore.lang)
const fileInputRef = ref(null)
const pwdShow = ref(false)
const form = reactive({ password: '', newPwd: '' })
const signatureText = ref('')
const signatureLoading = ref(false)
const signatureEditorRef = ref(null)
const autoReplyEnabled = ref(false)
const autoReplyMessage = ref('')
const autoReplySaving = ref(false)

// ── Push notifications ──
// Browser permission and "push actually connected" are two different facts:
// permission can be granted while subscribe()/registration failed
// downstream, so a device only counts as connected once the server confirms
// it via GET /web-push/subscriptions (web) or GET /notification/devices
// (Android) — never from Notification.permission alone.
const notificationStore = useNotificationStore()
const notifPermission = ref(notificationStore.permission)
const notifDevices = ref([])           // Android FCM + any legacy web FCM tokens (/notification/devices)
const webPushSubscriptions = ref([])   // standards Web Push subscriptions (/web-push/subscriptions)
const notifDevicesLoaded = ref(false)
const notifTestSending = ref(false)
const notifReconnecting = ref(false)
const isElectronPlatform = !!window.electronAPI?.sendNotification
const isAndroidPlatform = !isElectronPlatform && Capacitor?.isNativePlatform?.() === true && Capacitor.getPlatform?.() === 'android'
// Split from a single pushRegisterError so the Settings UI can show both the
// failure stage AND the safe error identifier (e.name/WEB_PUSH_NOT_CONFIGURED
// — never e.message, see web-push.js#errorId) — stage alone ("subscribe")
// wasn't enough to tell a missing config apart from a browser-level failure
// without opening devtools.
const pushRegisterStage = ref('')
const pushRegisterErrorCode = ref('')

const pushConnected = computed(() => webPushSubscriptions.value.some(d => d.enabled))
const androidPushConnected = computed(() => notifDevices.value.some(d => d.platform === 'android' && d.enabled))

// permission granted, subscription list has actually loaded (not just its
// initial empty [] before the first fetch resolves), and it came back with
// nothing — distinct from pushConnected === false while still loading, and
// from a fetch that simply failed (loadNotifDevices only flips
// notifDevicesLoaded on success, so a network error leaves this false rather
// than showing a misleading "disconnected" state).
const pushGrantedButDisconnected = computed(() =>
  !isElectronPlatform &&
  !isAndroidPlatform &&
  notifPermission.value === 'granted' &&
  notifDevicesLoaded.value &&
  webPushSubscriptions.value.length === 0
)

const STAGE_LABEL_KEYS = {
  service_worker: 'notifStageServiceWorker',
  subscribe: 'notifStageSubscribe',
  device_register: 'notifStageDeviceRegister',
  permission: 'notifStagePermission',
  unsupported: 'notifStageUnsupported',
  unknown: 'notifStageUnknown',
}

// Never surface the raw subscription keys or a verbose error string here —
// only the named stage the failure happened at (see web-push.js#registerWebPush).
function stageLabel(stage) {
  const key = STAGE_LABEL_KEYS[stage]
  return key ? t(key) : stage
}

// Order matters: a failed reconnect attempt still leaves webPushSubscriptions
// empty (pushGrantedButDisconnected would also be true), so pushRegisterStage
// must be checked FIRST — otherwise a real service_worker/subscribe/
// device_register failure silently reads as the generic "granted but never
// tried" message and the user has no way to see what actually broke.
const notifStatusText = computed(() => {
  if (notifPermission.value === 'denied') return t('notifDenied')
  if (notifPermission.value !== 'granted') return t('notificationsDesc')
  if (pushConnected.value) return t('notifPushConnected')
  if (pushRegisterStage.value) return `${t('notifReconnectFailed')}: ${stageLabel(pushRegisterStage.value)}`
  if (pushGrantedButDisconnected.value) return t('notifGrantedNoDevice')
  return t('notifTestNoDevice')
})

// Cosmetic "Chrome on Windows" style label for the registered-devices list —
// simple UA sniffing, no new dependency (ua-parser-js is a backend-only dep).
function formatDevicePlatformLabel(userAgent, fallback) {
  if (!userAgent) return fallback
  const browser = /Edg\//.test(userAgent) ? 'Edge'
    : /Chrome\//.test(userAgent) ? 'Chrome'
    : /Firefox\//.test(userAgent) ? 'Firefox'
    : /Safari\//.test(userAgent) ? 'Safari'
    : fallback
  const os = /Windows/.test(userAgent) ? 'Windows'
    : /Mac OS X/.test(userAgent) ? 'macOS'
    : /Android/.test(userAgent) ? 'Android'
    : /Linux/.test(userAgent) ? 'Linux'
    : ''
  return os ? `${browser} on ${os}` : browser
}

// Merges both device pools into one list for the Settings UI — web push
// subscriptions and Android FCM devices are stored in separate tables
// (web_push_subscription vs notification_device) but shown together here.
const allNotifDevices = computed(() => {
  const webRows = webPushSubscriptions.value.map(d => ({
    key: `web-${d.id}`,
    id: d.id,
    kind: 'web',
    deviceName: d.deviceName,
    platformLabel: formatDevicePlatformLabel(d.userAgent, 'Web'),
    enabled: d.enabled,
    lastSeenTime: d.lastSeenTime,
  }))
  const androidRows = notifDevices.value
    .filter(d => d.platform === 'android')
    .map(d => ({
      key: `android-${d.id}`,
      id: d.id,
      kind: 'android',
      deviceName: d.deviceName,
      platformLabel: 'Android',
      enabled: d.enabled,
      lastSeenTime: d.lastSeenAt,
    }))
  return [...webRows, ...androidRows]
})

function loadNotifDevices() {
  return Promise.all([
    listDevices().catch(() => []),
    listWebPushSubscriptions().catch(() => []),
  ]).then(([devices, subscriptions]) => {
    notifDevices.value = devices || []
    webPushSubscriptions.value = subscriptions || []
    notifDevicesLoaded.value = true
  })
}

// Shared by "Enable" (permission just granted) and "Reconnect push"
// (permission already granted, subscription missing) — both end in the same
// subscribe() + POST /web-push/subscription round trip, which is idempotent
// (pushManager.subscribe() returns the existing subscription if one is
// already active, and the backend UPSERTs on endpoint), so calling it again
// never creates a duplicate row.
async function registerPushDevices() {
  const [{ initNativePush }, { registerWebPush }] = await Promise.all([
    import('@/utils/push-service.js'),
    import('@/web-push.js'),
  ])
  const [, webResult] = await Promise.allSettled([initNativePush(), registerWebPush()])
  if (webResult.status === 'fulfilled') {
    const webStatus = webResult.value
    const failed = webStatus && !webStatus.ok
    pushRegisterStage.value = failed ? (webStatus.stage || 'unknown') : ''
    // webStatus.error is already restricted to e.name/a known constant like
    // WEB_PUSH_NOT_CONFIGURED by web-push.js#errorId — never e.message, a
    // subscription key, or credential — so it's safe to store and render as-is.
    pushRegisterErrorCode.value = failed ? (webStatus.error || '') : ''
  } else {
    // registerWebPush() itself is supposed to catch everything into a
    // {ok:false, stage} result — a rejection here means something threw
    // outside that (e.g. a dynamic import failure), which used to silently
    // read as "success" and left the user staring at the generic
    // "not connected" message with zero indication anything went wrong.
    console.error('[web-push] registerWebPush rejected', webResult.reason)
    pushRegisterStage.value = 'unknown'
    pushRegisterErrorCode.value = ''
  }
  await loadNotifDevices()
}

async function requestNotifPermission() {
  const result = await notificationStore.requestPermission()
  notifPermission.value = result
  if (result === 'granted') {
    await registerPushDevices()
  }
}

// Manual repair path for a device that has notification permission granted
// but no server-side subscription (Settings' onMounted only *detects* this
// via loadNotifDevices — it doesn't retry on its own, so this button is the
// explicit way to retrigger registerWebPush() without asking the user to
// revoke and re-grant browser permission first).
async function reconnectPush() {
  notifReconnecting.value = true
  try {
    await registerPushDevices()
  } finally {
    notifReconnecting.value = false
  }
}

function removeNotifDeviceRow(d) {
  const request = d.kind === 'android' ? removeDevice(d.id) : removeWebPushSubscription(d.id)
  return request.then(loadNotifDevices).catch(() => {})
}

// "本地测试" — direct Notification API call, no server round trip. Distinct
// from the real backend-delivery test below.
async function sendLocalTestNotif() {
  const { showLocalTestNotification } = await import('@/web-push.js')
  const shown = await showLocalTestNotification()
  ElMessage({ message: shown ? t('notifTestSent') : t('notifTestFailed'), type: shown ? 'success' : 'error', plain: true })
}

// Electron has no server-side device registration — its "test" must exercise
// the real native-notification IPC path directly instead of calling a server
// test endpoint, which would always report "no registered device" for
// Electron. Android keeps calling the existing FCM /notification/test.
// Web/PWA calls the standards Web Push /web-push/test, scoped to its own
// subscription pool so a web test click never fires an Android device's push.
async function sendTestNotif() {
  notifTestSending.value = true
  try {
    if (isElectronPlatform) {
      const result = await window.electronAPI.sendNotification('PSG Mail', t('notifTestSent'))
      if (!result?.supported) {
        ElMessage({ message: t('notifTestNativeUnsupported'), type: 'error', plain: true })
      } else if (!result.shown) {
        ElMessage({ message: t('notifTestNativeFailed'), type: 'error', plain: true })
      } else {
        ElMessage({ message: t('notifTestSent'), type: 'success', plain: true })
      }
      return
    }

    if (isAndroidPlatform) {
      await sendTestNotification()
    } else {
      await sendWebPushTest()
    }
    ElMessage({ message: t('notifTestSent'), type: 'success', plain: true })
  } catch (e) {
    const reason = e?.message || ''
    const key = {
      NO_REGISTERED_DEVICE: 'notifTestNoDevice',
      FIREBASE_NOT_CONFIGURED: 'notifTestServerNotConfigured',
      FIREBASE_AUTH_FAILED: 'notifTestServerNotConfigured',
      FCM_SEND_FAILED: 'notifTestSendFailed',
      WEB_PUSH_NOT_CONFIGURED: 'notifTestServerNotConfigured',
      WEB_PUSH_AUTH_FAILED: 'notifTestServerNotConfigured',
      WEB_PUSH_SEND_FAILED: 'notifTestSendFailed',
    }[reason]
    ElMessage({ message: key ? t(key) : t('notifTestFailed'), type: 'error', plain: true })
  } finally {
    notifTestSending.value = false
  }
}

// ── Labels ──
const labelStore = useLabelStore()
const newLabelName = ref('')
const LABEL_COLOR_OPTIONS = ['#7e7576', '#c48c00', '#2f9e52', '#1890ff', '#a855f7', '#ef1748']
const newLabelColor = ref(LABEL_COLOR_OPTIONS[0])
const editingLabelId = ref(null)
const editingLabelName = ref('')

async function createLabelFromSettings() {
  const name = newLabelName.value.trim()
  if (!name) { ElMessage({ message: t('labelNameRequired'), type: 'error', plain: true }); return }
  try {
    const created = await labelCreate(name, newLabelColor.value)
    labelStore.upsertLocal(created)
    newLabelName.value = ''
    ElMessage({ message: t('labelCreated'), type: 'success', plain: true })
  } catch {
    ElMessage({ message: t('operationFailMsg'), type: 'error', plain: true })
  }
}

function startLabelRename(l) {
  editingLabelId.value = l.labelId
  editingLabelName.value = l.name
}

async function saveLabelRename(l) {
  const name = editingLabelName.value.trim()
  if (!name) { ElMessage({ message: t('labelNameRequired'), type: 'error', plain: true }); return }
  try {
    const updated = await labelUpdate(l.labelId, { name })
    labelStore.upsertLocal({ ...l, ...updated })
    editingLabelId.value = null
    ElMessage({ message: t('labelUpdated'), type: 'success', plain: true })
  } catch {
    ElMessage({ message: t('operationFailMsg'), type: 'error', plain: true })
  }
}

function deleteLabel(l) {
  ElMessageBox.confirm(t('labelDeleteConfirm'), { confirmButtonText: t('confirm'), cancelButtonText: t('cancel'), type: 'warning' })
    .then(() => labelDelete(l.labelId))
    .then(() => {
      labelStore.removeLocal(l.labelId)
      ElMessage({ message: t('labelDeleted'), type: 'success', plain: true })
    })
    .catch((e) => { if (e !== 'cancel') ElMessage({ message: t('operationFailMsg'), type: 'error', plain: true }) })
}

// ── Cloud backup ──
const backupStatusData = ref({})
const backupLoading = ref({ google: false, microsoft: false })
const configuredProviders = ref({ google: false, microsoft: false })

const PROVIDERS = [
  { key: 'google',    label: 'Google Drive',  icon: 'logos:google-drive' },
  { key: 'microsoft', label: 'OneDrive',       icon: 'logos:microsoft-onedrive' },
]

// Only show providers the deployment actually has OAuth credentials for —
// an unconfigured provider always fails to connect, so hide it instead.
const availableProviders = computed(() => PROVIDERS.filter(p => configuredProviders.value[p.key]))

function loadBackupProviders() {
  backupProviders().then(d => { configuredProviders.value = d }).catch(() => {})
}

function loadBackupStatus() {
  backupStatus().then(d => { backupStatusData.value = d }).catch(() => {})
}

async function connectProvider(provider) {
  try {
    const { url } = await backupConnectUrl(provider)
    const popup = window.open(url, 'backup_oauth', 'width=600,height=700,scrollbars=yes')
    const timer = setInterval(() => {
      if (popup?.closed) {
        clearInterval(timer)
        loadBackupStatus()
      }
    }, 800)
  } catch {
    ElMessage({ message: t('backupConnectFailed'), type: 'error', plain: true })
  }
}

function disconnectProvider(provider) {
  const label = PROVIDERS.find(p => p.key === provider)?.label || provider
  ElMessageBox.confirm(t('backupDisconnectConfirm', { provider: label }), {
    confirmButtonText: t('confirm'), cancelButtonText: t('cancel'), type: 'warning',
  }).then(() => {
    backupDisconnect(provider).then(() => {
      delete backupStatusData.value[provider]
      backupStatusData.value = { ...backupStatusData.value }
    })
  }).catch(() => {})
}

async function triggerBackup(provider) {
  backupLoading.value[provider] = true
  try {
    const { count } = await backupStart(provider)
    ElMessage({ message: t('backupDone', { count }), type: 'success', plain: true })
    loadBackupStatus()
  } catch {
    ElMessage({ message: t('backupFailed'), type: 'error', plain: true })
  } finally {
    backupLoading.value[provider] = false
  }
}

function formatBackupTime(ts) {
  if (!ts) return t('backupNever')
  return dayjs(ts).format('YYYY-MM-DD HH:mm')
}

// ── External API keys ──
const apiKeyList = ref([])

function loadApiKeyList() {
  fetchApiKeyList().then(list => { apiKeyList.value = list }).catch(() => {})
}

async function createApiKey() {
  try {
    const { value: name } = await ElMessageBox.prompt(t('apiKeyNamePrompt'), t('apiKeyCreate'), {
      confirmButtonText: t('confirm'), cancelButtonText: t('cancel'), inputValue: ''
    })
    const { token } = await apikeyCreate(name || '')
    await ElMessageBox.alert(token, t('apiKeyCreatedTitle'), {
      confirmButtonText: t('confirm'),
      dangerouslyUseHTMLString: true,
      message: `<div style="word-break:break-all;font-family:monospace;">${token}</div><div style="margin-top:8px;color:var(--el-text-color-secondary);font-size:12px;">${t('apiKeyShownOnce')}</div>`
    })
    loadApiKeyList()
  } catch {
    // cancelled
  }
}

function revokeApiKey(k) {
  ElMessageBox.confirm(t('apiKeyRevokeConfirm', { name: k.name || k.keyPrefix }), {
    confirmButtonText: t('confirm'), cancelButtonText: t('cancel'), type: 'warning',
  }).then(() => {
    apikeyRevoke(k.id).then(() => loadApiKeyList())
  }).catch(() => {})
}

defineOptions({ name: 'setting' })

const activeSection = ref('profile')

const navItems = computed(() => {
  const items = [
    { key: 'profile',   icon: 'solar:user-bold-duotone',            label: t('profile') },
    { key: 'language',  icon: 'solar:global-bold-duotone',          label: t('language') },
    { key: 'signature', icon: 'solar:pen-bold-duotone',             label: t('signature') },
    { key: 'autoreply', icon: 'solar:chat-round-dots-bold-duotone', label: t('autoReply') },
    { key: 'notification', icon: 'solar:bell-bold-duotone',         label: t('notifications') },
    { key: 'mail',      icon: 'solar:mailbox-bold-duotone',         label: t('mailManagement') },
    { key: 'labels',    icon: 'solar:tag-bold-duotone',             label: t('labelManage') },
    { key: 'backup',    icon: 'solar:cloud-upload-bold-duotone',    label: t('cloudBackup') },
    { key: 'apikey',    icon: 'solar:key-bold-duotone',             label: t('externalApi') },
  ]
  if (hasPerm('my:delete')) {
    items.push({ key: 'danger', icon: 'solar:danger-triangle-bold-duotone', label: t('dangerZone') })
  }
  return items
})

const sectionMeta = computed(() => ({
  profile:   { label: t('profile'),        desc: t('profileDesc') },
  language:  { label: t('language'),       desc: t('languageDesc') },
  signature: { label: t('signature'),      desc: t('signatureDesc') },
  autoreply: { label: t('autoReply'),      desc: t('autoReplyDesc') },
  notification: { label: t('notifications'), desc: t('notificationsDesc') },
  mail:      { label: t('mailManagement'), desc: t('mailManagementDesc') },
  labels:    { label: t('labelManage'),    desc: t('labelManageDesc') },
  backup:    { label: t('cloudBackup'),    desc: t('cloudBackupDesc') },
  apikey:    { label: t('externalApi'),    desc: t('apiKeyDesc') },
  danger:    { label: t('dangerZone'),     desc: t('dangerZoneDesc') },
}))

const activeMeta = computed(() => sectionMeta.value[activeSection.value] || { label: '', desc: '' })

onActivated(() => {
  signatureText.value = userStore.user.signature || ''
})

onMounted(() => {
  userStore.loadAvatar()
  signatureText.value = userStore.user.signature || ''
  http.get('/autoReply/get').then(data => {
    autoReplyEnabled.value = !!data.enabled
    autoReplyMessage.value = data.message || ''
  }).catch(() => {})
  loadBackupProviders()
  loadBackupStatus()
  loadApiKeyList()
  labelStore.load()
  if (notifPermission.value === 'granted') loadNotifDevices()

  // Handle OAuth popup redirect back with ?backup_connected=provider
  const hash = window.location.hash
  if (hash.includes('backup_connected=')) {
    const provider = hash.split('backup_connected=')[1]?.split('&')[0]
    if (provider) {
      activeSection.value = 'backup'
      ElMessage({ message: t('backupConnected'), type: 'success', plain: true })
      history.replaceState(null, '', window.location.pathname)
    }
  }
})

const userInitial = computed(() => {
  const name = userStore.user?.name?.trim()
  if (name) return name[0].toUpperCase()
  return userStore.user?.email?.[0]?.toUpperCase() || '?'
})

function triggerUpload() { fileInputRef.value?.click() }

function handleFileChange(e) {
  const file = e.target.files?.[0]
  if (!file) return
  compressImage(file, 200).then(base64 => { userStore.saveAvatar(base64) })
  e.target.value = ''
}

function compressImage(file, maxPx = 200) {
  return new Promise(resolve => {
    const reader = new FileReader()
    reader.onload = ev => {
      const img = new Image()
      img.onload = () => {
        const ratio = Math.min(maxPx / img.width, maxPx / img.height, 1)
        const canvas = document.createElement('canvas')
        canvas.width  = Math.round(img.width  * ratio)
        canvas.height = Math.round(img.height * ratio)
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', 0.88))
      }
      img.src = ev.target.result
    }
    reader.readAsDataURL(file)
  })
}

function removeAvatar() { userStore.clearAvatar() }

function showSetName() {
  accountName.value = userStore.user.name
  setNameShow.value = true
}

function setName() {
  if (!accountName.value) {
    ElMessage({ message: t('emptyUserNameMsg'), type: 'error', plain: true })
    return
  }
  setNameShow.value = false
  const name = accountName.value
  if (name === userStore.user.name) return
  const prevName = userStore.user.name
  userStore.user.name = name
  accountSetName(userStore.user.account.accountId, name).then(() => {
    ElMessage({ message: t('saveSuccessMsg'), type: 'success', plain: true })
    accountStore.changeUserAccountName = name
  }).catch(() => { userStore.user.name = prevName })
}

function onSignatureChange(html) { signatureText.value = html }

async function saveSignature() {
  signatureLoading.value = true
  try {
    const html = signatureEditorRef.value?.getContent?.() ?? signatureText.value
    await userStore.saveSignature(html)
    ElMessage({ message: t('signatureSaved'), type: 'success', plain: true })
  } finally { signatureLoading.value = false }
}

async function saveAutoReply() {
  autoReplySaving.value = true
  try {
    await http.put('/autoReply/set', { enabled: autoReplyEnabled.value, message: autoReplyMessage.value })
    ElMessage({ message: t('autoReplySaved'), type: 'success', plain: true })
  } finally { autoReplySaving.value = false }
}

function changeLang(lang) {
  let setting = {}
  try { setting = JSON.parse(localStorage.getItem('setting') || '{}') } catch {}
  localStorage.setItem('setting', JSON.stringify({ ...setting, lang }))
  window.location.reload()
}

const deleteConfirm = () => {
  ElMessageBox.confirm(t('delAccountConfirm'), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {
    userDelete().then(() => {
      localStorage.removeItem('token')
      router.replace('/login')
      ElMessage({ message: t('delSuccessMsg'), type: 'success', plain: true })
    }).catch(() => {})
  })
}

function submitPwd() {
  if (!form.password) {
    ElMessage({ message: t('emptyPwdMsg'), type: 'error', plain: true })
    return
  }
  if (form.password.length < 6) {
    ElMessage({ message: t('pwdLengthMsg'), type: 'error', plain: true })
    return
  }
  if (form.password !== form.newPwd) {
    ElMessage({ message: t('confirmPwdFailMsg'), type: 'error', plain: true })
    return
  }
  setPwdLoading.value = true
  resetPassword(form.password).then(() => {
    ElMessage({ message: t('saveSuccessMsg'), type: 'success', plain: true })
    pwdShow.value = false
    form.password = ''
    form.newPwd = ''
  }).catch(() => {}).finally(() => { setPwdLoading.value = false })
}
</script>

<style scoped lang="scss">
.settings-container {
  height: 100%;
}

.scroll {
  width: 100%;
  height: 100%;

  :deep(.el-scrollbar__view) {
    min-height: 100%;
  }

  .scroll-body {
    max-width: 980px;
    margin: 0 auto;
    padding: 16px 20px 36px;

    @media (max-width: 960px) { padding: 14px 16px 32px; }
    @media (max-width: 640px) { padding: 12px 12px 28px; }
  }
}

/* ── Shell: sidebar + panel ── */
.settings-shell {
  display: grid;
  grid-template-columns: 270px minmax(0, 1fr);
  gap: 18px;
  align-items: start;

  @media (max-width: 820px) {
    grid-template-columns: 1fr;
    gap: 12px;
  }
}

/* ── Sidebar ── */
.settings-sidebar,
.settings-panel {
  background: var(--surface, #ffffff);
  border: 1px solid var(--light-border, #e2e2e6);
  border-radius: var(--radius-md);
  box-shadow: var(--card-shadow);
  overflow: hidden;
}

.settings-sidebar {
  position: sticky;
  top: 16px;
  min-height: min(500px, calc(100vh - 32px));
  padding: 8px 0;
  display: flex;
  flex-direction: column;
  gap: 2px;

  @media (max-width: 820px) {
    position: static;
    min-height: 0;
    flex-direction: row;
    overflow-x: auto;
    padding: 0;
  }
}

.settings-nav-item {
  width: 100%;
  min-height: 44px;
  padding: 0 14px;
  display: flex;
  align-items: center;
  gap: 12px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--psg-text-secondary, #666666);
  font-family: 'IBM Plex Sans', 'Noto Sans SC', sans-serif;
  font-size: 13.5px;
  font-weight: 600;
  letter-spacing: 0;
  text-transform: none;
  cursor: pointer;
  transition: background 160ms ease, color 160ms ease;

  &:hover {
    background: rgba(0, 0, 0, 0.04);
    color: var(--el-text-color-primary);
  }

  &.active {
    background: rgba(var(--red-accent-rgb), 0.08);
    color: var(--el-text-color-primary);
    font-weight: 700;
  }

  @media (max-width: 820px) {
    width: auto;
    white-space: nowrap;
    flex: 0 0 auto;
    border-left: none;
    border-bottom: 3px solid transparent;
    padding: 0 12px;

    &.active {
      border-bottom-color: var(--red-accent);
      background: rgba(var(--red-accent-rgb), 0.06);
    }
  }
}

.settings-nav-icon {
  flex: 0 0 auto;
  color: currentColor;
}

/* ── Panel ── */
.settings-panel-header {
  min-height: 84px;
  padding: 18px 20px 16px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid var(--separator, #e5e5e5);

  h1 {
    margin: 0 0 4px;
    color: var(--el-text-color-primary);
    font-family: 'IBM Plex Sans', 'Noto Sans SC', sans-serif;
    font-size: 20px;
    font-weight: 750;
    line-height: 1.2;
    @media (max-width: 640px) { font-size: 16px; }
  }

  p {
    margin: 0;
    max-width: 38rem;
    color: var(--psg-text-secondary, #666666);
    font-size: 14px;
    font-weight: 500;
    line-height: 1.4;
  }

  @media (max-width: 520px) {
    align-items: stretch;
    flex-direction: column;
  }
}

.settings-save-button {
  flex: 0 0 auto;
  min-width: 68px;
  height: 42px !important;
  border-radius: var(--radius-sm) !important;
  margin: 0 !important;
}

.settings-card {
  background: transparent;
  border: 0;
}

.auto-delete-notice {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 16px 20px 0;
  padding: 10px 14px;
  background: rgba(var(--red-accent-rgb), 0.06);
  border-left: 3px solid var(--red-accent);
  color: var(--red-accent);
  font-size: 13px;
  font-weight: 600;
  line-height: 1.4;
}

/* ── Labels ── */
.label-create-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px;
  border-bottom: 1px solid var(--light-border-color);
}

.label-color-swatches {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.label-swatch {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  padding: 0;

  &.active { border-color: var(--el-text-color-primary); }
}

.label-dot-lg {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  flex-shrink: 0;
}

/* ── Cloud backup ── */
.backup-body {
  gap: 0;
  padding: 0;
}

.backup-empty-state {
  padding: 24px;
  font-size: 13px;
  color: var(--text-secondary, #888);
}

.backup-provider-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 24px;
  border-bottom: 1px solid var(--separator, #e5e5e5);

  &:last-child { border-bottom: 0; }

  @media (max-width: 560px) {
    flex-direction: column;
    align-items: flex-start;
  }
}

.backup-provider-info {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
}

.backup-provider-logo {
  flex-shrink: 0;
}

.backup-provider-meta {
  min-width: 0;
}

.backup-provider-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin-bottom: 3px;
}

.backup-provider-status {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  font-size: 12px;
  color: var(--psg-text-secondary, #666);
}

.backup-connected-dot {
  display: inline-block;
  width: 7px; height: 7px;
  border-radius: 50%;
  background: #22a06b;
  flex-shrink: 0;
}

.backup-disconnected-dot {
  display: inline-block;
  width: 7px; height: 7px;
  border-radius: 50%;
  background: var(--el-border-color, #ccc);
  flex-shrink: 0;
}

.backup-stat {
  color: var(--psg-text-secondary, #888);
}

.backup-provider-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

/* ── Card body padding ── */
.card-body {
  padding: 20px 24px 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.mail-body { padding: 0; }

.card-desc {
  font-size: 13px;
  line-height: 1.6;
  color: var(--psg-text-secondary, #666666);
  margin-bottom: 4px;
}

/* ── Avatar strip ── */
.avatar-strip {
  display: flex;
  align-items: flex-start;
  gap: 20px;
  padding: 20px 24px 0;
}

.avatar-wrap {
  position: relative;
  width: 76px; height: 76px;
  border-radius: var(--radius-sm); overflow: hidden;
  cursor: pointer; flex-shrink: 0;
  background: #111;
  &:hover .avatar-lens { opacity: 1; }
}

.avatar-img { width: 100%; height: 100%; object-fit: cover; display: block; }

.avatar-init {
  width: 100%; height: 100%;
  display: flex; align-items: center; justify-content: center;
  font-size: 26px; font-weight: 900;
  letter-spacing: -0.04em; color: #fff; user-select: none;
}

.avatar-lens {
  position: absolute; inset: 0;
  background: rgba(0,0,0,0.54);
  display: flex; align-items: center; justify-content: center;
  opacity: 0; transition: opacity 0.14s ease; color: #fff;
}

.avatar-meta {
  flex: 1; min-width: 0;
  display: flex; flex-direction: column; gap: 3px;
  padding-top: 2px;
}

.meta-name {
  font-size: 16px; font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--el-text-color-primary);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

.meta-email {
  font-size: 12px;
  font-family: 'IBM Plex Mono', monospace;
  color: var(--secondary-text-color);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

.meta-role {
  display: inline-flex; align-items: center;
  font-size: 9px; font-weight: 900;
  letter-spacing: 0.14em; text-transform: uppercase;
  color: var(--red-accent); background: rgba(var(--red-accent-rgb),0.07);
  border: 1px solid rgba(var(--red-accent-rgb),0.18);
  padding: 2px 6px; border-radius: var(--radius-sm);
  width: fit-content; margin-top: 4px;
}

.avatar-links {
  display: flex; align-items: center; gap: 12px;
  margin-top: 8px;
}

/* ── Data table ── */
.data-table {
  display: flex; flex-direction: column;
  padding: 0 24px 4px;
}

.data-row {
  display: grid;
  grid-template-columns: 130px 1fr;
  align-items: center;
  min-height: 52px;
  padding: 12px 0;
  border-bottom: 1px solid var(--separator, #e5e5e5);
  gap: 16px;

  &.last, &:last-child { border-bottom: none; }

  @media (max-width: 480px) {
    grid-template-columns: 1fr;
    min-height: auto; padding: 10px 0;
  }
}

.data-key {
  font-size: 13px; font-weight: 500;
  color: var(--muted, #666666); flex-shrink: 0;
}

.data-val {
  display: flex; align-items: center;
  gap: 10px; flex-wrap: wrap;
}

.val-str {
  font-size: 13.5px; color: var(--el-text-color-primary);
  overflow: hidden; white-space: nowrap; text-overflow: ellipsis;

  &.mono {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 12px; color: var(--regular-text-color);
  }
}

/* ── Link buttons ── */
.link-btn {
  background: transparent; border: none; cursor: pointer;
  font-size: 12px; font-weight: 700;
  color: var(--red-accent); padding: 0;
  transition: opacity 0.12s; user-select: none; font-family: inherit;
  &:hover { opacity: 0.65; }
  &.dim { color: var(--secondary-text-color); font-weight: 600; }
}

/* ── Editor shell ── */
.editor-shell {
  border: 1px solid var(--light-border-color);
  border-radius: var(--radius-sm); overflow: hidden;
  height: 200px;
}

/* ── Auto-reply ── */
.autoreply-toggle {
  display: flex; align-items: center; justify-content: space-between;
  gap: 16px; flex-wrap: wrap;
}

.toggle-label {
  font-size: 14px; font-weight: 700;
  color: var(--el-text-color-primary);
  margin-bottom: 4px;
}

.autoreply-body {
  display: flex; flex-direction: column; gap: 12px;
  overflow: hidden; margin-top: 4px;
}

/* ── Push notification devices ── */
.notif-test-actions {
  display: flex; align-items: center; gap: 8px;
  margin-top: 12px;
}
.notif-device-row {
  display: flex; align-items: center; justify-content: space-between;
  gap: 12px; flex-wrap: wrap;
  padding: 10px 0;
  border-top: 1px solid var(--light-border-color);
}
.notif-device-main {
  display: flex; align-items: center; gap: 8px;
}
.notif-device-name {
  font-size: 13px; font-weight: 700;
  color: var(--el-text-color-primary);
}
.notif-device-platform {
  font-size: 11px; color: var(--secondary-text-color);
  text-transform: uppercase; letter-spacing: 0.04em;
}
.notif-device-tag {
  font-size: 11px; color: #bc0000;
  border: 1px solid currentColor; border-radius: 3px;
  padding: 1px 6px;
}
.notif-device-meta {
  display: flex; align-items: center; gap: 12px;
  font-size: 12px; color: var(--secondary-text-color);
}

.expand-enter-active {
  transition: opacity 0.22s ease, transform 0.22s ease, max-height 0.26s ease;
}
.expand-leave-active {
  transition: opacity 0.14s ease, transform 0.14s ease, max-height 0.18s ease;
}
.expand-enter-from, .expand-leave-to {
  opacity: 0; transform: translateY(-6px); max-height: 0;
}
.expand-enter-to, .expand-leave-from {
  opacity: 1; transform: translateY(0); max-height: 400px;
}

/* ── Danger zone ── */
.danger-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 20px 24px 24px;

  @media (max-width: 520px) {
    flex-direction: column; align-items: flex-start;
  }
}

.danger-text { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.danger-heading { font-size: 13.5px; font-weight: 700; color: var(--el-text-color-primary); }
.danger-desc-text { font-size: 12.5px; line-height: 1.5; color: var(--regular-text-color); }

/* ── Password dialog ── */
.pwd-form {
  display: flex; flex-direction: column; gap: 16px;
  padding: 4px 0 8px;
}

.pwd-field { display: flex; flex-direction: column; gap: 6px; }

.pwd-label {
  font-size: 10px; font-weight: 900;
  text-transform: uppercase; letter-spacing: 0.10em;
  color: var(--secondary-text-color);
}
</style>
