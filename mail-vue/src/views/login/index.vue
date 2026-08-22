<template>
  <div id="login-box" :class="{ 'has-bg': !!background }" v-loading="oauthLoading" :element-loading-text="$t('loggingIn')">
    <!-- Optional admin-configured background image -->
    <div v-if="background" class="custom-bg" :style="background"></div>

    <!-- ── Left brand panel — soft gradient, modern ── -->
    <div class="brand-panel">
      <div class="brand-glow brand-glow--a" aria-hidden="true"></div>
      <div class="brand-glow brand-glow--b" aria-hidden="true"></div>

      <div class="brand-editorial">
        <div class="brand-eyebrow">{{ $t('institutionalMail') }}</div>
        <h1 class="brand-wordmark">PANORAMA<br/>SCHOLARLY GROUP</h1>
        <div class="brand-divider"></div>
        <p class="brand-caption">{{ $t('brandPanelLine') }}</p>
      </div>

      <div class="brand-footnote">EST · EDITORIAL · PEER REVIEW · ACADEMIC PRESS</div>
    </div>

    <!-- ── Right auth column ── -->
    <div class="form-wrapper">
      <div class="container">

        <!-- Compact brand header (shown when brand panel is hidden) -->
        <div class="card-brand">
          <div class="card-brand-meta">
            <span class="card-brand-name">PANORAMA SCHOLARLY GROUP</span>
            <span class="card-brand-sub">{{ $t('institutionalMail') }}</span>
          </div>
        </div>

        <span class="form-eyebrow">{{ $t('institutionalMail') }}</span>
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
            <span class="text-link" @click="forgotPassword">{{ $t('forgotPassword') }}</span>
          </div>

          <el-button class="btn" type="primary" @click="submit" :loading="loginLoading"
          >{{ $t('loginBtn') }}
          </el-button>

          <button class="twofactor-entry" @click="twoFactor">
            <Icon icon="solar:fingerprint-bold-duotone" width="17" height="17"/>
            <span>{{ $t('twoFactorEntry') }}</span>
          </button>

          <el-button class="btn btn-oauth" v-if="settingStore.settings.linuxdoSwitch" @click="linuxDoLogin">
            <el-avatar src="/image/linuxdo.webp" :size="18" style="margin-right: 10px" />LinuxDo
          </el-button>
        </div>
        <div v-show="show !== 'login'">
          <el-input :class="!hideLoginDomain ? 'email-input' : ''" v-model="registerForm.email" type="text" :placeholder="$t('emailAccount')"
                    autocomplete="off">
            <template #append v-if="!hideLoginDomain">
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
            <span style="font-size: 12px;color: var(--psg-danger)" v-if="botJsError">{{ $t('verifyModuleFailed') }}</span>
          </div>
          <el-button class="btn" style="margin: 0" type="primary" @click="submitRegister" :loading="registerLoading"
          >{{ $t('regBtn') }}
          </el-button>
          <el-button v-if="settingStore.settings.linuxdoSwitch" class="btn btn-oauth" style="margin-top: 10px"  @click="linuxDoLogin">
            <el-avatar src="/image/linuxdo.webp" :size="18" style="margin-right: 10px" />LinuxDo
          </el-button>
        </div>
        <template v-if="settingStore.settings.register === 0">
          <div class="switch" @click="show = 'register'" v-if="show === 'login'">{{ $t('noAccount') }}
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
import router from "@/router";
import {computed, nextTick, reactive, ref} from "vue";
import {login} from "@/request/login.js";
import {register} from "@/request/login.js";
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
const show = ref('login')
const rememberMe = ref(false)

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
  ElMessageBox.alert(t('forgotPasswordMsg'), t('forgotPassword'), {
    confirmButtonText: t('confirm'),
    type: 'info',
  }).catch(() => {})
}

function twoFactor() {
  ElMessageBox.alert(t('twoFactorMsg'), t('twoFactorEntry'), {
    confirmButtonText: t('confirm'),
    type: 'info',
  }).catch(() => {})
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
let verifyErrorCount = 0

window.onTurnstileSuccess = (token) => {
  verifyToken = token;
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

const getFullEmail = (email) => {
  return hideLoginDomain.value ? email : email + suffix.value
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

  const email = getFullEmail(registerForm.email);

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

  if (registerForm.password.length < 6) {
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
  background: var(--psg-canvas);
  overflow: hidden;
  position: relative;
  font-family: var(--psg-font-sans);
}

.custom-bg {
  position: absolute;
  inset: 0;
  z-index: 0;
}

/* ── Left brand panel ───────────────────────────────────────── */
.brand-panel {
  position: relative;
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 60px 64px;
  background: var(--psg-canvas);
  overflow: hidden;

  @media (max-width: 980px) { display: none; }
}

.brand-glow {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  pointer-events: none;
  z-index: 0;
}
.brand-glow--a {
  top: -12%;
  right: -10%;
  width: 46%;
  aspect-ratio: 1;
  background: radial-gradient(circle, var(--psg-primary-muted-strong), transparent 70%);
}
.brand-glow--b {
  bottom: -16%;
  left: -8%;
  width: 38%;
  aspect-ratio: 1;
  background: radial-gradient(circle, var(--psg-primary-muted), transparent 70%);
}

.brand-editorial {
  position: relative;
  z-index: 1;
  margin: auto 0;
  max-width: 480px;
}

.brand-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--psg-primary);
}

.brand-wordmark {
  margin: 18px 0 0;
  font-size: clamp(30px, 3.2vw, 44px);
  font-weight: 700;
  line-height: 1.14;
  letter-spacing: -0.02em;
  color: var(--psg-text);
}

.brand-divider {
  width: 40px;
  height: 4px;
  border-radius: var(--psg-radius-full);
  background: var(--psg-primary);
  margin: 26px 0 20px;
}

.brand-caption {
  margin: 0;
  max-width: 380px;
  font-size: 15px;
  line-height: 1.62;
  color: var(--psg-text-secondary);
}

.brand-footnote {
  position: relative;
  z-index: 1;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--psg-text-muted);
}

/* ── Right auth column ──────────────────────────────────────── */
.form-wrapper {
  position: relative;
  z-index: 1;
  flex: 0 0 500px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;

  @media (max-width: 980px) { flex: 1 1 auto; }
  @media (max-width: 767px) { padding: 20px; }
  @media (max-width: 420px) {
    padding: 12px;
  }
}

.container {
  width: 100%;
  max-width: 408px;
  background: var(--psg-surface);
  border: 1px solid var(--psg-border);
  border-radius: var(--psg-radius-lg);
  box-shadow: var(--psg-shadow-lg);
  padding: 40px 36px 26px;
  display: flex;
  flex-direction: column;

  @media (max-width: 767px) { padding: 32px 22px 22px; }
  @media (max-width: 420px) {
    padding: 28px 18px 20px;
    max-width: 100%;
    border-radius: var(--psg-radius-md);
  }
}

/* Compact in-card brand (shown when side panel is hidden) */
.card-brand {
  display: none;
  align-items: center;
  gap: 12px;
  padding-bottom: 22px;
  margin-bottom: 24px;
  border-bottom: 1px solid var(--psg-border);

  @media (max-width: 980px) { display: flex; }
}

.card-brand-meta { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.card-brand-name {
  font-family: var(--psg-font-mono);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--psg-text);

  @media (max-width: 420px) {
    font-size: 11px;
    letter-spacing: 0.02em;
  }
}
.card-brand-sub {
  font-family: var(--psg-font-mono);
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--psg-text-secondary);
}

.form-eyebrow {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--psg-primary);
  margin-bottom: 12px;
}

.form-title {
  font-weight: 700;
  font-size: 26px;
  letter-spacing: -0.02em;
  line-height: 1.2;
  color: var(--psg-text);
}

.form-desc {
  margin-top: 10px;
  margin-bottom: 28px;
  color: var(--psg-text-secondary);
  font-size: 13px;
  line-height: 1.6;
}

.field-label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: var(--psg-text);
  letter-spacing: 0.01em;
  margin: 2px 0 7px;
}

/* ── Inputs ─────────────────────────────────────────────────── */
.el-input {
  width: 100%;
  margin-bottom: 14px;
}

:deep(.el-input__wrapper) {
  border-radius: var(--psg-radius-md) !important;
  height: 46px;
  background: var(--psg-surface-muted) !important;
  box-shadow: 0 0 0 1px var(--psg-border) !important;
  transition: box-shadow 0.15s ease, background 0.15s ease !important;
}
:deep(.el-input__wrapper:hover) {
  background: var(--psg-surface) !important;
  box-shadow: 0 0 0 1px var(--psg-text-secondary) !important;
}
:deep(.el-input__wrapper.is-focus) {
  background: var(--psg-surface) !important;
  box-shadow: 0 0 0 1.5px var(--psg-focus), 0 0 0 4px var(--psg-primary-muted) !important;
}
:deep(.el-input__inner) {
  font-size: 14px !important;
  color: var(--psg-text) !important;
}

/* ── Email + domain group ───────────────────────────────────── */
.email-input :deep(.el-input__wrapper) {
  box-shadow: none !important;
  border-top:    1px solid var(--psg-border) !important;
  border-bottom: 1px solid var(--psg-border) !important;
  border-left:   1px solid var(--psg-border) !important;
  border-right:  none !important;
  border-radius: var(--psg-radius-md) !important;
  background: var(--psg-surface-muted) !important;
  height: 46px;
  transition: border-color 0.15s !important;
}
.email-input :deep(.el-input__wrapper.is-focus) {
  border-color: var(--psg-focus) !important;
  box-shadow: none !important;
}
.email-input :deep(.el-input-group__append) {
  box-shadow: none !important;
  border-top:    1px solid var(--psg-border) !important;
  border-right:  1px solid var(--psg-border) !important;
  border-bottom: 1px solid var(--psg-border) !important;
  border-left:   1px solid var(--psg-border) !important;
  border-radius: var(--psg-radius-md) !important;
  background: var(--psg-surface-active) !important;
  padding: 0 12px !important;
  height: 46px;
  font-size: 13px !important;
  font-weight: 500 !important;
  white-space: nowrap;
  color: var(--psg-text-secondary) !important;
}
.email-input:focus-within :deep(.el-input-group__append) {
  border-top-color:    var(--psg-focus) !important;
  border-right-color:  var(--psg-focus) !important;
  border-bottom-color: var(--psg-focus) !important;
}

/* ── Options row ────────────────────────────────────────────── */
.form-options {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 4px 0 20px;
}
.remember-check :deep(.el-checkbox__label) {
  font-size: 13px;
  color: var(--psg-text-secondary);
  padding-left: 7px;
}
.text-link {
  font-size: 13px;
  font-weight: 500;
  color: var(--psg-text);
  cursor: pointer;
  transition: opacity 0.12s;
}
.text-link:hover { opacity: .7; text-decoration: underline; }

/* ── Buttons ────────────────────────────────────────────────── */
.btn {
  height: 46px;
  width: 100%;
  border-radius: var(--psg-radius-md);
  font-weight: 600;
  letter-spacing: 0.01em;
  font-size: 14px;
}
.btn-oauth { margin-top: 12px; }

:deep(.el-button--primary) {
  background: var(--psg-primary) !important;
  border-color: var(--psg-primary) !important;
  color: var(--psg-on-primary) !important;
  font-weight: 600 !important;
  border-radius: var(--psg-radius-md) !important;
  letter-spacing: 0.01em !important;
  box-shadow: var(--psg-shadow-sm) !important;
  transition: background 0.15s ease, box-shadow 0.15s ease, transform 0.1s ease !important;

  &:hover, &:focus {
    background: var(--psg-primary-hover) !important;
    border-color: var(--psg-primary-hover) !important;
    box-shadow: var(--psg-shadow-md) !important;
  }
  &:active {
    background: var(--psg-primary-active) !important;
    border-color: var(--psg-primary-active) !important;
    transform: translateY(1px);
    box-shadow: var(--psg-shadow-xs) !important;
  }
  &.is-loading { opacity: 0.75; }
}

/* ── Two-factor entry ───────────────────────────────────────── */
.twofactor-entry {
  margin-top: 14px;
  width: 100%;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: var(--psg-surface-muted);
  border: 1px solid var(--psg-border);
  border-radius: var(--psg-radius-md);
  cursor: pointer;
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.01em;
  color: var(--psg-text);
  transition: border-color 0.15s, background 0.15s;

  svg { color: var(--psg-primary); }

  &:hover { border-color: var(--psg-primary); background: var(--psg-primary-muted); }
}

/* ── Switch + note ──────────────────────────────────────────── */
.switch {
  margin-top: 22px;
  text-align: center;
  font-size: 13px;
  color: var(--psg-text-secondary);
  cursor: pointer;

  span {
    color: var(--psg-text);
    cursor: pointer;
    font-weight: 600;
    text-decoration: underline;
  }
}

.authorized-note {
  margin-top: 26px;
  padding-top: 18px;
  border-top: 1px solid var(--psg-border);
  font-size: 11px;
  line-height: 1.6;
  letter-spacing: 0.01em;
  color: var(--psg-text-muted);
  text-align: center;
}

/* ── Has custom background: drop the panel, float the card ───── */
#login-box.has-bg .brand-panel { display: none; }
#login-box.has-bg .form-wrapper { flex: 1 1 auto; }
#login-box.has-bg .card-brand { display: flex; }

/* ── Misc (preserved) ───────────────────────────────────────── */
.setting-icon {
  position: relative;
  top: 6px;
}

.select {
  position: absolute;
  right: 30px;
  width: 100px;
  opacity: 0;
  pointer-events: none;
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
    font-family: var(--psg-font-mono);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
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
  border-radius: var(--psg-radius-full);
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
  font-family: var(--psg-font-mono);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.06em;
  padding: 1px 4px;
  border: 1px solid var(--psg-border);
  color: var(--psg-text-muted);

  &.active {
    border-color: var(--psg-primary);
    color: var(--psg-text);
  }
}
</style>
