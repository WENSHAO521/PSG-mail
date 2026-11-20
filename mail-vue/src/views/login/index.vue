<template>
  <div id="login-box" :class="{ 'has-bg': !!background }" v-loading="oauthLoading" :element-loading-text="$t('loggingIn')">
    <!-- Optional admin-configured background image -->
    <div v-if="background" class="custom-bg" :style="background"></div>

    <!-- ── Left: the brand sheet — headline, then a proof of the inbox rising
         from the bottom edge. Sample rows only (not real mail). ── -->
    <div class="brand-panel">
      <div class="brand-top">
        <BrandLogo class="brand-mark" />
        <span class="brand-name">PSG Mail</span>
      </div>

      <div class="brand-editorial">
        <h1 class="brand-wordmark">{{ $t('loginHeroTitle') }}</h1>
        <p class="brand-caption">{{ $t('brandPanelLine') }}</p>
      </div>

      <div class="brand-preview" aria-hidden="true">
        <div class="bp-head">
          <span class="bp-title">{{ $t('inbox') }}</span>
          <span class="bp-count">2 / 5</span>
        </div>
        <div v-for="row in previewRows" :key="row.subject" class="bp-row" :class="{ 'bp-row--unread': row.unread, 'bp-row--open': row.open }">
          <span class="bp-avatar">{{ row.name[0] }}</span>
          <span class="bp-text">
            <span class="bp-line"><b>{{ row.name }}</b><em>{{ row.time }}</em></span>
            <span class="bp-subject">{{ row.subject }}</span>
          </span>
        </div>
      </div>
    </div>

    <!-- ── Right auth column ── -->
    <div class="form-wrapper">
      <div class="container" :style="containerStyle">

        <!-- Compact brand header (shown when brand panel is hidden) -->
        <div class="card-brand">
          <BrandLogo class="brand-mark" />
          <div class="card-brand-meta">
            <span class="card-brand-name">PSG Mail</span>
            <span class="card-brand-sub">Panorama Scholarly Group</span>
          </div>
        </div>

        <span class="form-title">{{ show === 'login' ? $t('loginHeading') : $t('regBtn') }}</span>
        <span class="form-desc">{{ show === 'login' ? $t('loginSubtitle') : $t('regTitle') }}</span>

        <div v-show="show === 'login'">
          <label class="field-label">{{ $t('emailAccount') }}</label>
          <el-input :class="!hideLoginDomain ? 'email-input' : ''" v-model="form.email"
                    type="text" :placeholder="$t('emailAccount')" autocomplete="off">
            <template #append v-if="!hideLoginDomain">
              <div @click.stop="openSelect">
                <el-select
                    v-if="show === 'login'"
                    ref="mySelect"
                    v-model="suffix"
                    :placeholder="$t('select')"
                    class="select"
                >
                  <el-option
                      v-for="item in domainList"
                      :key="item"
                      :label="item"
                      :value="item"
                  />
                </el-select>
                <div style="color: var(--psg-text)">
                  <span>{{ suffix }}</span>
                  <Icon class="setting-icon" icon="psg:chevron-down" width="20" height="20"/>
                </div>
              </div>
            </template>
          </el-input>
          <label class="field-label">{{ $t('password') }}</label>
          <el-input v-model="form.password" :placeholder="$t('password')" type="password" autocomplete="off"
                    @keyup.enter="submit">
          </el-input>

          <div class="form-options">
            <el-checkbox v-model="rememberMe" class="remember-check">{{ $t('rememberMe') }}</el-checkbox>
            <button type="button" class="text-link" @click="openChangePassword">{{ $t('changePassword') }}</button>
          </div>

          <el-button class="btn" type="primary" @click="submit" :loading="loginLoading"
          >{{ $t('loginBtn') }}
          </el-button>


          <el-button class="btn btn-oauth" v-if="settingStore.settings.linuxdoSwitch" @click="linuxDoLogin">
            <el-avatar src="/image/linuxdo.webp" :size="18" style="margin-right: 10px" />LinuxDo
          </el-button>
        </div>
        <div v-show="show !== 'login'">
          <!-- Registration always shows the domain, regardless of the admin's
               "hide sign-in domain" setting: that toggle is meant to stop
               login-page domain enumeration, but hiding it here just leaves
               new registrants with no way to know what @domain their new
               address will get. -->
          <el-input class="email-input" v-model="registerForm.email" type="text" :placeholder="$t('emailAccount')"
                    autocomplete="off">
            <template #append>
              <div @click.stop="openSelect">
                <el-select
                    v-if="show !== 'login'"
                    ref="mySelect"
                    v-model="suffix"
                    :placeholder="$t('select')"
                    class="select"
                >
                  <el-option
                      v-for="item in domainList"
                      :key="item"
                      :label="item"
                      :value="item"
                  />
                </el-select>
                <div>
                  <span>{{ suffix }}</span>
                  <Icon class="setting-icon" icon="psg:chevron-down" width="20" height="20"/>
                </div>
              </div>
            </template>
          </el-input>
          <el-input v-model="registerForm.name" :placeholder="$t('namePlaceholder')" type="text" autocomplete="off"/>
          <el-input v-model="registerForm.password" :placeholder="$t('password')" type="password" autocomplete="off"/>
          <el-input v-model="registerForm.confirmPassword" :placeholder="$t('confirmPwd')" type="password"
                    autocomplete="off"/>
          <el-input v-if="settingStore.settings.regKey === 0" v-model="registerForm.code" :placeholder="$t('regKey')"
                    type="text" autocomplete="off"/>
          <el-input v-if="settingStore.settings.regKey === 2" v-model="registerForm.code"
                    :placeholder="$t('regKeyOptional')" type="text" autocomplete="off"/>
          <div v-show="verifyShow"
               class="register-turnstile"
               :data-sitekey="settingStore.settings.siteKey"
               data-callback="onTurnstileSuccess"
               data-error-callback="onTurnstileError"
               data-after-interactive-callback="loadAfter"
               data-before-interactive-callback="loadBefore"
          >
            <span style="font-size: 12px;color: var(--psg-danger)" v-if="botJsError">{{ $t('verifyModuleFailed') }}
              <el-button link type="primary" size="small" :loading="turnstileRetrying" @click="retryTurnstile">{{ $t('verifyRetry') }}</el-button>
            </span>
          </div>
          <el-button class="btn" style="margin: 0" type="primary" @click="submitRegister" :loading="registerLoading"
          >{{ $t('regBtn') }}
          </el-button>
          <el-button v-if="settingStore.settings.linuxdoSwitch" class="btn btn-oauth" style="margin-top: 10px"  @click="linuxDoLogin">
            <el-avatar src="/image/linuxdo.webp" :size="18" style="margin-right: 10px" />LinuxDo
          </el-button>
        </div>
        <template v-if="settingStore.settings.register === 0">
          <div class="switch" @click="openRegister" v-if="show === 'login'">{{ $t('noAccount') }}
            <span>{{ $t('regSwitch') }}</span></div>
          <div class="switch" @click="show = 'login'" v-else>{{ $t('hasAccount') }} <span>{{ $t('loginSwitch') }}</span>
          </div>
        </template>

        <div class="authorized-note">{{ $t('authorizedNote') }}</div>
      </div>
    </div>
    <el-dialog class="bind-dialog" v-model="showBindForm" :title="$t('bindEmailTitle')">
      <div class="bind-container">
        <el-input :class="!hideLoginDomain ? 'email-input' : ''" v-model="bindForm.email" type="text" :placeholder="$t('emailAccount')" autocomplete="off">
          <template #append v-if="!hideLoginDomain">
            <div @click.stop="openSelect">
              <el-select
                  ref="mySelect"
                  v-model="suffix"
                  :placeholder="$t('select')"
                  class="select"
              >
                <el-option
                    v-for="item in domainList"
                    :key="item"
                    :label="item"
                    :value="item"
                />
              </el-select>
              <div>
                <span>{{ suffix }}</span>
                <Icon class="setting-icon" icon="psg:chevron-down" width="20" height="20"/>
              </div>
            </div>
          </template>
        </el-input>
        <el-input v-if="settingStore.settings.regKey === 0" v-model="bindForm.code" :placeholder="$t('regKey')"
                  type="text" autocomplete="off"/>
        <el-input v-if="settingStore.settings.regKey === 2" v-model="bindForm.code"
                  :placeholder="$t('regKeyOptional')" type="text" autocomplete="off"/>
        <el-button class="btn" type="primary" @click="bind" :loading="bindLoading">{{ $t('bind') }}</el-button>
      </div>
    </el-dialog>
    <el-dialog
      class="password-dialog"
      v-model="changePasswordShow"
      :title="$t('changePassword')"
      width="420"
      :close-on-click-modal="!changePasswordLoading"
      :close-on-press-escape="!changePasswordLoading"
      @closed="resetChangePassword"
    >
      <div class="password-dialog-content">
        <p class="password-dialog-hint">{{ $t('changePasswordLoginHint') }}</p>

        <div class="password-field">
          <label class="field-label">{{ $t('emailAccount') }}</label>
          <el-input
            class="password-input"
            v-model="changeForm.email"
            type="email"
            :placeholder="$t('emailAccount')"
            autocomplete="username"
            @keyup.enter="submitChangePassword"
          />
        </div>

        <div class="password-field">
          <label class="field-label">{{ $t('currentPassword') }}</label>
          <el-input
            class="password-input"
            v-model="changeForm.currentPassword"
            type="password"
            :placeholder="$t('currentPassword')"
            autocomplete="current-password"
            show-password
            @keyup.enter="submitChangePassword"
          />
        </div>

        <div class="password-field">
          <label class="field-label">{{ $t('newPassword') }}</label>
          <el-input
            class="password-input"
            v-model="changeForm.newPassword"
            type="password"
            :placeholder="$t('newPassword')"
            autocomplete="new-password"
            show-password
            @keyup.enter="submitChangePassword"
          />
        </div>

        <div class="password-field">
          <label class="field-label">{{ $t('confirmPassword') }}</label>
          <el-input
            class="password-input"
            v-model="changeForm.confirmPassword"
            type="password"
            :placeholder="$t('confirmPassword')"
            autocomplete="new-password"
            show-password
            @keyup.enter="submitChangePassword"
          />
        </div>

        <div class="password-security-note">
          <Icon icon="solar:info-circle-bold-duotone" width="17" height="17" aria-hidden="true" />
          <span>{{ $t('forgotPasswordMsg') }}</span>
        </div>

        <el-button class="btn password-submit" type="primary" :loading="changePasswordLoading" @click="submitChangePassword">
          {{ $t('changePwdBtn') }}
        </el-button>
      </div>
    </el-dialog>
    <!-- Language switcher — fixed top-right -->
    <el-dropdown class="lang-switcher" placement="bottom-end" trigger="click">
      <button class="lang-btn" :title="settingStore.lang === 'zh' ? '切换语言' : 'Switch Language'">
        <!-- Hand-drawn globe: outer circle + equatorial ellipse + meridian ellipse -->
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none"
             stroke="currentColor" stroke-width="1.3" stroke-linecap="round" aria-hidden="true">
          <circle cx="9" cy="9" r="7"/>
          <ellipse cx="9" cy="9" rx="7" ry="2.6"/>
          <ellipse cx="9" cy="9" rx="2.6" ry="7"/>
          <line x1="9" y1="2" x2="9" y2="16"/>
          <line x1="2" y1="9" x2="16" y2="9"/>
        </svg>
      </button>
      <template #dropdown>
        <el-dropdown-menu>
          <el-dropdown-item @click="changeLang('zh')">
            <span class="lang-option">
              <span class="lang-mark" :class="{ active: settingStore.lang === 'zh' }">ZH</span>
              中文
            </span>
          </el-dropdown-item>
          <el-dropdown-item @click="changeLang('en')">
            <span class="lang-option">
              <span class="lang-mark" :class="{ active: settingStore.lang === 'en' }">EN</span>
              English
            </span>
          </el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>

    <a v-show="settingStore.settings.projectLink" class="psg-link" href="https://panorama-sg.com" target="_blank">
      <span class="psg-link-text">PSG</span>
    </a>
  </div>
</template>

<script setup>
import { loadTurnstile } from '@/utils/turnstile-script.js'
import BrandLogo from "@/components/brand-logo/index.vue"
// Decorative sample rows for the sign-in brand sheet (not real mail).
const previewRows = [
  { name: 'Editorial Office', time: '09:41', subject: 'Manuscript PSG-2026-118 accepted', unread: true, open: true },
  { name: 'Peer Review', time: '08:15', subject: 'Reviewer report received for PSG-2026-104', unread: true },
  { name: 'Author Services', time: 'Mon', subject: 'Proofs ready for your approval' },
  { name: 'Production', time: 'Mon', subject: 'Vol. 12, Issue 2 sent to the printer' },
  { name: 'Board Secretary', time: 'Fri', subject: 'Agenda for the editorial board, 3 Dec' },
]
import router from "@/router";
import {computed, nextTick, reactive, ref} from "vue";
import {changePassword, login, register} from "@/request/login.js";
import {websiteConfig} from "@/request/setting.js";
import {isEmail} from "@/utils/verify-utils.js";
import {useSettingStore} from "@/store/setting.js";
import {useAccountStore} from "@/store/account.js";
import {useUserStore} from "@/store/user.js";
import {useUiStore} from "@/store/ui.js";
import {Icon} from "@iconify/vue";
import {cvtR2Url} from "@/utils/convert.js";
import {loginUserInfo} from "@/request/my.js";
import {permsToRouter} from "@/perm/perm.js";
import {useI18n} from "vue-i18n";
import {oauthBindUser, oauthLinuxDoLogin} from "@/request/ouath.js";
import {initPushNotifications} from "@/init/init.js";

const {t} = useI18n();

const accountStore = useAccountStore();
const userStore = useUserStore();
const uiStore = useUiStore();
const settingStore = useSettingStore();
const loginLoading = ref(false)
const bindLoading = ref(false)
const oauthLoading = ref(false);
const showBindForm = ref(false);
const changePasswordShow = ref(false);
const changePasswordLoading = ref(false);
const show = ref('login')
const rememberMe = ref(false)

const changeForm = reactive({
  email: '',
  currentPassword: '',
  newPassword: '',
  confirmPassword: ''
})

function persistRemember() {
  if (rememberMe.value && form.email) {
    localStorage.setItem('rememberLogin', JSON.stringify({ email: form.email, suffix: suffix.value }))
  } else {
    localStorage.removeItem('rememberLogin')
  }
}

function changeLang(lang) {
  let setting = {}
  try { setting = JSON.parse(localStorage.getItem('setting') || '{}') } catch {}
  localStorage.setItem('setting', JSON.stringify({ ...setting, lang }))
  window.location.reload()
}

function forgotPassword() {
  changePasswordShow.value = false
  ElMessageBox.alert(t('forgotPasswordMsg'), t('forgotPassword'), {
    confirmButtonText: t('confirm'),
    type: 'info',
  }).catch(() => {})
}

function openChangePassword() {
  const rawEmail = String(form.email || '').trim()
  const candidate = isEmail(rawEmail) ? rawEmail : getFullEmail(rawEmail)
  changeForm.email = isEmail(candidate) ? candidate : ''
  changePasswordShow.value = true
}

function resetChangePassword() {
  changeForm.email = ''
  changeForm.currentPassword = ''
  changeForm.newPassword = ''
  changeForm.confirmPassword = ''
}

function submitChangePassword() {
  const email = String(changeForm.email || '').trim()
  if (!isEmail(email)) {
    ElMessage({ message: t('notEmailMsg'), type: 'error', plain: true })
    return
  }
  if (!changeForm.currentPassword) {
    ElMessage({ message: t('emptyCurrentPwdMsg'), type: 'error', plain: true })
    return
  }
  if (!changeForm.newPassword) {
    ElMessage({ message: t('emptyPwdMsg'), type: 'error', plain: true })
    return
  }
  if (changeForm.newPassword.length < 8) {
    ElMessage({ message: t('pwdLengthMsg'), type: 'error', plain: true })
    return
  }
  if (changeForm.newPassword.length > 30) {
    ElMessage({ message: t('passwordMaxLengthMsg'), type: 'error', plain: true })
    return
  }
  if (changeForm.newPassword === changeForm.currentPassword) {
    ElMessage({ message: t('passwordSameMsg'), type: 'error', plain: true })
    return
  }
  if (changeForm.newPassword !== changeForm.confirmPassword) {
    ElMessage({ message: t('confirmPwdFailMsg'), type: 'error', plain: true })
    return
  }

  changePasswordLoading.value = true
  changePassword(email, changeForm.currentPassword, changeForm.newPassword)
    .then(() => {
      changePasswordShow.value = false
      ElMessage({ message: t('passwordChangeSuccess'), type: 'success', plain: true })
    })
    .catch(() => {})
    .finally(() => { changePasswordLoading.value = false })
}

const bindForm = reactive({
  email: '',
  oauthUserId: '',
  code: ''
})

const form = reactive({
  email: '',
  password: '',

});
const mySelect = ref()
const suffix = ref('')
const registerForm = reactive({
  email: '',
  name: '',
  password: '',
  confirmPassword: '',
  code: null
})
const domainList = settingStore.domainList;
const registerLoading = ref(false)
suffix.value = domainList[0]

// Restore remembered institutional address (local only — never the password)
try {
  const remembered = JSON.parse(localStorage.getItem('rememberLogin') || 'null')
  if (remembered && remembered.email) {
    rememberMe.value = true
    form.email = remembered.email
    if (remembered.suffix && domainList.includes(remembered.suffix)) suffix.value = remembered.suffix
  }
} catch (e) { /* ignore malformed cache */ }
const verifyShow = ref(false)
let verifyToken = ''
let turnstileId = null
let botJsError = ref(false)
const turnstileRetrying = ref(false)

// The error message's retry: fetch the Turnstile script again if it never
// loaded, then render a fresh widget, without reloading the page.
async function retryTurnstile() {
  turnstileRetrying.value = true
  botJsError.value = false
  try {
    if (turnstileId && window.turnstile) {
      try { window.turnstile.remove(turnstileId) } catch (e) { /* already gone */ }
    }
    turnstileId = null
    const turnstile = await loadTurnstile({ force: !window.turnstile })
    await nextTick()
    turnstileId = turnstile.render('.register-turnstile')
    verifyErrorCount = 0
    startTurnstileWatchdog()
  } catch (e) {
    botJsError.value = true
  } finally {
    turnstileRetrying.value = false
  }
}
let verifyErrorCount = 0
// Cloudflare's hosted Turnstile script can fail internally (seen in the
// wild as an uncaught "DOMParser is not defined" from within its own code)
// without ever calling data-error-callback — the widget just never
// completes. Only the synchronous render() throw was covered before, so a
// user hitting this got stuck on the register form with no feedback at
// all. This watchdog surfaces the existing "verification module failed"
// message if the challenge hasn't succeeded a few seconds after showing.
let turnstileWatchdog = null
function startTurnstileWatchdog() {
  clearTimeout(turnstileWatchdog)
  turnstileWatchdog = setTimeout(() => {
    if (!verifyToken && !botJsError.value) botJsError.value = true
  }, 8000)
}

window.onTurnstileSuccess = (token) => {
  verifyToken = token;
  clearTimeout(turnstileWatchdog)
};

window.onTurnstileError = (e) => {
  if (verifyErrorCount >= 4) {
    return
  }
  verifyErrorCount++
  setTimeout(() => {
    nextTick(() => {
      if (!turnstileId) {
        turnstileId = window.turnstile.render('.register-turnstile')
      } else {
        window.turnstile.reset(turnstileId);
      }
    })
  }, 1500)
};

window.loadAfter = () => {}
window.loadBefore = () => {}

const loginOpacity = computed(() => {
  const opacity = settingStore.settings.loginOpacity
  return uiStore.dark ? `rgba(0, 0, 0, ${opacity})` : `rgba(255, 255, 255, ${opacity})`
})

const containerStyle = computed(() => {
  if (!background.value) return {}
  return {background: loginOpacity.value}
})

const loginDarkenFactor = computed(() => {
  const factor = Number(settingStore.settings.loginDarkenFactor ?? 0)
  if (Number.isNaN(factor)) return 0
  return Math.min(1, Math.max(0, factor))
})

const hideLoginDomain = computed(() => settingStore.settings.loginDomain === 1)

const background = computed(() => {
  const bg = settingStore.settings.background
  if (!bg) return ''
  const bgUrl = cvtR2Url(bg)
  return {
    'background-image': `
      linear-gradient(rgba(0, 0, 0, ${loginDarkenFactor.value}), rgba(0, 0, 0, ${loginDarkenFactor.value})),
      url(${bgUrl})
    `,
    'background-repeat': 'no-repeat, no-repeat',
    'background-size': 'cover, cover',
    'background-position': 'center, center'
  }
})

const openSelect = () => {
  mySelect.value.toggleMenu()
}

// Registration ignores hideLoginDomain: its email input always shows and
// requires picking one of domainList's suffixes (see the template comment
// above the register email field), so the suffix must always be appended
// there. Login/bind still respect the admin's hide-domain setting, where a
// hidden domain means the user types their full existing address instead.
const getFullEmail = (email, alwaysAppendDomain = false) => {
  return (!alwaysAppendDomain && hideLoginDomain.value) ? email : email + suffix.value
}

const getEmailName = (email) => {
  return email.split('@')[0]
}

function linuxDoLogin() {
  const clientId = settingStore.settings.linuxdoClientId
  const redirectUri = encodeURIComponent(settingStore.settings.linuxdoCallbackUrl)
  window.location.href =
      `https://connect.linux.do/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=openid+profile+email`
}

linuxDoGetUser();

async function linuxDoGetUser() {

  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')

  if (code) {

    oauthLoading.value = true
    oauthLinuxDoLogin(code).then(data => {

      bindForm.oauthUserId = data.userInfo.oauthUserId;

      if (!data.token) {
        showBindForm.value = true
        oauthLoading.value = false
        ElMessage({
          message: t('bindEmailRequired'),
          type: 'warning',
          duration: 4000,
          plain: true,
        })
        return;
      }

      saveToken(data.token);
    }).catch(() => {
      oauthLoading.value = false
    })
  }

  const cleanUrl = window.location.origin + window.location.pathname
  window.history.replaceState({}, '', cleanUrl)
}

function bind() {

  if (!bindForm.email) {
    ElMessage({
      message: t('emptyEmailMsg'),
      type: 'error',
      plain: true,
    })
    return
  }


  if (getEmailName(bindForm.email).length < settingStore.settings.minEmailPrefix) {
    ElMessage({
      message: t('minEmailPrefix', {msg: settingStore.settings.minEmailPrefix}),
      type: 'error',
      plain: true,
    })
    return
  }

  let email = getFullEmail(bindForm.email);


  if (!isEmail(email)) {
    ElMessage({
      message: t('notEmailMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  if (settingStore.settings.regKey === 0) {

    if (!bindForm.code) {

      ElMessage({
        message: t('emptyRegKeyMsg'),
        type: 'error',
        plain: true,
      })
      return
    }

  }

  const form = {email, oauthUserId: bindForm.oauthUserId, code: bindForm.code}

  bindLoading.value = true
  oauthBindUser(form).then(data => {
    saveToken(data.token)
  }).catch(() => {
    bindLoading.value = false
  })
}

const submit = () => {

  if (!form.email) {
    ElMessage({
      message: t('emptyEmailMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  let email = getFullEmail(form.email);

  if (!isEmail(email)) {
    ElMessage({
      message: t('notEmailMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  if (!form.password) {
    ElMessage({
      message: t('emptyPwdMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  persistRemember()
  loginLoading.value = true
  login(email, form.password).then(async data => {
    await saveToken(data.token)
  }).finally(() => {
    loginLoading.value = false
  })
}

async function saveToken(token) {
  localStorage.setItem('token', token)
  refreshWebsiteConfig()
  const user = await loginUserInfo();
  accountStore.currentAccountId = user.account.accountId;
  accountStore.currentAccount = user.account;
  userStore.user = user;
  userStore.loadAvatar();
  const routers = permsToRouter(user.permKeys);
  routers.forEach(routerData => {
    router.addRoute('layout', routerData);
  });
  // init.js's init() only runs this on a full page load with a token
  // already in localStorage — a fresh in-SPA login (this function) never
  // triggers it otherwise, leaving Notification.permission === 'granted'
  // users unregistered until their next full reload. Fire-and-forget, same
  // as init.js.
  initPushNotifications();
  await router.replace({name: 'layout'})
  uiStore.showNotice()
  oauthLoading.value = false;
  bindLoading.value = false;
}

function refreshWebsiteConfig() {
  websiteConfig().then(setting => {
    settingStore.settings = setting
    settingStore.domainList = setting.domainList
    if (!suffix.value && setting.domainList.length > 0) {
      suffix.value = setting.domainList[0]
    }
    document.title = setting.title
  }).catch(() => {})
}

// The boot-time websiteConfig() call (init.js) returns an empty domainList
// whenever the admin's "hide sign-in domain" setting is on, since that
// request can't tell login and register apart. Registration needs the real
// list regardless — re-fetch it with forRegister=1 the moment the user
// actually switches to the register tab, which the backend only honors
// while registration is open (see setting-service.js websiteConfig()).
function openRegister() {
  show.value = 'register'
  if (domainList.length === 0) {
    websiteConfig(true).then(setting => {
      settingStore.domainList = setting.domainList
      domainList.length = 0
      domainList.push(...setting.domainList)
      if (!suffix.value && setting.domainList.length > 0) {
        suffix.value = setting.domainList[0]
      }
    }).catch(() => {})
  }
}


function submitRegister() {

  if (!registerForm.email) {
    ElMessage({
      message: t('emptyEmailMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  if (getEmailName(registerForm.email).length < settingStore.settings.minEmailPrefix) {
    ElMessage({
      message: t('minEmailPrefix', {msg: settingStore.settings.minEmailPrefix}),
      type: 'error',
      plain: true,
    })
    return
  }

  const email = getFullEmail(registerForm.email, true);

  if (!isEmail(email)) {
    ElMessage({
      message: t('notEmailMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  if (!registerForm.password) {
    ElMessage({
      message: t('emptyPwdMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  if (registerForm.password.length < 8) {
    ElMessage({
      message: t('pwdLengthMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  if (registerForm.password !== registerForm.confirmPassword) {

    ElMessage({
      message: t('confirmPwdFailMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  if (settingStore.settings.regKey === 0) {

    if (!registerForm.code) {

      ElMessage({
        message: t('emptyRegKeyMsg'),
        type: 'error',
        plain: true,
      })
      return
    }

  }

  if (!verifyToken && (settingStore.settings.registerVerify === 0 || (settingStore.settings.registerVerify === 2 && settingStore.settings.regVerifyOpen))) {
    if (!verifyShow.value) {
      verifyShow.value = true
      startTurnstileWatchdog()
      nextTick(() => {
        if (!turnstileId) {
          try {
            turnstileId = window.turnstile.render('.register-turnstile')
          } catch (e) {
            botJsError.value = true
          }
        } else {
          window.turnstile.reset('.register-turnstile')
        }
      })
    } else if (!botJsError.value) {
      ElMessage({
        message: t('botVerifyMsg'),
        type: "error",
        plain: true
      })
    }
    return;
  }

  registerLoading.value = true

  const form = {
    email,
    name: registerForm.name.trim(),
    password: registerForm.password,
    token: verifyToken,
    code: registerForm.code
  }

  register(form).then(({regVerifyOpen}) => {
    show.value = 'login'
    registerForm.email = ''
    registerForm.name = ''
    registerForm.password = ''
    registerForm.confirmPassword = ''
    registerForm.code = ''
    registerLoading.value = false
    verifyToken = ''
    settingStore.settings.regVerifyOpen = regVerifyOpen
    verifyShow.value = false
    ElMessage({
      message: t('regSuccessMsg'),
      type: 'success',
      plain: true,
    })
  }).catch(res => {

    registerLoading.value = false

    if (res.code === 400) {
      verifyToken = ''
      settingStore.settings.regVerifyOpen = true
      startTurnstileWatchdog()
      if (turnstileId) {
        window.turnstile.reset(turnstileId)
      } else {
        nextTick(() => {
          turnstileId = window.turnstile.render('.register-turnstile')
        })
      }
      verifyShow.value = true

    }
  });
}

</script>


<style>
.el-select-dropdown__item {
  padding: 0 15px;
}

.no-autofill-pwd {
  .el-input__inner {
    -webkit-text-security: disc !important;
  }
}
</style>


<style lang="scss" scoped>
/* ═══════════════════════════════════════════════════════════
   PSG Institutional Mail — Sign in
   Swiss/editorial, monochrome. Supports Light and Dark via
   --psg-* tokens — no fixed-light lock.
   ═══════════════════════════════════════════════════════════ */

#login-box {
  height: 100%;
  width: 100%;
  display: flex;
  background: var(--psg-surface);
  overflow: hidden;
  position: relative;
  font-family: var(--psg-font-sans);
}

.custom-bg {
  position: absolute;
  inset: 0;
  z-index: 0;
}

/* ── Left: the brand sheet ─────────────────────────────────────── */
.brand-panel {
  position: relative;
  z-index: 1;
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: 32px 56px 0;
  background: var(--psg-canvas);
  border-right: 1px solid var(--psg-border);
  overflow: hidden;

  @media (max-width: 980px) { display: none; }
}

.brand-top { display: flex; align-items: center; gap: 10px; }

.brand-mark {
  width: 20px;
  height: 24px;
  flex-shrink: 0;
  color: var(--psg-text);
}

.brand-name { font-size: 16px; font-weight: 600; color: var(--psg-text); }

.brand-editorial { margin-top: clamp(48px, 12vh, 128px); max-width: 560px; }

.brand-wordmark {
  margin: 0;
  font-family: var(--psg-font-display);
  font-size: clamp(40px, 4.2vw, 60px);
  font-weight: 400;
  letter-spacing: -.02em;
  line-height: 1.05;
  color: var(--psg-text);
  text-wrap: balance;
}

.brand-caption {
  margin: 20px 0 0;
  max-width: 28rem;
  font-size: 17px;
  line-height: 28px;
  color: var(--psg-text-secondary);
}

/* The proof: a slice of the real inbox, cropped by the bottom edge. */
.brand-preview {
  margin-top: auto;
  transform: translateY(24px);
  width: min(560px, 100%);
  max-height: 46vh;
  overflow: hidden;
  border: 1px solid var(--psg-border);
  border-bottom: 0;
  border-radius: var(--psg-radius-lg) var(--psg-radius-lg) 0 0;
  background: var(--psg-surface);
  box-shadow: var(--psg-shadow-md);
}

.bp-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 16px 20px 12px;
  border-bottom: 1px solid var(--psg-border);
}

.bp-title { font-family: var(--psg-font-display); font-size: 22px; color: var(--psg-text); }
.bp-count { font-family: var(--psg-font-mono); font-size: 12px; color: var(--psg-text-muted); }

.bp-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 20px;
  border-bottom: 1px solid var(--psg-border);
}

.bp-row--open { background: var(--psg-surface-active); }

.bp-avatar {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--psg-surface-active);
  color: var(--psg-text-secondary);
  font-size: 13px;
  font-weight: 500;
}

.bp-row--open .bp-avatar { background: var(--psg-surface); }

.bp-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0; }

.bp-line {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 14px;
  line-height: 20px;

  b { font-weight: 400; color: var(--psg-text-secondary); }
  em { font-style: normal; font-family: var(--psg-font-mono); font-size: 12px; color: var(--psg-text-muted); }
}

.bp-subject {
  font-size: 14px;
  line-height: 20px;
  color: var(--psg-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Margin mark on unread mail, as in the app. */
.bp-row--unread {
  &::before {
    content: '';
    position: absolute;
    left: 0;
    top: 12px;
    bottom: 12px;
    width: 2px;
    border-radius: 0 2px 2px 0;
    background: var(--psg-primary);
  }

  .bp-line b { font-weight: 600; color: var(--psg-text); }
  .bp-line em { color: var(--psg-text); }
  .bp-subject { color: var(--psg-text); font-weight: 500; }
}

/* ── Right auth column ──────────────────────────────────────── */
.form-wrapper {
  position: relative;
  z-index: 1;
  flex: 0 0 min(560px, 44vw);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48px;
  background: var(--psg-surface);

  @media (max-width: 980px) { flex: 1 1 auto; padding: 32px; }
  @media (max-width: 767px) { padding: 24px 20px; }
}

.container {
  width: 100%;
  max-width: 380px;
  background: transparent;
  border: 0;
  border-radius: 0;
  box-shadow: none;
  padding: 0;
  display: flex;
  flex-direction: column;
}

/* Compact brand (shown when the side panel is hidden) */
.card-brand {
  display: none;
  align-items: center;
  gap: 10px;
  margin-bottom: 40px;

  @media (max-width: 980px) { display: flex; }
}

.card-brand-meta { display: flex; flex-direction: column; gap: 0; min-width: 0; }
.card-brand-name {
  font-size: 16px;
  font-weight: 500;
  color: var(--psg-text);
}
.card-brand-sub {
  font-size: 12px;
  color: var(--psg-text-muted);
}

.form-eyebrow {
  font-size: 12px;
  font-weight: 500;
  color: var(--psg-text-muted);
  margin-bottom: 12px;
}

.form-title {
  font-family: var(--psg-font-display);
  font-weight: 400;
  font-size: 32px;
  line-height: 40px;
  letter-spacing: -.01em;
  color: var(--psg-text);
}

.form-desc {
  margin-top: 4px;
  margin-bottom: 32px;
  color: var(--psg-text-secondary);
  font-size: 14px;
  line-height: 20px;
}

.field-label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--psg-text);
  margin: 0 0 8px;
}

/* ── Inputs ─────────────────────────────────────────────────── */
.el-input {
  width: 100%;
  margin-bottom: 16px;
}

:deep(.el-input__wrapper) {
  border-radius: var(--psg-radius-sm) !important;
  height: 40px;
}
:deep(.el-input__inner) {
  font-size: 14px !important;
  color: var(--psg-text) !important;
}

/* ── Email + domain group: one field, the domain in a muted end cap ── */
.email-input :deep(.el-input__wrapper) {
  border-top-left-radius: var(--psg-radius-sm) !important;
  border-bottom-left-radius: var(--psg-radius-sm) !important;
  border-top-right-radius: 0 !important;
  border-bottom-right-radius: 0 !important;
  height: 40px;
}
.email-input :deep(.el-input-group__append) {
  box-shadow: inset 0 1px 0 var(--psg-border), inset -1px 0 0 var(--psg-border), inset 0 -1px 0 var(--psg-border) !important;
  border: 0 !important;
  border-top-right-radius: var(--psg-radius-sm) !important;
  border-bottom-right-radius: var(--psg-radius-sm) !important;
  border-top-left-radius: 0 !important;
  border-bottom-left-radius: 0 !important;
  background: var(--psg-surface-muted) !important;
  padding: 0 12px !important;
  height: 40px;
  font-family: var(--psg-font-mono);
  font-size: 13px !important;
  font-weight: 400 !important;
  white-space: nowrap;
  color: var(--psg-text-secondary) !important;
}

/* ── Options row ────────────────────────────────────────────── */
.form-options {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 0 0 24px;
}
.remember-check :deep(.el-checkbox__label) {
  font-size: 13px;
  color: var(--psg-text-secondary);
  padding-left: 8px;
}
.text-link {
  border: 0;
  padding: 0;
  background: transparent;
  font-family: inherit;
  font-size: 13px;
  font-weight: 400;
  color: var(--psg-text-secondary);
  cursor: pointer;
  text-align: right;
  transition: color var(--psg-dur-fast) var(--psg-ease);
}
.text-link:hover { color: var(--psg-text); text-decoration: underline; text-underline-offset: 3px; }

/* ── Buttons ────────────────────────────────────────────────── */
.btn {
  height: 40px;
  width: 100%;
  border-radius: var(--psg-radius-sm);
  font-weight: 500;
  font-size: 14px;
}
.btn-oauth { margin: 12px 0 0 !important; }

/* ── Switch + note ──────────────────────────────────────────── */
.switch {
  margin-top: 24px;
  text-align: center;
  font-size: 13px;
  color: var(--psg-text-secondary);
  cursor: pointer;

  span {
    color: var(--psg-text);
    cursor: pointer;
    font-weight: 500;
    text-decoration: underline;
    text-underline-offset: 3px;
  }
}

.authorized-note {
  margin-top: 32px;
  padding-top: 16px;
  border-top: 1px solid var(--psg-border);
  font-size: 12px;
  line-height: 18px;
  color: var(--psg-text-muted);
  text-align: center;
}

/* ── Has custom background: drop the panel, float the card ───── */
#login-box.has-bg .brand-panel { display: none; }
#login-box.has-bg .form-wrapper { flex: 1 1 auto; }
#login-box.has-bg .card-brand { display: flex; }

/* ── Misc (preserved) ───────────────────────────────────────── */
.setting-icon {
  flex: none;
}

.select {
  position: absolute;
  right: 30px;
  width: 100px;
  opacity: 0;
  pointer-events: none;
}

/* The append slot's content is a plain <div><div><span>domain</span>
   <Icon/></div></div> with no layout of its own, so the chevron (an
   inline svg) sat on its own line below the domain text instead of
   beside it — the ".setting-icon{top:6px}" offset above was a failed
   attempt to nudge it into place without ever giving the row a flex
   context. Centering both wrapper divs as a single-line flex row (and
   dropping that offset) puts the text and chevron on one baseline. */
.email-input :deep(.el-input-group__append) > div {
  display: flex;
  align-items: center;
  height: 100%;
}
.email-input :deep(.el-input-group__append) > div > div {
  display: flex;
  align-items: center;
  gap: 4px;
}

.register-turnstile {
  margin-bottom: 18px;
}

:deep(.el-select-dropdown__item) {
  padding: 0 10px;
}

:deep(.bind-dialog) {
  width: 400px !important;
  @media (max-width: 440px) {
    width: calc(100% - 40px) !important;
    margin-right: 20px !important;
    margin-left: 20px !important;
  }
}

:deep(.password-dialog) {
  width: min(420px, calc(100vw - 24px)) !important;
  max-width: calc(100vw - 24px) !important;

  .el-dialog__header {
    padding: 18px 16px 12px;
  }

  .el-dialog__body {
    padding: 0 16px 18px;
    max-height: min(70vh, 560px);
    overflow-y: auto;
  }

  @media (max-width: 440px) {
    width: calc(100vw - 24px) !important;
    margin: 12px auto !important;
  }
}

.password-dialog-content {
  display: flex;
  flex-direction: column;

  :deep(.password-input) {
    width: 100%;
    margin: 0 !important;
  }

  :deep(.el-input__wrapper) {
    box-sizing: border-box;
    width: 100%;
    height: 46px;
    min-height: 46px;
    padding: 0 12px;
    border: 1px solid var(--psg-border) !important;
    border-radius: var(--psg-radius-xs) !important;
    background: var(--psg-surface-muted) !important;
    box-shadow: none !important;
    transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease !important;

    &:hover {
      border-color: var(--psg-text-secondary) !important;
      background: var(--psg-surface) !important;
    }

    &.is-focus {
      border-color: var(--psg-focus) !important;
      background: var(--psg-surface) !important;
      box-shadow: 0 0 0 2px var(--psg-primary-muted) !important;
    }
  }

  :deep(.el-input__inner) {
    box-sizing: border-box;
    height: 44px;
    padding: 0;
    line-height: 44px;
  }

  :deep(.el-input__suffix) {
    color: var(--psg-text-secondary);
  }

  :deep(.password-submit) {
    width: 100%;
    margin-top: 2px;
  }
}

.password-field {
  display: flex;
  flex-direction: column;
  gap: 7px;
  margin-bottom: 14px;

  .field-label {
    margin: 0;
  }
}

.password-dialog-hint {
  margin: 0 0 20px;
  color: var(--psg-text-secondary);
  font-size: 13px;
  line-height: 1.65;
}

.password-security-note {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 2px 0 18px;
  color: var(--psg-text-muted);
  font-size: 12px;
  line-height: 1.55;

  svg {
    flex: 0 0 auto;
    margin-top: 1px;
    color: var(--psg-primary);
  }
}

.bind-container {
  display: grid;
  grid-template-columns: 1fr;
  gap: 15px;
}

:deep(.el-button + .el-button) {
  margin: 0;
}

.psg-link {
  position: fixed;
  display: flex;
  align-items: center;
  justify-content: center;
  bottom: 14px;
  right: 16px;
  z-index: 1000;
  opacity: 0.55;
  transition: opacity 0.15s;

  @media (hover: hover) {
    &:hover { opacity: 1; }
  }

  .psg-link-text {
    font-family: var(--psg-font-sans);
    font-variant-numeric: tabular-nums;
    font-size: 10px;
    font-weight: 500;
    color: var(--psg-text-secondary);
    text-decoration: none;
  }
}

/* ── Language switcher ──────────────────────────────────────── */
.lang-switcher {
  position: fixed;
  top: 14px;
  right: 16px;
  z-index: 1001;
}

.lang-btn {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--psg-radius-xs);
  border: 1px solid var(--psg-border);
  background: var(--psg-surface);
  box-shadow: var(--psg-shadow-sm);
  cursor: pointer;
  color: var(--psg-text-secondary);
  transition: border-color 0.15s, color 0.15s, box-shadow 0.15s;

  @media (hover: hover) {
    &:hover {
      border-color: var(--psg-primary);
      color: var(--psg-primary);
      box-shadow: var(--psg-shadow-md);
    }
  }
}

.lang-option {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: var(--psg-font-sans);
  font-size: 13px;
}

.lang-mark {
  font-family: var(--psg-font-sans);
  font-variant-numeric: tabular-nums;
  font-size: 9px;
  font-weight: 500;
  padding: 1px 4px;
  border: 1px solid var(--psg-border);
  color: var(--psg-text-muted);

  &.active {
    border-color: var(--psg-primary);
    color: var(--psg-text);
  }
}
</style>
