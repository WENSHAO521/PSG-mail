<template>
  <div class="settings-container">
    <div class="loading" :class="firstLoading ? 'loading-show' : 'loading-hide'">
      <loading/>
    </div>
    <el-scrollbar class="scroll" v-if="!firstLoading">
      <div class="scroll-body">
        <div class="settings-shell" :class="{ 'mobile-detail-active': mobileSettingsDetail }">
          <nav class="settings-sidebar" aria-label="System settings sections">
            <button
                v-for="item in systemSettingNav"
                :key="item.key"
                class="settings-nav-item"
                :class="{ active: activeSettingSection === item.key }"
                type="button"
                @click="openSettingsSection(item.key)"
            >
              <Icon class="settings-nav-icon" :icon="item.icon" width="20" height="20"/>
              <span>{{ item.label }}</span>
            </button>
          </nav>
          <main class="settings-panel">
            <div class="settings-panel-header">
              <div>
                <button v-if="mobileSettingsDetail" type="button" class="mobile-settings-back" @click="mobileSettingsDetail = false">
                  <Icon icon="psg:chevron-left" width="15" height="15" /> {{ $t('back') }}
                </button>
                <h1>{{ activeSettingMeta.label }}</h1>
                <p>{{ activeSettingMeta.desc }}</p>
              </div>
              <el-button class="settings-save-button" type="primary" :loading="settingLoading"
                         :disabled="activeSettingSection === 'customization' && !customizationDirty"
                         @click="saveActiveSetting">
                {{ activeSettingSection === 'customization' ? $t('saveChanges') : $t('save') }}
              </el-button>
            </div>
            <div class="card-grid">
          <!-- Website Settings Card -->
          <div v-show="activeSettingSection === 'website'" class="settings-card">
            <div class="card-title">{{ $t('websiteSetting') }}</div>
            <div class="card-content">
              <div class="setting-item">
                <div>
                  <span>{{ $t('websiteReg') }}</span>
                  <p>{{ $t('sysWebsiteRegDesc') }}</p>
                </div>
                <div>
                  <el-switch @change="change" :before-change="beforeChange" :active-value="0" :inactive-value="1"
                             :active-text="$t('enabled')" :inactive-text="$t('disabled')" v-model="setting.register"/>
                </div>
              </div>
              <div class="setting-item">
                <div>
                  <span>{{ $t('loginDomain') }}</span>
                  <p>{{ $t('sysLoginDomainDesc') }}</p>
                </div>
                <div>
                  <el-switch @change="change" :before-change="beforeChange" :active-value="1" :inactive-value="0"
                             :active-text="$t('enabled')" :inactive-text="$t('disabled')" v-model="setting.loginDomain"/>
                </div>
              </div>
              <div class="setting-item">
                <div>
                  <span>{{ $t('regKey') }}</span>
                  <p>{{ $t('sysRegKeyDesc') }}</p>
                </div>
                <div>
                  <el-select
                      @change="change"
                      :style="`width: ${ locale === 'en' ?  100 : 80 }px;`"
                      v-model="setting.regKey"
                      placeholder="Select"
                  >
                    <el-option
                        v-for="item in regKeyOptions"
                        :key="item.value"
                        :label="item.label"
                        :value="item.value"
                    />
                  </el-select>
                </div>
              </div>
              <div class="setting-item">
                <div>
                  <span>{{ $t('addAccount') }}</span>
                  <p>{{ $t('sysAddAccountDesc') }}</p>
                </div>
                <div>
                  <el-switch @change="change" :before-change="beforeChange" :active-value="0" :inactive-value="1"
                             :active-text="$t('enabled')" :inactive-text="$t('disabled')" v-model="setting.addEmail"/>
                </div>
              </div>
              <div class="setting-item">
                <div>
                  <span>{{ $t('multipleEmail') }}</span>
                  <el-tooltip effect="dark" :content="$t('multipleEmailDesc')">
                    <Icon class="warning" icon="psg:warning" width="18" height="18"/>
                  </el-tooltip>
                  <p>{{ $t('multipleEmailDesc') }}</p>
                </div>
                <div>
                  <el-switch @change="change" :before-change="beforeChange" :active-value="0" :inactive-value="1"
                             :active-text="$t('enabled')" :inactive-text="$t('disabled')" v-model="setting.manyEmail"/>
                </div>
              </div>
              <div class="setting-item">
                <div>
                  <span>{{ $t('minEmailPrefix', {msg: minEmailPrefix}) }}</span>
                  <p>{{ $t('sysEmailPrefixLengthDesc') }}</p>
                </div>
                <div>
                  <el-input-number class="setting-number" v-model="minEmailPrefix" :min="1" :max="20"/>
                </div>
              </div>
              <div class="setting-item">
                <div>
                  <span>{{ $t('mustNotContain') }}</span>
                  <p>{{ $t('mustNotContainDesc') }}</p>
                </div>
                <div>
                  <el-input-tag class="setting-tag-input" :placeholder="$t('mustNotContainDesc')" v-model="emailPrefixFilter"/>
                </div>
              </div>
              <div class="setting-item">
                <div>
                  <span>{{ $t('autoDeleteDays') }}</span>
                  <p>{{ $t('autoDeleteDaysDesc') }}</p>
                  <p class="danger-warn">
                    {{ $t('autoDeleteDaysWarn', { n: setting.autoDeleteDays > 0 ? setting.autoDeleteDays : 30 }) }}
                  </p>
                </div>
                <div>
                  <el-input-number class="setting-number" @change="change" v-model="setting.autoDeleteDays" :min="0" :max="365" :step="1"/>
                </div>
              </div>
            </div>
          </div>

          <!-- Login Appearance Card -->
          <div v-show="activeSettingSection === 'customization'" class="settings-card">
            <div class="card-title">{{ $t('customization') }}</div>
            <div class="card-content appearance-layout">
              <div class="appearance-settings">

                <section class="appearance-module">
                  <header class="module-header">
                    <h2>{{ $t('brandInfoTitle') }}</h2>
                    <p>{{ $t('brandInfoDesc') }}</p>
                  </header>
                  <div class="module-field">
                    <label>{{ $t('websiteTitle') }}</label>
                    <el-input v-model="titleDraft" :placeholder="$t('websiteTitle')" maxlength="60"/>
                    <span class="field-hint">{{ $t('loginTitleDesc') }}</span>
                  </div>
                </section>

                <section class="appearance-module">
                  <header class="module-header">
                    <h2>{{ $t('loginBackground') }}</h2>
                    <p>{{ $t('loginBackgroundDesc') }}</p>
                  </header>
                  <div class="background-manager">
                    <div class="background-frame">
                      <el-image
                          v-if="setting.background"
                          class="background-image"
                          :src="cvtR2Url(setting.background)"
                          :preview-src-list="[cvtR2Url(setting.background)]"
                          show-progress
                          fit="cover"
                      >
                        <template #error>
                          <div class="error-image">
                            <Icon icon="psg:gallery" width="24" height="24"/>
                          </div>
                        </template>
                      </el-image>
                      <div v-else class="background-empty">
                        <Icon icon="psg:gallery" width="24" height="24"/>
                        <span>{{ $t('noBackgroundPlaceholder') }}</span>
                      </div>
                    </div>
                    <div class="background-actions">
                      <div class="background-buttons">
                        <el-button @click="openSetBackground">{{ $t('replaceImage') }}</el-button>
                        <el-button type="danger" plain v-if="setting.background" @click="delBackground">
                          {{ $t('removeBackground') }}
                        </el-button>
                      </div>
                      <p class="field-hint">{{ $t('backgroundHint') }}</p>
                    </div>
                  </div>
                </section>

                <section class="appearance-module">
                  <header class="module-header">
                    <h2>{{ $t('displayEffectsTitle') }}</h2>
                    <p>{{ $t('displayEffectsDesc') }}</p>
                  </header>
                  <div class="slider-field">
                    <div class="slider-label-row">
                      <span>{{ $t('panelOpacity') }}</span>
                      <span class="slider-value">{{ panelOpacityPercent }}%</span>
                    </div>
                    <el-slider v-model="panelOpacityPercent" :min="0" :max="100" :show-tooltip="false"/>
                    <p class="field-hint">{{ $t('panelOpacityDesc') }}</p>
                  </div>
                  <div class="slider-field">
                    <div class="slider-label-row">
                      <span>{{ $t('backgroundMask') }}</span>
                      <span class="slider-value">{{ maskPercent }}%</span>
                    </div>
                    <el-slider v-model="maskPercent" :min="0" :max="100" :show-tooltip="false"
                               :disabled="!setting.background"/>
                    <p class="field-hint">
                      {{ setting.background ? $t('backgroundMaskRecommend') : $t('backgroundMaskDisabledHint') }}
                    </p>
                  </div>
                </section>

              </div>

              <div class="appearance-preview">
                <div class="preview-header">
                  <Icon icon="lucide:eye" width="15" height="15"/>
                  <span>{{ $t('livePreview') }}</span>
                </div>
                <div class="preview-frame" :style="previewFrameStyle">
                  <span class="preview-eyebrow">{{ $t('institutionalMail') }}</span>
                  <div class="preview-card" :style="previewCardStyle">
                    <div class="preview-title">{{ titleDraft || 'PSG Mail' }}</div>
                    <div class="preview-input">{{ $t('emailAccount') }}</div>
                    <div class="preview-input">{{ $t('password') }}</div>
                    <div class="preview-button">{{ $t('loginBtn') }}</div>
                  </div>
                </div>
              </div>

            </div>
          </div>

          <!-- Email Sending Settings Card -->
          <div v-show="activeSettingSection === 'email'" class="settings-card">
            <div class="card-title">{{ $t('emailSetting') }}</div>
            <div class="card-content">
              <div class="setting-item">
                <div><span>{{ $t('receiveEmail') }}</span></div>
                <div>
                  <el-switch @change="change" :before-change="beforeChange" :active-value="0" :inactive-value="1"
                             v-model="setting.receive"/>
                </div>
              </div>
              <div class="setting-item">
                <div>
                  <span>{{ $t('autoRefresh') }}</span>
                  <el-tooltip effect="dark" :content="$t('autoRefreshDesc')">
                    <Icon class="warning" icon="psg:warning" width="18" height="18"/>
                  </el-tooltip>
                </div>
                <div>
                  <el-select
                      @change="change"
                      :style="`width: ${ locale === 'en' ? 100 : 80 }px;`"
                      v-model="setting.autoRefresh"
                      placeholder="Select"
                  >
                    <el-option
                        v-for="item in authRefreshOptions"
                        :key="item.value"
                        :label="item.label"
                        :value="item.value"
                    />
                  </el-select>
                </div>
              </div>
              <div class="setting-item">
                <div><span>{{ $t('sendEmail') }}</span></div>
                <div>
                  <el-switch @change="change" :before-change="beforeChange" :active-value="0" :inactive-value="1"
                             v-model="setting.send"/>
                </div>
              </div>
              <div class="setting-item">
                <div>
                  <span>{{ $t('noRecipientTitle') }}</span>
                  <el-tooltip effect="dark" :content="$t('noRecipientDesc')">
                    <Icon class="warning" icon="psg:warning" width="18" height="18"/>
                  </el-tooltip>
                </div>
                <div>
                  <el-switch @change="change" :before-change="beforeChange" :active-value="0" :inactive-value="1"
                             v-model="setting.noRecipient"/>
                </div>
              </div>
              <div class="setting-item">
                <div><span>{{ setting.hasCfEmail ? $t('cloudflareEmailSending') : $t('resendToken') }}</span></div>
                <div v-if="setting.hasCfEmail">
                  <span>{{ $t('enabled') }}</span>
                </div>
                <div v-else>
                  <el-button class="opt-button" style="margin-top: 0" @click="openResendList" size="small"
                             type="primary">
                    <Icon icon="psg:list" width="18" height="18"/>
                  </el-button>
                  <el-button class="opt-button" style="margin-top: 0" @click="openResendForm" size="small"
                             type="primary">
                    <Icon icon="psg:add-circle" width="16" height="16"/>
                  </el-button>
                </div>
              </div>
              <div class="setting-item">
                <div><span>{{ $t('blackList') }}</span></div>
                <div>
                  <el-button class="opt-button" style="margin-top: 0" @click="openBlackListForm" size="small"
                             type="primary">
                    <Icon icon="psg:settings" width="16" height="16"/>
                  </el-button>
                </div>
              </div>
            </div>
          </div>

          <!-- Mail Sending Service Card -->
          <div v-show="activeSettingSection === 'mail-provider'" class="settings-card">
            <div class="card-title">{{ $t('mailSendingService') }}</div>
            <div class="card-content provider-card-grid">
              <MailProviderCard
                  name="Resend"
                  :configured="resendConfigured"
                  :today-sent="providerUsage.resend.todaySent"
                  :daily-quota="setting.resendDailyQuota || 0"
                  :month-sent="providerUsage.resend.monthSent"
                  :monthly-quota="setting.resendMonthlyQuota || 0"
                  @configure="openResendQuotaForm"
              />
              <MailProviderCard
                  name="Mailjet"
                  :configured="!!setting.mailjetApiKey"
                  :today-sent="providerUsage.mailjet.todaySent"
                  :daily-quota="setting.mailjetDailyQuota || 0"
                  :month-sent="providerUsage.mailjet.monthSent"
                  :monthly-quota="setting.mailjetMonthlyQuota || 0"
                  @configure="openMailjetForm"
              />
            </div>
          </div>

          <!-- Object Storage Card -->
          <div v-show="activeSettingSection === 'storage'" class="settings-card">
            <div class="card-title">{{ $t('oss') }}</div>
            <div class="card-content">
              <div class="r2domain-item">
                <div>
                  <span>{{ $t('osDomain') }}</span>
                  <el-tooltip effect="dark" :content="$t('ossDomainDesc')">
                    <Icon class="warning" icon="psg:warning" width="18" height="18"/>
                  </el-tooltip>
                </div>
                <div class="r2domain">
                  <span>{{ setting.r2Domain || '' }}</span>
                  <el-button class="opt-button" size="small" type="primary" @click="r2DomainShow = true">
                    <Icon icon="psg:edit" width="16" height="16"/>
                  </el-button>
                </div>
              </div>
              <div class="setting-item">
                <div>
                  <span>{{ $t('s3Configuration') }}</span>
                </div>
                <div class="r2domain">
                  <el-button class="opt-button" size="small" type="primary" @click="addS3Show = true">
                    <Icon icon="psg:settings" width="16" height="16"/>
                  </el-button>
                </div>
              </div>
              <div class="setting-item">
                <div>
                  <span>{{ $t('storageType') }}</span>
                </div>
                <div class="r2domain">
                  <div class="storage-type">
                    <el-tag>{{ setting.storageType }}</el-tag>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div v-show="activeSettingSection === 'push'" class="settings-card">
            <div class="card-title">通知与转发</div>
            <div class="card-content">
              <div class="setting-item">
                <div><span>{{ $t('tgBot') }}</span></div>
                <div class="forward">
                  <span>{{ setting.tgBotStatus === 0 ? $t('enabled') : $t('disabled') }}</span>
                  <el-button class="opt-button" size="small" type="primary" @click="openTgSetting">
                    <Icon icon="psg:settings" width="18" height="18"/>
                  </el-button>
                </div>
              </div>
              <div class="setting-item">
                <div><span>{{ $t('otherEmail') }}</span></div>
                <div class="forward">
                  <span>{{ setting.forwardStatus === 0 ? $t('enabled') : $t('disabled') }}</span>
                  <el-button class="opt-button" size="small" type="primary" @click="openThirdEmailSetting">
                    <Icon icon="psg:settings" width="18" height="18"/>
                  </el-button>
                </div>
              </div>
              <div class="setting-item">
                <div><span>{{ $t('forwardingRules') }}</span></div>
                <div class="forward">
                  <span>{{ setting.ruleType === 0 ? $t('forwardAll') : $t('rules') }}</span>
                  <el-button class="opt-button" size="small" type="primary" @click="openForwardRules">
                    <Icon icon="psg:settings" width="18" height="18"/>
                  </el-button>
                </div>
              </div>
            </div>
            <AdminForwarding :setting="setting" @saved="getSettings" />
          </div>

          <!-- Turnstile Verification Card -->
          <div v-show="activeSettingSection === 'verify'" class="settings-card">
            <div class="card-title">{{ $t('turnstileSetting') }}</div>
            <div class="card-content">
              <div class="setting-item">
                <div><span>{{ $t('signUpVerification') }}</span></div>
                <div>
                  <el-button class="opt-button" size="small" type="primary" @click="openRegVerifyCount">
                    <Icon icon="psg:settings" width="18" height="18"/>
                  </el-button>
                  <el-select
                      @change="change"
                      :style="`width: ${ locale === 'en' ? 100 : 80 }px;`"
                      v-model="setting.registerVerify"
                      placeholder="Select"
                      class="bot-verify-select"
                  >
                    <el-option key="1" :value="0" :label="$t('enable')"/>
                    <el-option key="1" :value="1" :label="$t('disable')"/>
                    <el-option key="1" :value="2" :label="$t('rulesVerify')"/>
                  </el-select>
                </div>
              </div>
              <div class="setting-item">
                <div><span>{{ $t('addEmailVerification') }}</span></div>
                <div>
                  <el-button class="opt-button" size="small" type="primary" @click="openAddVerifyCount">
                    <Icon icon="psg:settings" width="18" height="18"/>
                  </el-button>
                  <el-select
                      @change="change"
                      :style="`width: ${ locale === 'en' ? 100 : 80 }px;`"
                      v-model="setting.addEmailVerify"
                      placeholder="Select"
                      class="bot-verify-select"
                  >
                    <el-option key="1" :value="0" :label="$t('enable')"/>
                    <el-option key="1" :value="1" :label="$t('disable')"/>
                    <el-option key="1" :value="2" :label="$t('rulesVerify')"/>
                  </el-select>
                </div>
              </div>
              <div class="setting-item">
                <div><span>Site Key</span></div>
                <div class="bot-verify">
                  <span>{{ setting.siteKey }}</span>
                  <el-button class="opt-button" size="small" type="primary" @click="turnstileShow = true">
                    <Icon icon="psg:edit" width="16" height="16"/>
                  </el-button>
                </div>
              </div>
              <div class="setting-item">
                <div><span>Secret Key</span></div>
                <div class="bot-verify">
                  <span> {{ setting.secretKey }} </span>
                  <el-button class="opt-button" size="small" type="primary" @click="turnstileShow = true">
                    <Icon icon="psg:edit" width="16" height="16"/>
                  </el-button>
                </div>
              </div>
            </div>
          </div>

          <div v-show="activeSettingSection === 'notice'" class="settings-card">
            <div class="card-title">{{ $t('noticeTitle') }}</div>
            <div class="card-content">
              <div class="setting-item">
                <div><span>{{ $t('noticePopup') }}</span></div>
                <div class="forward">
                  <span>{{ setting.notice === 0 ? $t('enabled') : $t('disabled') }}</span>
                  <el-button class="opt-button" size="small" type="primary" @click="openNoticePopupSetting">
                    <Icon icon="psg:settings" width="18" height="18"/>
                  </el-button>
                </div>
              </div>
              <div class="setting-item">
                <div><span>{{ $t('popUp') }}</span></div>
                <div class="forward">
                  <el-button class="opt-button" size="small" type="primary" @click="openNoticePopup">
                    <Icon icon="psg:cursor" width="18" height="18"/>
                  </el-button>
                </div>
              </div>
            </div>
          </div>

          <div v-show="activeSettingSection === 'ai'" class="settings-card">
            <div class="card-title">AI 与智能识别</div>
            <div class="card-content">
              <div class="setting-item">
                <div><span>{{ $t('aiServiceStatus') }}</span><p>{{ $t('aiServiceStatusDesc') }}</p></div>
                <span class="ai-service-status" :class="setting.hasAi ? 'is-ready' : 'is-unavailable'">
                  {{ setting.hasAi ? $t('aiServiceReady') : $t('aiServiceUnavailable') }}
                </span>
              </div>
              <div class="setting-item">
                <div><span>{{ $t('codeRecognition') }}</span></div>
                <div>
                  <el-switch @change="changeField('aiCode', $event)" :before-change="beforeChange" :active-value="0" :inactive-value="1"
                             v-model="setting.aiCode"/>
                </div>
              </div>
              <div class="setting-item">
                <div><span>{{ $t('codeRecognitionRules') }}</span></div>
                <div class="forward">
                  <el-button class="opt-button" size="small" type="primary" @click="openAiCodeFilter">
                    <Icon icon="psg:settings" width="18" height="18"/>
                  </el-button>
                </div>
              </div>
              <div class="setting-item">
                <div><span>默认模型</span><p>留空时使用部署的 ai_model 或系统默认模型。</p></div>
                <div><el-input v-model="setting.aiDefaultModel" size="small" placeholder="可选" style="width:220px" /></div>
              </div>
              <div class="setting-item">
                <div><span>备用模型</span><p>主模型失败时才会使用，留空表示不自动切换。</p></div>
                <div><el-input v-model="setting.aiFallbackModel" size="small" placeholder="可选" style="width:220px" /></div>
              </div>
              <div class="setting-item">
                <div><span>每日 AI 请求额度</span><p>0 表示不设置应用层额度，不会自动产生付费调用。</p></div>
                <div><el-input-number v-model="setting.aiDailyQuota" :min="0" :max="10000" size="small" /></div>
              </div>
            </div>
          </div>

            </div>
          </main>
        </div>
        <div class="settings-footer">PSG Mail {{ currentVersion }}</div>
      </div>

      <!-- Dialogs remain the same -->
      <el-dialog v-model="resendTokenFormShow" :title="$t('resendToken')" width="340" @closed="cleanResendTokenForm">
        <form>
          <el-select style="margin-bottom: 15px" v-model="resendTokenForm.domain" placeholder="Select">
            <el-option
                v-for="item in settingStore.domainList"
                :key="item"
                :label="item"
                :value="item"
            />
          </el-select>
          <el-input type="text" :placeholder="$t('addResendTokenDesc')" v-model="resendTokenForm.token"/>
          <el-button type="primary" :loading="settingLoading" @click="saveResendToken">{{ $t('save') }}</el-button>
        </form>
      </el-dialog>
      <el-dialog v-model="r2DomainShow" :title="$t('addOsDomain')" width="340"
                 @closed="r2DomainInput = setting.r2Domain">
        <form>
          <el-input type="text" :placeholder="$t('domainDesc')" v-model="r2DomainInput"/>
          <el-button type="primary" :loading="settingLoading" @click="saveR2domain">{{ $t('save') }}</el-button>
        </form>
      </el-dialog>
      <el-dialog v-model="turnstileShow" :title="$t('addTurnstileSecret')" width="340"
                 @closed="turnstileForm.secretKey = '';turnstileForm.siteKey = ''">
        <form>
          <el-input type="text" placeholder="Site Key" v-model="turnstileForm.siteKey"/>
          <el-input type="text" style="margin-top: 15px" placeholder="Secret Key" v-model="turnstileForm.secretKey"/>
          <el-button type="primary" :loading="settingLoading" @click="saveTurnstileKey">{{ $t('save') }}</el-button>
        </form>
      </el-dialog>
      <el-dialog
          v-model="showSetBackground"
          class="cut-dialog"
          @closed="closedSetBackground"
      >
        <template #header>
          <span style="font-size: 18px">
            {{ $t('backgroundTitle') }}
            <el-tooltip>
              <template #content>
                <span>{{ $t('backgroundWarning') }}</span>
              </template>
              <Icon class="title-icon  warning" icon="psg:warning" width="18" height="18"/>
            </el-tooltip>
          </span>
        </template>
        <el-input :placeholder="$t('backgroundUrlDesc')" v-model="backgroundUrl" v-if="!localUpShow"
                  class="background-url"/>
        <el-image
            v-if="localUpShow"
            :preview-src-list="[backgroundImage]"
            show-progress
            class="cropper"
            fit="cover"
            :src="backgroundImage"
        ></el-image>
        <div class="cut-button">
          <el-button type="primary" link @click="openCut" v-if="!localUpShow">
            {{ $t('localUpload') }}
          </el-button>
          <el-button type="primary" link @click="localUpShow = false" v-if="localUpShow">
            {{ $t('imageLink') }}
          </el-button>
          <el-button type="primary" :loading="settingLoading" @click="saveBackground">{{ $t('save') }}</el-button>
        </div>
      </el-dialog>
      <el-dialog
          v-model="tgSettingShow"
          class="forward-dialog"
      >
        <template #header>
          <div class="forward-head">
            <span class="forward-set-title">{{ $t('tgBot') }}</span>
            <el-tooltip effect="dark" :content="$t('tgBotDesc')">
              <Icon class="warning" icon="psg:warning" width="18" height="18"/>
            </el-tooltip>
          </div>
        </template>
        <div class="forward-set-body">
          <el-input :placeholder="setting.tgBotToken || $t('tgBotToken')" v-model="tgBotToken"></el-input>
          <el-input-tag tag-type="warning" :placeholder="$t('toBotTokenDesc')" v-model="tgChatId"
                        @add-tag="addChatTag"></el-input-tag>
          <el-input tag-type="warning" :placeholder="$t('customDomainDesc')" v-model="customDomain" ></el-input>
          <div class="tg-msg-label">
            <span>{{t('from')}}</span>
            <el-select  v-model="tgMsgFrom" >
              <el-option
                  v-for="item in tgMsgFromOption"
                  :key="item.value"
                  :label="item.label"
                  :value="item.value"
              />
            </el-select>
          </div>
          <div class="tg-msg-label">
            <span>{{t('recipient')}}</span>
            <el-select  v-model="tgMsgTo" >
              <el-option
                  v-for="item in tgMsgToOption"
                  :key="item.value"
                  :label="item.label"
                  :value="item.value"
              />
            </el-select>
          </div>
          <div class="tg-msg-label">
            <span>{{t('emailText')}}</span>
            <el-select  v-model="tgMsgText" >
              <el-option
                  v-for="item in tgMsgTextOption"
                  :key="item.value"
                  :label="item.label"
                  :value="item.value"
              />
            </el-select>
          </div>
        </div>
        <template #footer>
          <div class="dialog-footer">
            <el-switch v-model="tgBotStatus" :active-value="0" :inactive-value="1" :active-text="$t('enable')"
                       :inactive-text="$t('disable')"/>
            <el-button :loading="settingLoading" type="primary" @click="tgBotSave">
              {{ $t('save') }}
            </el-button>
          </div>
        </template>
      </el-dialog>
      <el-dialog
          v-model="thirdEmailShow"
          class="forward-dialog"
      >
        <template #header>
          <div class="forward-head">
            <span class="forward-set-title">{{ $t('otherEmail') }}</span>
            <el-tooltip effect="dark" :content="$t('otherEmailDesc')">
              <Icon class="warning" icon="psg:warning" width="18" height="18"/>
            </el-tooltip>
          </div>
        </template>
        <div class="forward-set-body">
          <el-input-tag tag-type="warning" :placeholder="$t('otherEmailInputDesc')" v-model="forwardEmail"
                        @add-tag="emailAddTag"></el-input-tag>
        </div>
        <template #footer>
          <div class="dialog-footer">
            <el-switch v-model="forwardStatus" :active-value="0" :inactive-value="1" :active-text="$t('enable')"
                       :inactive-text="$t('disable')"/>
            <el-button :loading="settingLoading" type="primary" @click="forwardEmailSave">
              {{ $t('save') }}
            </el-button>
          </div>
        </template>
      </el-dialog>
      <el-dialog
          v-model="forwardRulesShow"
          class="forward-dialog"
      >
        <template #header>
          <div class="forward-head">
            <span class="forward-set-title">{{ $t('forwardingRules') }}</span>
            <el-tooltip effect="dark" :content="$t('forwardingRulesDesc')">
              <Icon class="warning" icon="psg:warning" width="18" height="18"/>
            </el-tooltip>
          </div>
        </template>
        <div class="forward-set-body">
          <el-input-tag :placeholder="$t('ruleEmailsInputDesc')" tag-type="success" v-model="ruleEmail"
                        @add-tag="ruleEmailAddTag"/>
        </div>
        <template #footer>
          <div class="dialog-footer">
            <el-radio-group v-model="ruleType">
              <el-radio :value="0">{{ $t('forwardAll') }}</el-radio>
              <el-radio :value="1">{{ $t('rules') }}</el-radio>
            </el-radio-group>
            <el-button :loading="settingLoading" type="primary" @click="ruleEmailSave">
              {{ $t('save') }}
            </el-button>
          </div>
        </template>
      </el-dialog>
      <el-dialog class="resend-table" v-model="showResendList" :title="$t('resendTokenList')">
        <el-table :data="resendList">
          <el-table-column :min-width="emailColumnWidth" property="key" :label="$t('domain')"
                           :show-overflow-tooltip="true"/>
          <el-table-column :width="tokenColumnWidth" property="value" label="Token" fixed="right"
                           :show-overflow-tooltip="true"/>
        </el-table>
      </el-dialog>
      <el-dialog v-model="resendQuotaFormShow" class="provider-config-dialog" width="380"
                 :title="$t('providerConfigTitle', { name: 'Resend' })">
        <div class="provider-config-section">
          <div class="provider-config-label">API Key</div>
          <p class="provider-config-hint">
            {{ resendConfigured ? $t('resendTokenList') + `: ${resendList.length}` : $t('providerNotConfiguredDesc', { name: 'Resend' }) }}
            — {{ $t('resendToken') }} ({{ $t('emailSetting') }})
          </p>
        </div>
        <div class="provider-config-section">
          <div class="provider-config-label">{{ $t('providerDailyQuota') }}</div>
          <el-input-number v-model="resendQuotaForm.dailyQuota" :min="0" :max="1000000" size="small"/>
          <p class="provider-config-hint">{{ $t('providerQuotaZeroHint') }}</p>
        </div>
        <div class="provider-config-section">
          <div class="provider-config-label">{{ $t('providerMonthlyQuota') }}</div>
          <el-input-number v-model="resendQuotaForm.monthlyQuota" :min="0" :max="10000000" size="small"/>
        </div>
        <div class="provider-config-section">
          <div class="provider-config-label">{{ $t('providerCurrentUsage') }}</div>
          <div class="provider-usage-readout">
            <span>{{ $t('providerTodaySent') }}: {{ providerUsage.resend.todaySent.toLocaleString() }}</span>
            <span>{{ $t('providerMonthSent') }}: {{ providerUsage.resend.monthSent.toLocaleString() }}</span>
          </div>
        </div>
        <p class="provider-config-note">{{ $t('providerQuotaObservationNote') }}</p>
        <template #footer>
          <div class="dialog-footer">
            <el-button @click="resendQuotaFormShow = false">{{ $t('cancel') }}</el-button>
            <el-button type="primary" :loading="settingLoading" @click="saveResendQuota">{{ $t('saveChanges') }}</el-button>
          </div>
        </template>
      </el-dialog>
      <el-dialog v-model="mailjetFormShow" class="provider-config-dialog" width="380"
                 :title="$t('providerConfigTitle', { name: 'Mailjet' })" @closed="cleanMailjetForm">
        <div class="provider-config-section">
          <div class="provider-config-label">API Key</div>
          <el-input v-model="mailjetForm.apiKey" :placeholder="setting.mailjetApiKey || $t('mailjetApiKeyPlaceholder')"/>
        </div>
        <div class="provider-config-section">
          <div class="provider-config-label">Secret Key</div>
          <el-input v-model="mailjetForm.secretKey" type="password" show-password
                    :placeholder="setting.mailjetSecretKey || $t('mailjetSecretKeyPlaceholder')"/>
        </div>
        <div class="provider-config-section">
          <div class="provider-config-label">{{ $t('providerDailyQuota') }}</div>
          <el-input-number v-model="mailjetForm.dailyQuota" :min="0" :max="1000000" size="small"/>
          <p class="provider-config-hint">{{ $t('providerQuotaZeroHint') }}</p>
        </div>
        <div class="provider-config-section">
          <div class="provider-config-label">{{ $t('providerMonthlyQuota') }}</div>
          <el-input-number v-model="mailjetForm.monthlyQuota" :min="0" :max="10000000" size="small"/>
        </div>
        <div class="provider-config-section">
          <div class="provider-config-label">{{ $t('providerCurrentUsage') }}</div>
          <div class="provider-usage-readout">
            <span>{{ $t('providerTodaySent') }}: {{ providerUsage.mailjet.todaySent.toLocaleString() }}</span>
            <span>{{ $t('providerMonthSent') }}: {{ providerUsage.mailjet.monthSent.toLocaleString() }}</span>
          </div>
        </div>
        <p class="provider-config-note">{{ $t('providerQuotaObservationNote') }}</p>
        <template #footer>
          <div class="dialog-footer">
            <el-button @click="mailjetFormShow = false">{{ $t('cancel') }}</el-button>
            <el-button type="primary" :loading="settingLoading" @click="saveMailjetForm">{{ $t('saveChanges') }}</el-button>
          </div>
        </template>
      </el-dialog>
      <el-dialog v-model="regVerifyCountShow" :title="$t('rulesVerifyTitle',{count: regVerifyCount})"
                 @closed="regVerifyCount = setting.regVerifyCount">
        <form>
          <el-input-number type="text" v-model="regVerifyCount" :min="1">
          </el-input-number>
          <el-button type="primary" :loading="settingLoading" @click="saveRegVerifyCount">{{ $t('save') }}</el-button>
        </form>
      </el-dialog>
      <el-dialog v-model="addVerifyCountShow" :title="$t('rulesVerifyTitle',{count: addVerifyCount})"
                 @closed="addVerifyCount = setting.addVerifyCount">
        <form>
          <el-input-number type="text" v-model="addVerifyCount" :min="1"/>
          <el-button type="primary" :loading="settingLoading" @click="saveAddVerifyCount">{{ $t('save') }}</el-button>
        </form>
      </el-dialog>
      <el-dialog top="5vh" v-model="noticePopupShow" :title="$t('noticePopup')" class="notice-popup"
                 @closed="resetNoticeForm">
        <form>
          <el-input v-model="noticeForm.noticeTitle" :placeholder="t('titleDesc')"/>
          <div class="notice-line-item">
            <el-select v-model="noticeForm.noticeType">
              <template #prefix>
                <span style="margin-right: 10px">{{ $t('icon') }}</span>
              </template>
              <el-option key="none" label="None" value="none"/>
              <el-option key="primary" label="Primary" value="primary"/>
              <el-option key="success" label="Success" value="success"/>
              <el-option key="warning" label="Warning" value="warning"/>
              <el-option key="info" label="Info" value="info"/>
            </el-select>
            <el-select v-model="noticeForm.noticePosition">
              <template #prefix>
                <span style="margin-right: 10px">{{ $t('position') }}</span>
              </template>
              <el-option key="top-left" :label="t('topLeft')" value="top-left"/>
              <el-option key="top-right" :label="t('topRight')" value="top-right"/>
              <el-option key="bottom-left" :label="t('bottomLeft')" value="bottom-left"/>
              <el-option key="bottom-right" :label="t('bottomRight')" value="bottom-right"/>
            </el-select>
            <el-input-number v-model="noticeForm.noticeWidth">
              <template #prefix>
                {{ $t('width') }}
              </template>
              <template #suffix>
                px
              </template>
            </el-input-number>
            <el-input-number v-model="noticeForm.noticeOffset">
              <template #prefix>
                {{ $t('offset') }}
              </template>
              <template #suffix>
                px
              </template>
            </el-input-number>
            <el-input-number v-model="noticeForm.noticeDuration">
              <template #prefix>
                {{ $t('duration') }}
              </template>
              <template #suffix>
                ms
              </template>
            </el-input-number>
          </div>
          <div class="notice-popup-item">
            <el-input
                v-model="noticeForm.noticeContent"
                :autosize="{ minRows: 15, maxRows: 25 }"
                type="textarea"
                :placeholder="t('noticeContentDesc')"
            />
          </div>
        </form>
        <template #footer>
          <div class="dialog-footer">
            <el-switch v-model="noticeForm.notice" :active-value="0" :inactive-value="1" :active-text="$t('enable')"
                       :inactive-text="$t('disable')"/>
            <div>
              <el-button @click="previewNoticePopup">
                {{ $t('preview') }}
              </el-button>
              <el-button :loading="settingLoading" type="primary" @click="saveNoticePopup">
                {{ $t('save') }}
              </el-button>
            </div>
          </div>
        </template>
      </el-dialog>
      <el-dialog v-model="addS3Show" :title="t('s3Configuration')" width="340" @closed="resetAddS3Form">
        <form>
          <el-input class="dialog-input" type="text" placeholder="Bucket" v-model="s3.bucket"/>
          <el-input class="dialog-input" type="text" placeholder="Endpoint" v-model="s3.endpoint"/>
          <el-input class="dialog-input" type="text" placeholder="Region" v-model="s3.region"/>
          <el-input class="dialog-input" type="text" :placeholder="setting.s3AccessKey || 'Access Key'"
                    v-model="s3.s3AccessKey"/>
          <el-input style="margin-bottom: 10px" type="text" :placeholder="setting.s3SecretKey || 'Secret Key'" v-model="s3.s3SecretKey"/>
          <div class="force-path-style">
            <div class="force-path-style-left">
              <span>ForcePathStyle</span>
              <el-tooltip effect="dark" :content="$t('forcePathStyleDesc')">
                <Icon class="warning" icon="psg:warning" width="18" height="18"/>
              </el-tooltip>
            </div>
            <el-switch :before-change="beforeChange" :active-value="0" :inactive-value="1"
                       v-model="s3.forcePathStyle"/>
          </div>
          <div class="s3-button">
            <el-button :loading="clearS3Loading" @click="clearS3">{{ t('clear') }}</el-button>
            <el-button type="primary" :loading="settingLoading && !clearS3Loading" @click="saveS3">{{ t('save') }}</el-button>
          </div>
        </form>
      </el-dialog>
      <el-dialog v-model="emailPrefixShow" :title="t('emailPrefix')"  @closed="resetEmailPrefix"  >
        <div class="email-prefix">
          <div>{{ t('atLeast') }}</div>
          <el-input-number v-model="minEmailPrefix" :min="1" :max="20" style="width: 150px" >
            <template #suffix>
              <span>{{ t('character') }}</span>
            </template>
          </el-input-number>
        </div>
        <div class="prefix-filter">
          <div style="margin-bottom: 10px;">{{ t('mustNotContain') }}</div>
          <el-input-tag style="margin-bottom: 10px;" v-model="emailPrefixFilter"  />
        </div>
        <el-button type="primary" style="width: 100%;" :loading="settingLoading" @click="saveEmailPrefix">{{ $t('save') }}</el-button>
      </el-dialog>
      <el-dialog v-model="blackFormShow" class="forward-dialog" @closed="resetBlackList">
        <template #header>
          <div class="forward-head">
            <span class="forward-set-title">{{ $t('blackList') }}</span>
            <el-tooltip effect="dark" :content="$t('blackListDesc')">
              <Icon class="warning" icon="psg:warning" width="18" height="18"/>
            </el-tooltip>
          </div>
        </template>
        <el-form>
          <el-form-item :label="t('blackFromDesc')" label-position="top">
            <el-input-tag v-model="blackListForm.blackFrom" @add-tag="banEmailAddTag"  />
          </el-form-item>
          <el-form-item :label="t('blackSubjectDesc')" label-position="top">
            <el-input-tag v-model="blackListForm.blackSubject"/>
          </el-form-item>
          <el-form-item :label="t('blackContentDesc')" label-position="top">
            <el-input-tag v-model="blackListForm.blackContent"/>
          </el-form-item>
        </el-form>
        <el-button type="primary" style="width: 100%;" :loading="settingLoading" @click="saveBlackList">{{ $t('save') }}</el-button>
      </el-dialog>
      <el-dialog v-model="aiCodeFilterShow" class="forward-dialog" @closed="resetAiCodeFilter">
        <template #header>
          <div class="forward-head">
            <span class="forward-set-title">{{ $t('codeRecognitionRules') }}</span>
            <el-tooltip effect="dark" :content="$t('codeRecognitionRulesDesc')">
              <Icon class="warning" icon="psg:warning" width="18" height="18"/>
            </el-tooltip>
          </div>
        </template>
        <el-form>
          <el-form-item :label="t('senderRules')" label-position="top">
            <el-input-tag v-model="aiCodeFilter" @add-tag="aiCodeFilterAddTag"/>
          </el-form-item>
        </el-form>
        <el-button type="primary" style="width: 100%;" :loading="settingLoading" @click="saveAiCodeFilter">{{ $t('save') }}</el-button>
      </el-dialog>
    </el-scrollbar>
  </div>
</template>

<script setup>
import {computed, defineOptions, nextTick, onActivated, reactive, ref, watch} from "vue";
import {deleteBackground, setBackground, setBlackList, settingQuery, settingSet, providerUsage as fetchProviderUsage} from "@/request/setting.js";
import {useSettingStore} from "@/store/setting.js";
import {useUiStore} from "@/store/ui.js";
import {useMobileNavigationStore} from "@/store/mobile-navigation.js";
import {useUserStore} from "@/store/user.js";
import {useAccountStore} from "@/store/account.js";
import {Icon} from "@iconify/vue";
import {cvtR2Url} from "@/utils/convert.js";
import {storeToRefs} from "pinia";
import {isDomain, isEmail} from "@/utils/verify-utils.js";
import loading from "@/components/loading/index.vue";
import {getTextWidth} from "@/utils/text.js";
import {fileToBase64} from "@/utils/file-utils.js"
import {useI18n} from 'vue-i18n';
import AdminForwarding from '@/components/admin-forwarding/index.vue'
import MailProviderCard from './components/MailProviderCard.vue'

defineOptions({
  name: 'sys-setting'
})

const currentVersion = 'v3.0.0'
const {t, locale} = useI18n();
const firstLoading = ref(true)
const settingReady = ref(false)
const activeSettingSection = ref('website')
const mobileSettingsDetail = ref(false)

watch(mobileSettingsDetail, (open) => {
  if (window.innerWidth > 1024) return
  if (open) {
    mobileNavigation.openLayer('system-settings-detail', () => {
      mobileSettingsDetail.value = false
      return true
    })
  } else {
    mobileNavigation.closeLayer('system-settings-detail')
  }
})

onActivated(() => {
  mobileSettingsDetail.value = false
})

function openSettingsSection(key) {
  activeSettingSection.value = key
  mobileSettingsDetail.value = true
  if (key === 'mail-provider') loadProviderUsage()
}
const backgroundImage = ref('')
const localUpShow = ref(false)
const accountStore = useAccountStore();
const userStore = useUserStore();
const resendTokenFormShow = ref(false)
const blackFormShow = ref(false)
const aiCodeFilterShow = ref(false)
const r2DomainShow = ref(false)
const turnstileShow = ref(false)
const tgSettingShow = ref(false)
const noticePopupShow = ref(false)
const thirdEmailShow = ref(false)
const forwardRulesShow = ref(false)
const emailPrefixShow = ref(false)
const showResendList = ref(false)
const resendQuotaFormShow = ref(false)
const mailjetFormShow = ref(false)
const settingStore = useSettingStore();
const uiStore = useUiStore();
const mobileNavigation = useMobileNavigationStore();
const {settings: setting} = storeToRefs(settingStore);
const settingLoading = ref(false)
const clearS3Loading = ref(false)
const r2DomainInput = ref('')
const titleDraft = ref('')
const panelOpacityPercent = ref(90)
const maskPercent = ref(0)
const minEmailPrefix = ref(0)
const emailPrefixFilter = ref([])
const backgroundUrl = ref('')
let backgroundFile = {}
const showSetBackground = ref(false)
let regVerifyCount = ref(1)
let addVerifyCount = ref(1)
let backup = '{}'
const addS3Show = ref(false)
const addVerifyCountShow = ref(false)
const regVerifyCountShow = ref(false)
const resendTokenForm = reactive({
  domain: '',
  token: '',
})
const resendQuotaForm = reactive({
  dailyQuota: 0,
  monthlyQuota: 0,
})
const mailjetForm = reactive({
  apiKey: '',
  secretKey: '',
  dailyQuota: 0,
  monthlyQuota: 0,
})
const providerUsage = reactive({
  resend: { todaySent: 0, monthSent: 0 },
  mailjet: { todaySent: 0, monthSent: 0 },
})
const turnstileForm = reactive({
  siteKey: '',
  secretKey: ''
})

const s3 = reactive({
  bucket: '',
  endpoint: '',
  region: '',
  s3AccessKey: '',
  s3SecretKey: '',
  forcePathStyle: 1
})

const noticeForm = reactive({
  noticeTitle: '',
  noticeContent: '',
  noticeType: '',
  noticeDuration: '',
  noticePosition: '',
  noticeOffset: 0,
  notice: 0,
  noticeWidth: 0
})

const regKeyOptions = computed(() => [
  {label: t('enable'), value: 0},
  {label: t('disable'), value: 1},
  {label: t('optional'), value: 2},
])

const blackListForm = ref({
  blackSubject: [],
  blackContent: [],
  blackFrom: []
})
const aiCodeFilter = ref([])

const authRefreshOptions = computed(() => [
  {label: '30s', value: 30},
  {label: '1 min', value: 60},
  {label: '2 min', value: 120},
  {label: '5 min', value: 300},
])

const tgChatId = ref([])
const customDomain = ref('')
const tgBotStatus = ref(0)
const tgBotToken = ref('')
const forwardEmail = ref([])
const forwardStatus = ref(0)
const emailColumnWidth = ref(0)
const tokenColumnWidth = ref(0)
const ruleType = ref(0)
const ruleEmail = ref([])
const tgMsgFrom = ref('')
const tgMsgTo = ref('')
const tgMsgText = ref('')

const tgMsgFromOption = [{label: t('show'), value: 'show'}, {label: t('hide'), value: 'hide'}, {label: t('onlyName'), value:'only-name'}]
const tgMsgToOption = [{label: t('show'), value: 'show'}, {label: t('hide'), value: 'hide'}]
const tgMsgTextOption = [{label: t('show'), value: 'show'}, {label: t('hide'), value: 'hide'}]
const tgMsgLabelWidth = computed(() => locale.value === 'en' ? '120px' : '100px');
const systemSettingNav = computed(() => [
  {key: 'website', label: t('websiteSetting'), icon: 'lucide:globe-2', desc: t('sysWebsiteDesc')},
  {key: 'customization', label: t('customization'), icon: 'lucide:palette', desc: t('sysCustomizationDesc')},
  {key: 'email', label: t('emailSetting'), icon: 'lucide:mail', desc: t('sysEmailDesc')},
  {key: 'mail-provider', label: t('mailSendingService'), icon: 'lucide:activity', desc: t('sysMailProviderDesc')},
  {key: 'storage', label: t('oss'), icon: 'lucide:database', desc: t('sysStorageDesc')},
  {key: 'push', label: '通知与转发', icon: 'lucide:send', desc: t('sysPushDesc')},
  {key: 'verify', label: t('turnstileSetting'), icon: 'lucide:shield-check', desc: t('sysVerifyDesc')},
  {key: 'notice', label: t('noticeTitle'), icon: 'lucide:megaphone', desc: t('sysNoticeDesc')},
  {key: 'ai', label: 'AI 与智能识别', icon: 'lucide:sparkles', desc: t('sysAiDesc')},
])
const activeSettingMeta = computed(() => {
  return systemSettingNav.value.find(item => item.key === activeSettingSection.value) || systemSettingNav.value[0]
})

const customizationDirty = computed(() => {
  if (!settingReady.value) return false
  return titleDraft.value !== (setting.value.title || '')
      || panelOpacityPercent.value !== factorToPercent(setting.value.loginOpacity)
      || maskPercent.value !== factorToPercent(setting.value.loginDarkenFactor)
})

const previewFrameStyle = computed(() => {
  if (!setting.value.background) return {}
  const bgUrl = cvtR2Url(setting.value.background)
  const maskAlpha = maskPercent.value / 100
  return {
    backgroundImage: `linear-gradient(rgba(0, 0, 0, ${maskAlpha}), rgba(0, 0, 0, ${maskAlpha})), url(${bgUrl})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center'
  }
})

const previewCardStyle = computed(() => {
  if (!setting.value.background) return {}
  const alpha = panelOpacityPercent.value / 100
  const rgb = uiStore.dark ? '0, 0, 0' : '255, 255, 255'
  return {background: `rgba(${rgb}, ${alpha})`}
})

getSettings()

function factorToPercent(value) {
  return Math.round(normalizeFactor(value) * 100)
}

function getSettings() {
  settingReady.value = false
  settingQuery().then(settingData => {
    setting.value = settingData
    settingStore.domainList = settingData.domainList;
    resendTokenForm.domain = setting.value.domainList[0]
    panelOpacityPercent.value = factorToPercent(setting.value.loginOpacity)
    maskPercent.value = factorToPercent(setting.value.loginDarkenFactor)
    minEmailPrefix.value = setting.value.minEmailPrefix
    firstLoading.value = false
    backgroundUrl.value = setting.value.background?.startsWith('http') ? setting.value.background : ''
    titleDraft.value = setting.value.title || ''
    r2DomainInput.value = setting.value.r2Domain
    addVerifyCount.value = setting.value.addVerifyCount
    regVerifyCount.value = setting.value.regVerifyCount
    resetNoticeForm()
    resetAddS3Form()
    resetEmailPrefix()
    resetBlackList()
    resetAiCodeFilter()
    nextTick(() => {
      settingReady.value = true
    })
  }).finally(() => {
    firstLoading.value = false
  })
}


function openNoticePopup() {
  uiStore.showNotice()
}

function openAddVerifyCount() {
  if (settingLoading.value) return
  addVerifyCountShow.value = true
}

function openRegVerifyCount() {
  if (settingLoading.value) return
  regVerifyCountShow.value = true
}

function resetAddS3Form() {
  s3.bucket = setting.value.bucket
  s3.endpoint = setting.value.endpoint
  s3.region = setting.value.region
  s3.s3AccessKey = ''
  s3.s3SecretKey = ''
  s3.forcePathStyle = setting.value.forcePathStyle
}

const resendList = computed(() => {

  let list = Object.keys(setting.value.resendTokens).map(key => {
    return {
      key: key,
      value: setting.value.resendTokens[key]
    };
  })

  if (list.length > 0) {

    const key = list.reduce((a, b) => compareByLengthAndUpperCase(a, b, 'key')).key;
    emailColumnWidth.value = getTextWidth(key) + 30;

    const value = list.reduce((a, b) => compareByLengthAndUpperCase(a, b, 'value')).value;
    tokenColumnWidth.value = getTextWidth(value) + 30;

  }

  return list;
});

const resendConfigured = computed(() => resendList.value.length > 0)

function loadProviderUsage() {
  fetchProviderUsage().then(data => {
    providerUsage.resend = data.resend
    providerUsage.mailjet = data.mailjet
  }).catch(() => {})
}

function openResendQuotaForm() {
  resendQuotaForm.dailyQuota = setting.value.resendDailyQuota || 0
  resendQuotaForm.monthlyQuota = setting.value.resendMonthlyQuota || 0
  resendQuotaFormShow.value = true
}

function saveResendQuota() {
  editSetting({
    resendDailyQuota: resendQuotaForm.dailyQuota,
    resendMonthlyQuota: resendQuotaForm.monthlyQuota,
  })
}

function openMailjetForm() {
  mailjetForm.apiKey = ''
  mailjetForm.secretKey = ''
  mailjetForm.dailyQuota = setting.value.mailjetDailyQuota || 0
  mailjetForm.monthlyQuota = setting.value.mailjetMonthlyQuota || 0
  mailjetFormShow.value = true
}

function cleanMailjetForm() {
  mailjetForm.apiKey = ''
  mailjetForm.secretKey = ''
}

function saveMailjetForm() {
  const form = {
    mailjetDailyQuota: mailjetForm.dailyQuota,
    mailjetMonthlyQuota: mailjetForm.monthlyQuota,
  }
  // Leave-blank-means-unchanged, same guard S3's saveS3() uses for its two
  // secret fields — never submit an empty string that would overwrite an
  // already-saved credential.
  if (mailjetForm.apiKey) form.mailjetApiKey = mailjetForm.apiKey
  if (mailjetForm.secretKey) form.mailjetSecretKey = mailjetForm.secretKey
  editSetting(form)
}

function saveAddVerifyCount() {
  if (!addVerifyCount.value) {
    addVerifyCount.value = 1
  }
  editSetting({addVerifyCount: addVerifyCount.value})
}

function saveRegVerifyCount() {
  if (!regVerifyCount.value) {
    regVerifyCount.value = 1
  }
  editSetting({regVerifyCount: regVerifyCount.value})
}

const compareByLengthAndUpperCase = (a, b, key) => {
  const getUpperCaseCount = (str) => (str.match(/[A-Z]/g) || []).length;
  if (a[key].length === b[key].length) {
    return getUpperCaseCount(a[key]) > getUpperCaseCount(b[key]) ? a : b;
  }
  return a[key].length > b[key].length ? a : b;
};


function closedSetBackground() {
  backgroundImage.value = ''
  localUpShow.value = false
  backgroundUrl.value = setting.value.background?.startsWith('http') ? setting.value.background : ''
}

function openTgSetting() {
  tgBotStatus.value = setting.value.tgBotStatus
  tgBotToken.value = ''
  customDomain.value = setting.value.customDomain
  tgMsgFrom.value = setting.value.tgMsgFrom
  tgMsgText.value = setting.value.tgMsgText
  tgMsgTo.value = setting.value.tgMsgTo
  tgChatId.value = []
  if (setting.value.tgChatId) {
    const list = setting.value.tgChatId.split(',')
    tgChatId.value.push(...list)
  }
  tgSettingShow.value = true
}

function openNoticePopupSetting() {
  noticePopupShow.value = true
}

function openResendList() {
  showResendList.value = true
}

function resetNoticeForm() {
  noticeForm.notice = setting.value.notice
  noticeForm.noticeContent = setting.value.noticeContent
  noticeForm.noticeDuration = setting.value.noticeDuration
  noticeForm.noticeTitle = setting.value.noticeTitle
  noticeForm.noticePosition = setting.value.noticePosition
  noticeForm.noticeType = setting.value.noticeType
  noticeForm.noticeOffset = setting.value.noticeOffset
  noticeForm.noticeWidth = setting.value.noticeWidth
}

function saveNoticePopup() {
  noticeForm.noticeOffset = noticeForm.noticeOffset || 0
  noticeForm.noticeWidth = noticeForm.noticeWidth || 0
  noticeForm.noticeDuration = noticeForm.noticeDuration || 0
  editSetting({...noticeForm})
}

function previewNoticePopup() {
  uiStore.previewNotice({...noticeForm})
}

function openThirdEmailSetting() {
  forwardEmail.value = []
  forwardStatus.value = setting.value.forwardStatus
  if (setting.value.forwardEmail) {
    const list = setting.value.forwardEmail.split(',')
    forwardEmail.value.push(...list)
  }
  thirdEmailShow.value = true
}

function openEmailPrefix() {
  emailPrefixShow.value = true
}

function openForwardRules() {
  ruleType.value = setting.value.ruleType
  ruleEmail.value = []
  if (setting.value.ruleEmail) {
    const list = setting.value.ruleEmail.split(',')
    ruleEmail.value.push(...list)
  }
  forwardRulesShow.value = true
}

function emailAddTag(val) {
  const emails = Array.from(new Set(
      val.split(/[,，]/).map(item => item.trim()).filter(item => item)
  ));

  forwardEmail.value.splice(forwardEmail.value.length - 1, 1)

  emails.forEach(email => {
    if (isEmail(email) && !forwardEmail.value.includes(email)) {
      forwardEmail.value.push(email)
    }
  })
}

function ruleEmailAddTag(val) {
  const emails = Array.from(new Set(
      val.split(/[,，]/).map(item => item.trim()).filter(item => item)
  ));

  ruleEmail.value.splice(ruleEmail.value.length - 1, 1)

  emails.forEach(email => {
    if (isEmail(email) && !ruleEmail.value.includes(email)) {
      ruleEmail.value.push(email)
    }
  })
}

function addChatTag(val) {

  const chatIds = Array.from(new Set(
      val.split(/[,，]/).map(item => item.trim()).filter(item => item)
  ));

  tgChatId.value.splice(tgChatId.value.length - 1, 1)

  chatIds.forEach(id => {
    if (!isNaN(Number(id))) {
      tgChatId.value.push(id)
    }
  })
}

function clearS3() {

  const form = {
    bucket: '',
    endpoint: '',
    region: '',
    s3AccessKey: '',
    s3SecretKey: '',
    forcePathStyle: 1
  }
  clearS3Loading.value = true
  editSetting(form)
}

function saveS3() {

  const form = {
    bucket: s3.bucket,
    endpoint: s3.endpoint,
    region: s3.region,
    forcePathStyle: s3.forcePathStyle
  }

  if (s3.s3AccessKey) form.s3AccessKey = s3.s3AccessKey
  if (s3.s3SecretKey) form.s3SecretKey = s3.s3SecretKey

  editSetting(form)
}

function tgBotSave() {
  const form = {
    customDomain: customDomain.value,
    tgBotStatus: tgBotStatus.value,
    tgChatId: tgChatId.value + '',
    tgMsgFrom: tgMsgFrom.value,
    tgMsgText: tgMsgText.value,
    tgMsgTo: tgMsgTo.value
  }
  if (tgBotToken.value) form.tgBotToken = tgBotToken.value
  editSetting(form)
}

function forwardEmailSave() {
  const form = {
    forwardStatus: forwardStatus.value,
    forwardEmail: forwardEmail.value + ''
  }
  editSetting(form)
}


function ruleEmailSave() {
  const form = {
    ruleEmail: ruleEmail.value + '',
    ruleType: ruleType.value
  }
  editSetting(form)
}

function normalizeFactor(value) {
  const factor = Number(value ?? 0)
  if (Number.isNaN(factor)) return 0
  return Math.min(1, Math.max(0, factor))
}

function resetEmailPrefix() {
  minEmailPrefix.value = setting.value.minEmailPrefix
  emailPrefixFilter.value = setting.value.emailPrefixFilter
}

function resetBlackList() {
  blackListForm.value.blackFrom = setting.value.blackFrom ? setting.value.blackFrom.split(',') : []
  blackListForm.value.blackContent = setting.value.blackContent ? setting.value.blackContent.split(',') : []
  blackListForm.value.blackSubject = setting.value.blackSubject ? setting.value.blackSubject.split(',') : []
}

function resetAiCodeFilter() {
  aiCodeFilter.value = setting.value.aiCodeFilter ? setting.value.aiCodeFilter.split(',') : []
}

function saveEmailPrefix() {
  const form = {}
  form.minEmailPrefix = minEmailPrefix.value
  form.emailPrefixFilter = emailPrefixFilter.value
  editSetting(form, true)
}

function saveAiCodeFilter() {
  editSetting({aiCodeFilter: aiCodeFilter.value + ''})
}

function saveBlackList() {

  let form = {
    blackContent: blackListForm.value.blackContent + '',
    blackSubject: blackListForm.value.blackSubject + '',
    blackFrom: blackListForm.value.blackFrom + ''
  }

  settingLoading.value = true

  setBlackList(form).then(() => {
    getSettings()
    ElMessage({
      message: t('setSuccess'),
      type: "success",
      plain: true
    })
    blackFormShow.value = false;
  }).finally(() => {
    settingLoading.value = false;
  })
}

function banEmailAddTag(val) {
  const emails = Array.from(new Set(
      val.split(/[,，]/).map(item => item.trim()).filter(item => item)
  ));

  blackListForm.value.blackFrom.splice(blackListForm.value.blackFrom.length - 1, 1)

  emails.forEach(email => {
    if ((isEmail(email) || isDomain(email)) && !blackListForm.value.blackFrom.includes(email)) {
      blackListForm.value.blackFrom.push(email)
    }
  })
}

function aiCodeFilterAddTag(val) {
  const emails = Array.from(new Set(
      val.split(/[,，]/).map(item => item.trim()).filter(item => item)
  ));

  aiCodeFilter.value.splice(aiCodeFilter.value.length - 1, 1)

  emails.forEach(email => {
    if ((isEmail(email) || isDomain(email)) && !aiCodeFilter.value.includes(email)) {
      aiCodeFilter.value.push(email)
    }
  })
}


function delBackground() {
  ElMessageBox.confirm(t('delBackgroundConfirm'), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {
    deleteBackground().then(() => {
      backgroundUrl.value = ''
      setting.value.background = null
      ElMessage({
        message: t('delSuccessMsg'),
        type: "success",
        plain: true
      })
    })
  })
}

function saveTurnstileKey() {
  const settingForm = {}
  settingForm.siteKey = turnstileForm.siteKey
  settingForm.secretKey = turnstileForm.secretKey
  editSetting(settingForm)
}

async function saveBackground() {

  let image = ''

  if (localUpShow.value) {
    image = await fileToBase64(backgroundFile, true);
  } else {
    if (backgroundUrl.value && !backgroundUrl.value.startsWith('http')) {
      ElMessage({
        message: t('imageLinkErrorMsg'),
        type: "error",
        plain: true
      })
      return
    }
    image = backgroundUrl.value
  }
  settingLoading.value = true

  setBackground(image).then(key => {
    setting.value.background = key
    showSetBackground.value = false
    ElMessage({
      message: t('saveSuccessMsg'),
      type: "success",
      plain: true
    })
    localUpShow.value = false
    backgroundImage.value = ''
  }).finally(() => {
    settingLoading.value = false
  })

}

function openSetBackground() {
  showSetBackground.value = true
}

function openCut() {
  const doc = document.createElement('input')
  doc.setAttribute('type', 'file')
  doc.setAttribute('accept', 'image/*')
  doc.click()
  doc.onchange = async (e) => {
    backgroundFile = e.target.files[0]
    backgroundImage.value = URL.createObjectURL(e.target.files[0])
    localUpShow.value = true
  }
}

function saveR2domain() {
  const settingForm = {r2Domain: r2DomainInput.value}
  editSetting(settingForm)
}

function openResendForm() {
  resendTokenFormShow.value = true
}

function openBlackListForm() {
  blackFormShow.value = true
}

function openAiCodeFilter() {
  aiCodeFilterShow.value = true
}

function saveResendToken() {
  const settingForm = {
    resendTokens: {}
  }
  const domain = resendTokenForm.domain.slice(1)
  settingForm.resendTokens[domain] = resendTokenForm.token.trim()
  editSetting(settingForm)
}

function backupSetting() {
  const settingForm = {...setting.value}
  delete settingForm.resendTokens
  delete settingForm.siteKey
  delete settingForm.secretKey
  backup = JSON.stringify(setting.value)
}

function cleanResendTokenForm() {
  resendTokenForm.token = ''
}

function beforeChange() {
  if (!settingReady.value || settingLoading.value) return false
  backupSetting()
  return true
}

function change(e) {
  if (!settingReady.value) return
  const settingForm = {...setting.value}
  delete settingForm.siteKey
  delete settingForm.secretKey
  delete settingForm.s3AccessKey
  delete settingForm.s3SecretKey
  delete settingForm.tgBotToken
  delete settingForm.resendTokens
  delete settingForm.mailjetApiKey
  delete settingForm.mailjetSecretKey
  editSetting(settingForm, false)
}

function saveActiveSetting() {
  if (activeSettingSection.value === 'website') {
    const settingForm = {
      ...setting.value,
      minEmailPrefix: minEmailPrefix.value,
      emailPrefixFilter: emailPrefixFilter.value + ''
    }
    delete settingForm.siteKey
    delete settingForm.secretKey
    delete settingForm.s3AccessKey
    delete settingForm.s3SecretKey
    delete settingForm.tgBotToken
    delete settingForm.resendTokens
    delete settingForm.mailjetApiKey
    delete settingForm.mailjetSecretKey
    editSetting(settingForm, false)
    return
  }
  if (activeSettingSection.value === 'customization') {
    editSetting({
      title: titleDraft.value,
      loginOpacity: panelOpacityPercent.value / 100,
      loginDarkenFactor: maskPercent.value / 100
    })
    return
  }
  change()
}

function changeField(key, value) {
  if (!settingReady.value) return
  setting.value[key] = value
  editSetting({[key]: value}, false)
}

function editSetting(settingForm, refreshStatus = true) {
  if (settingLoading.value) return
  settingLoading.value = true

  settingSet(settingForm).then(() => {
    settingLoading.value = false
    ElMessage({
      message: t('saveSuccessMsg'),
      type: "success",
      plain: true
    })
    if (setting.value.manyEmail === 1) {
      accountStore.currentAccountId = userStore.user.account.accountId;
    }
    if (refreshStatus) {
      getSettings()
    }
    r2DomainShow.value = false
    resendTokenFormShow.value = false
    resendQuotaFormShow.value = false
    mailjetFormShow.value = false
    turnstileShow.value = false
    tgSettingShow.value = false
    thirdEmailShow.value = false
    forwardRulesShow.value = false
    addVerifyCountShow.value = false
    regVerifyCountShow.value = false
    noticePopupShow.value = false
    addS3Show.value = false
    emailPrefixShow.value = false
    aiCodeFilterShow.value = false
  }).catch((e) => {
    panelOpacityPercent.value = factorToPercent(setting.value.loginOpacity)
    maskPercent.value = factorToPercent(setting.value.loginDarkenFactor)
    titleDraft.value = setting.value.title || ''
    setting.value = {...setting.value, ...JSON.parse(backup)}
  }).finally(() => {
    settingLoading.value = false
    clearS3Loading.value = false
  })
}
</script>

<style scoped lang="scss">
.settings-container {
  height: 100%;
  background: var(--psg-canvas) !important;
  position: relative;

  .loading {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    z-index: 2;
    width: 100%;
    position: absolute;
    top: 0;
    left: 0;
  }

  .loading-show {
    transition: all 200ms ease 200ms;
    opacity: 1;
  }

  .loading-hide {
    transition: all 200ms;
    pointer-events: none;
    opacity: 0;
  }
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

    @media (max-width: 960px)  { padding: 14px 16px 32px; }
    @media (max-width: 640px)  { padding: 12px 12px 28px; }
  }
}

.settings-shell {
  display: grid;
  grid-template-columns: 270px minmax(0, 1fr);
  gap: 18px;
  align-items: start;

  @media (max-width: 820px) {
    grid-template-columns: 1fr;
    gap: 12px;
    &:not(.mobile-detail-active) .settings-panel { display: none; }
    &.mobile-detail-active .settings-sidebar { display: none; }
  }
}

.settings-sidebar,
.settings-panel {
  background: var(--psg-surface);
  border: 1px solid var(--psg-border);
  border-radius: var(--psg-radius-md);
  overflow: hidden;
}

.settings-panel {
  container: settings-panel / inline-size;
}

.settings-sidebar {
  position: sticky;
  top: 16px;
  padding: 8px 0;
  display: flex;
  flex-direction: column;
  gap: 2px;

  @media (max-width: 820px) {
    position: static;
    flex-direction: column;
    overflow: visible;
    padding: 8px 0;
    border-radius: var(--psg-radius-sm);
  }
}

.settings-nav-item {
  width: calc(100% - 16px);
  min-height: 44px;
  margin: 0 8px;
  padding: 0 12px;
  display: flex;
  align-items: center;
  gap: 12px;
  border: none;
  border-left: 3px solid transparent;
  border-radius: var(--psg-radius-xs);
  background: transparent;
  color: var(--psg-text-secondary);
  font-family: var(--psg-font-sans);
  font-size: 13.5px;
  font-weight: 600;
  letter-spacing: 0;
  text-transform: none;
  cursor: pointer;
  transition: background 160ms ease, color 160ms ease;

  &:hover {
    background: var(--psg-surface-muted);
    color: var(--psg-text);
  }

  &.active {
    background: var(--psg-menu-active-bg);
    color: var(--psg-menu-active-text);
    font-weight: 700;
  }

  @media (max-width: 820px) {
    width: calc(100% - 16px);
    margin: 0 8px;
    min-height: 48px;
    white-space: normal;
    flex: 0 0 auto;
    border-left: 3px solid transparent;
    border-bottom: 0;
    padding: 0 12px;

    &.active {
      background: var(--psg-menu-active-bg);
    }
  }
}

.settings-nav-icon {
  flex: 0 0 auto;
  color: currentColor;
}

.settings-panel-header {
  min-height: 84px;
  padding: 18px 20px 16px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid var(--psg-border);

  h1 {
    margin: 0 0 4px;
    color: var(--psg-text);
    font-family: 'IBM Plex Sans', 'Noto Sans SC', sans-serif;
    font-size: 20px;
    font-weight: 750;
    line-height: 1.2;

    @media (max-width: 640px) { font-size: 16px; }
  }

  p {
    margin: 0;
    max-width: 38rem;
    color: var(--psg-text-secondary);
    font-size: 14px;
    font-weight: 500;
    line-height: 1.4;
  }

  @media (max-width: 520px) {
    align-items: stretch;
    flex-direction: column;
  }
}

.mobile-settings-back {
  display: none;
  align-items: center;
  gap: 3px;
  border: 0;
  padding: 0;
  margin: 0 0 8px;
  background: transparent;
  color: var(--psg-text-secondary);
  font-size: 12px;
  cursor: pointer;
  @media (max-width: 820px) { display: inline-flex; }
}

.settings-save-button {
  flex: 0 0 auto;
  min-width: 68px;
  height: 42px !important;
  border-radius: var(--psg-radius-sm) !important;
  margin: 0 !important;
}

.card-grid {
  display: block;
}

.card-content.appearance-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: 28px;
  align-items: start;

  @container settings-panel (max-width: 760px) {
    grid-template-columns: 1fr;
  }

  @media (max-width: 860px) {
    grid-template-columns: 1fr;
  }
}

.appearance-settings {
  display: flex;
  flex-direction: column;
  gap: 26px;
  min-width: 0;
}

.appearance-module {
  padding: 0 20px 24px;

  &:first-child { padding-top: 18px; }

  & + .appearance-module {
    padding-top: 24px;
    border-top: 1px solid var(--psg-border);
  }
}

.module-header {
  margin-bottom: 16px;

  h2 {
    margin: 0 0 2px;
    color: var(--psg-text);
    font-size: 14.5px;
    font-weight: 700;
    line-height: 1.3;
  }

  p {
    margin: 0;
    color: var(--psg-text-secondary);
    font-size: 12.5px;
    font-weight: 500;
    line-height: 1.4;
  }
}

.field-hint {
  display: block;
  margin-top: 8px;
  color: var(--psg-text-muted);
  font-size: 12px;
  font-weight: 500;
  line-height: 1.4;
}

.module-field {
  label {
    display: block;
    margin-bottom: 8px;
    color: var(--psg-text);
    font-size: 13px;
    font-weight: 600;
  }
}

.background-manager {
  display: flex;
  gap: 18px;
  align-items: flex-start;

  @media (max-width: 560px) {
    flex-direction: column;
  }
}

.background-frame {
  flex: 0 0 auto;
  width: 220px;
  height: 124px;
  border-radius: var(--psg-radius-sm);
  border: 1px solid var(--psg-border);
  overflow: hidden;

  @media (max-width: 560px) {
    width: 100%;
    height: 150px;
  }
}

.background-image {
  width: 100%;
  height: 100%;
}

.background-empty {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: var(--psg-surface-muted);
  color: var(--psg-text-muted);
  font-size: 12px;
  font-weight: 550;
}

.background-actions {
  flex: 1 1 auto;
  min-width: 0;
}

.background-buttons {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;

  .el-button {
    margin-left: 0;
  }
}

.slider-field {
  & + .slider-field {
    margin-top: 22px;
  }
}

.slider-label-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 8px;

  span:first-child {
    color: var(--psg-text);
    font-size: 13px;
    font-weight: 600;
  }
}

.slider-value {
  color: var(--psg-text-secondary);
  font-family: var(--psg-font-mono);
  font-size: 12.5px;
  font-weight: 600;
}

.appearance-preview {
  position: sticky;
  top: 16px;
  background: var(--psg-surface-muted);
  border: 1px solid var(--psg-border);
  border-radius: var(--psg-radius-md);
  padding: 14px;

  @media (max-width: 860px) {
    position: static;
  }
}

.preview-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 12px;
  color: var(--psg-text-secondary);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}

.preview-frame {
  border-radius: var(--psg-radius-sm);
  border: 1px solid var(--psg-border);
  background: var(--psg-canvas);
  padding: 22px 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  min-height: 260px;
  transition: background-image 200ms ease;
}

.preview-eyebrow {
  color: var(--psg-text-muted);
  font-family: var(--psg-font-mono);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.preview-card {
  width: 100%;
  max-width: 220px;
  background: var(--psg-surface);
  border: 1px solid var(--psg-border);
  border-radius: var(--psg-radius-sm);
  box-shadow: var(--psg-shadow-sm);
  padding: 16px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  transition: background 200ms ease;
}

.preview-title {
  color: var(--psg-text);
  font-size: 13px;
  font-weight: 700;
  margin-bottom: 4px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.preview-input {
  height: 26px;
  border-radius: var(--psg-radius-xs);
  border: 1px solid var(--psg-border);
  background: var(--psg-surface-muted);
  display: flex;
  align-items: center;
  padding: 0 8px;
  color: var(--psg-text-muted);
  font-size: 11px;
  font-weight: 500;
}

.preview-button {
  margin-top: 4px;
  height: 28px;
  border-radius: var(--psg-radius-xs);
  background: var(--psg-primary);
  color: var(--psg-on-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
}

.bot-verify-select {
  margin-left: 10px;
}

.settings-card {
  background: transparent;
  border: 0;
  border-radius: var(--psg-radius-sm);
  box-shadow: none;
}

.card-title {
  display: none;
}

.provider-card-grid {
  display: grid !important;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 16px;
}

.provider-config-section {
  margin-bottom: 16px;

  .el-input-number { width: 100%; }
}

.provider-config-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--psg-text);
  margin-bottom: 6px;
}

.provider-config-hint {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--psg-text-secondary);
}

.provider-config-note {
  font-size: 12px;
  color: var(--psg-text-muted);
  border-top: 1px solid var(--psg-border);
  padding-top: 12px;
}

.provider-usage-readout {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  font-weight: 600;
  color: var(--psg-text);
}

.card-content {
  padding: 0;
  display: flex;
  flex-direction: column;
}

.setting-item {
  display: grid;
  grid-template-columns: minmax(190px, 1fr) minmax(150px, auto);
  min-height: 80px;
  gap: 20px;
  padding: 14px 20px;
  align-items: center;
  border-bottom: 1px solid var(--psg-border);
  font-weight: 600;

  > div:first-child {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 6px;
    min-width: 0;

    span {
      color: var(--psg-text);
      font-size: 14px;
      line-height: 1.35;
    }

    p {
      flex-basis: 100%;
      margin: 1px 0 0;
      color: var(--psg-text-secondary);
      font-size: 13px;
      font-weight: 550;
      line-height: 1.35;

      &.danger-warn {
        color: var(--psg-danger);
        font-weight: 600;
        margin-top: 6px;
      }
    }
  }

  > div:last-child {
    min-width: 0;
    display: flex;
    justify-content: flex-end;
    align-items: center;
    color: var(--psg-text);
    font-weight: 600;
    text-align: right;
  }

  &:last-child {
    border-bottom: 0;
  }

  @media (max-width: 560px) {
    grid-template-columns: 1fr;
    gap: 10px;

    > div:last-child {
      justify-content: flex-start;
      text-align: left;
    }
  }

  @media (max-width: 480px) {
    grid-template-columns: 1fr;
    .setting-item-value { margin-top: 6px; }
  }
}

.r2domain-item {
  min-height: 80px;
  padding: 14px 20px;
  display: grid;
  grid-template-columns: minmax(190px, 1fr) minmax(150px, auto);
  gap: 20px;
  align-items: center;
  border-bottom: 1px solid var(--psg-border);

  > div:first-child {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;

    span {
      color: var(--psg-text);
      font-size: 14px;
      font-weight: 600;
      line-height: 1.35;
    }
  }

  > div:last-child {
    min-width: 0;
    text-align: right;
  }
}

.setting-number {
  width: 178px;
}

.setting-tag-input {
  width: min(220px, 100%);
}

.title-icon.warning {
  position: relative;
  top: 2px;
  cursor: pointer;
  margin-left: 2px;
}

.warning {
  margin-left: 2px;
  color: grey;
  cursor: pointer;
}

.cropper {
  border-radius: var(--psg-radius-sm);
  border: 1px solid var(--psg-border);
  height: 397px;
  width: 705px;
  @media (max-width: 767px) {
    width: calc(100vw - 60px);
    height: calc((100vw - 60px) * 9 / 16);
  }
}

.dialog-footer {
  display: flex;
  justify-content: space-between;
}

.notice-popup-item {
  margin-top: 15px;
}

.notice-line-item {
  margin-top: 15px;
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 15px;

  > * {
    width: 100%;
  }

  @media (max-width: 840px) {
    grid-template-columns: 1fr 1fr;
  }
  @media (max-width: 580px) {
    grid-template-columns: 1fr;
  }
}

.background-url {
  width: min(calc(100vw - 70px), 500px);
}


:deep(.el-dialog) {
  width: 400px !important;
  @media (max-width: 440px) {
    width: calc(100% - 40px) !important;
    margin-right: 20px !important;
    margin-left: 20px !important;
  }
}

:deep(.resend-table.el-dialog) {
  min-height: 300px;
  width: 500px !important;
  @media (max-width: 540px) {
    width: calc(100% - 40px) !important;
    margin-right: 20px !important;
    margin-left: 20px !important;
  }
}

:deep(.notice-popup.el-dialog) {
  min-height: 300px;
  width: 820px !important;
  @media (max-width: 860px) {
    width: calc(100% - 40px) !important;
    margin-right: 20px !important;
    margin-left: 20px !important;
  }
}

:deep(.resend-table .el-dialog__header) {
  padding-bottom: 5px;
}

:deep(.el-table__inner-wrapper:before) {
  background: var(--psg-surface);
}

:deep(.cut-dialog.el-dialog) {
  width: fit-content !important;
  height: fit-content !important;
}


:deep(.forward-dialog.el-dialog) {
  width: 500px !important;
  @media (max-width: 540px) {
    width: calc(100% - 40px) !important;
    margin-right: 20px !important;
    margin-left: 20px !important;
  }
}

.forward-dialog {
  .forward-head {
    display: flex;
    align-items: center;

    .forward-set-title {
      top: 1px;
      padding-right: 5px;
      position: relative;
      font-size: 16px;
      font-weight: bold;;
    }
  }
}

.error-image {
  background: var(--psg-surface-active);
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.cut-button {
  padding-top: 15px;
  width: 100%;
  display: flex;
  justify-content: space-between;

  .el-button {
    width: fit-content;
  }
}

.bot-verify {
  display: grid;
  grid-template-columns: 1fr auto;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;

  span {
    display: flex;
    align-items: center;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    min-width: 0;
  }

  .el-button {
    width: 48px;
    margin: 0 0 0 10px;
  }
}

.forward-set-body {
  display: flex;
  flex-direction: column;

  .el-switch {
    align-self: end;
  }

  > *:nth-child(-n+2) {
    margin-bottom: 15px;
  }

  .tg-msg-label {
    margin-top: 10px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    .el-select {
      width: v-bind(tgMsgLabelWidth);
    }
  }
}

.forward {
  span {
    display: flex;
    align-items: center;
  }

  .el-button {
    width: 48px;
    margin: 0 0 0 10px;
  }
}

.opt-button {
  width: fit-content !important;
}

.email-prefix {
  display: flex;
  justify-content: space-between;
}

.prefix-filter {
  display: flex;
  flex-direction: column;
}

.s3-button {
  display: grid;
  grid-template-columns: 80px 1fr;
  gap: 15px;

  .el-button {
    margin-left: 0;
  }
}

.r2domain {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;

  .storage-type {
    margin-right: 3px;
  }

  span {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .el-button {
    width: 48px;
    margin: 0 0 0 10px;
  }
}

.dialog-input {
  margin-bottom: 15px;
}

.force-path-style {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  .force-path-style-left {
    padding-left: 2px;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 5px;
  }
}

.settings-footer {
  margin-top: 14px;
  padding: 4px 4px 0;
  text-align: center;
  font-family: var(--psg-font-mono, 'JetBrains Mono', monospace);
  font-size: 11px;
  letter-spacing: 0.04em;
  color: var(--psg-text-muted);
}

.ai-service-status {
  flex: 0 0 auto;
  padding: 4px 8px;
  border-radius: var(--psg-radius-xs);
  font-size: 12px;
  font-weight: 700;
}
.ai-service-status.is-ready { background: var(--psg-primary-muted); color: var(--psg-primary); }
.ai-service-status.is-unavailable { background: var(--psg-danger-muted); color: var(--psg-danger); }

.token-item {
  padding-top: 0;

  div:last-child {
    font-weight: normal;
  }
}

form .el-button {
  margin-top: 10px;
  width: 100%;
}

.el-switch {
  height: 28px;
}


:deep(.el-button--small) {
  margin-top: 2px !important;
  margin-bottom: 2px !important;
  height: 24px;
}

:deep(.el-select__wrapper) {
  min-height: 28px;
}

</style>

<style>
.el-popper.is-dark {
}
</style>
