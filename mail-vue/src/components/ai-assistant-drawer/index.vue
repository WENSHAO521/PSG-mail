<template>
  <el-drawer
    v-model="show"
    class="ai-assistant-drawer"
    :title="$t('aiAssistant')"
    direction="rtl"
    size="400px"
    :close-on-click-modal="false"
  >
    <div class="ai-chat">
      <div ref="scrollRef" class="ai-chat-body">
        <div v-if="messages.length === 0" class="ai-chat-welcome">
          <Icon icon="solar:magic-stick-3-bold-duotone" width="28" height="28"/>
          <p>{{ $t('aiAssistantWelcome') }}</p>
        </div>
        <div v-for="(m, i) in messages" :key="i" class="ai-msg" :class="m.role">
          <div class="ai-msg-bubble">{{ m.content }}</div>
        </div>

        <div v-if="pending" class="ai-confirm-card">
          <div class="ai-confirm-title">{{ $t('aiAssistantConfirmTitle') }}</div>
          <div class="ai-confirm-body">
            <div class="ai-confirm-action">{{ confirmActionLabel }}</div>
            <div class="ai-confirm-args">
              <div v-for="(v, k) in pending.args" :key="k" class="ai-confirm-arg-row">
                <span class="ai-confirm-arg-key">{{ k }}</span>
                <span class="ai-confirm-arg-val">{{ v }}</span>
              </div>
            </div>
          </div>
          <div class="ai-confirm-footer">
            <el-button size="small" @click="respondConfirm(false)" :loading="confirmLoading">
              {{ $t('aiAssistantConfirmReject') }}
            </el-button>
            <el-button size="small" type="primary" @click="respondConfirm(true)" :loading="confirmLoading">
              {{ $t('aiAssistantConfirmApprove') }}
            </el-button>
          </div>
        </div>

        <div v-if="loading" class="ai-msg assistant">
          <div class="ai-msg-bubble ai-thinking">
            <Icon icon="svg-spinners:3-dots-fade" width="18" height="18"/>
            {{ $t('aiAssistantThinking') }}
          </div>
        </div>
      </div>

      <div class="ai-chat-input">
        <el-input
          v-model="input"
          :placeholder="$t('aiAssistantInputPlaceholder')"
          :disabled="loading || !!pending"
          @keydown.enter.exact.prevent="send"
        />
        <el-button type="primary" :disabled="loading || !!pending || !input.trim()" @click="send">
          {{ $t('aiAssistantSend') }}
        </el-button>
      </div>
    </div>
  </el-drawer>
</template>

<script setup>
import { ref, computed, nextTick, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { useI18n } from 'vue-i18n'
import { useUiStore } from '@/store/ui.js'
import { aiAssistantChat, aiAssistantConfirm } from '@/request/ai-assistant.js'

defineOptions({ name: 'aiAssistantDrawer' })

const { t } = useI18n()
const uiStore = useUiStore()

const show = computed({
  get: () => uiStore.aiAssistantShow,
  set: (v) => { uiStore.aiAssistantShow = v }
})

const messages = ref([])
const input = ref('')
const loading = ref(false)
const confirmLoading = ref(false)
const pending = ref(null)
const scrollRef = ref(null)

const confirmActionLabel = computed(() => {
  if (!pending.value) return ''
  return pending.value.tool === 'sendEmail' ? t('aiAssistantConfirmSendEmail') : t('aiAssistantConfirmDeleteEmail')
})

function scrollToBottom() {
  nextTick(() => {
    if (scrollRef.value) scrollRef.value.scrollTop = scrollRef.value.scrollHeight
  })
}

watch(() => messages.value.length, scrollToBottom)

async function send() {
  const text = input.value.trim()
  if (!text) return
  messages.value.push({ role: 'user', content: text })
  input.value = ''
  loading.value = true
  try {
    const data = await aiAssistantChat(messages.value.map(m => ({ role: m.role, content: m.content })))
    handleResult(data)
  } catch {
    ElMessage({ message: t('aiAssistantFail'), type: 'error', plain: true })
  } finally {
    loading.value = false
  }
}

function handleResult(data) {
  if (data.pendingConfirmation) {
    pending.value = data.pendingConfirmation
    return
  }
  if (data.reply) {
    messages.value.push({ role: 'assistant', content: data.reply })
  }
}

async function respondConfirm(approve) {
  if (!pending.value) return
  confirmLoading.value = true
  try {
    const data = await aiAssistantConfirm(pending.value.confirmId, approve)
    pending.value = null
    handleResult(data)
  } catch {
    ElMessage({ message: t('aiAssistantFail'), type: 'error', plain: true })
    pending.value = null
  } finally {
    confirmLoading.value = false
  }
}
</script>

<style scoped>
.ai-chat {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.ai-chat-body {
  flex: 1;
  overflow-y: auto;
  padding: 4px 2px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ai-chat-welcome {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  text-align: center;
  color: var(--psg-text-secondary);
  padding: 32px 12px;
}

.ai-msg {
  display: flex;
}

.ai-msg.user {
  justify-content: flex-end;
}

.ai-msg-bubble {
  max-width: 85%;
  padding: 8px 12px;
  border-radius: var(--psg-radius-sm);
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 13px;
  line-height: 1.5;
  background: var(--psg-surface-muted);
  color: var(--psg-text);
}

.ai-msg.user .ai-msg-bubble {
  background: var(--psg-primary);
  color: var(--psg-on-primary);
}

.ai-thinking {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--psg-text-secondary);
}

.ai-confirm-card {
  border: 1px solid var(--psg-danger);
  background: var(--psg-danger-muted);
  border-radius: var(--psg-radius-sm);
  padding: 12px;
}

.ai-confirm-title {
  font-weight: 600;
  font-size: 13px;
  margin-bottom: 8px;
  color: var(--psg-text);
}

.ai-confirm-action {
  font-size: 13px;
  margin-bottom: 6px;
  color: var(--psg-text);
}

.ai-confirm-args {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: 10px;
}

.ai-confirm-arg-row {
  display: flex;
  gap: 6px;
  font-size: 12px;
  color: var(--psg-text-secondary);
}

.ai-confirm-arg-key {
  font-weight: 600;
  flex-shrink: 0;
}

.ai-confirm-arg-val {
  word-break: break-word;
}

.ai-confirm-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.ai-chat-input {
  display: flex;
  gap: 8px;
  padding-top: 10px;
}
</style>
