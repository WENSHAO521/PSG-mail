<template>
  <el-dialog v-model="visible" :title="title" width="min(960px, 94vw)" align-center class="att-preview-dialog"
             destroy-on-close @closed="cleanup">
    <div class="att-preview-body" v-loading="loading">
      <p v-if="failed" class="att-preview-msg">{{ $t('attPreviewFailed') }}</p>
      <iframe v-else-if="kind === 'pdf' && objectUrl" :src="objectUrl" class="att-preview-frame" :title="title" />
      <video v-else-if="kind === 'video' && objectUrl" :src="objectUrl" controls class="att-preview-media" />
      <audio v-else-if="kind === 'audio' && objectUrl" :src="objectUrl" controls class="att-preview-audio" />
      <pre v-else-if="kind === 'text' && text !== null" class="att-preview-text">{{ text }}</pre>
      <p v-if="truncated" class="att-preview-msg">{{ $t('attPreviewTruncated') }}</p>
    </div>
    <template #footer>
      <a class="el-button" :href="url" download>{{ $t('attDownload') }}</a>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref } from 'vue'
import { previewKind } from '@/utils/file-utils.js'

// Attachments are served as downloads (Content-Disposition: attachment,
// and anything not inline-safe as octet-stream), so an iframe on the URL
// would just download it again. The file is fetched once and shown from a
// blob of the right type instead; text is shown as text, never as HTML.
const MIME = { pdf: 'application/pdf', mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav', m4a: 'audio/mp4' }
const TEXT_LIMIT = 512 * 1024

const visible = ref(false)
const loading = ref(false)
const failed = ref(false)
const truncated = ref(false)
const title = ref('')
const url = ref('')
const kind = ref(null)
const objectUrl = ref('')
const text = ref(null)

async function open(att, href) {
  cleanup()
  title.value = att.filename
  url.value = href
  kind.value = previewKind(att.filename)
  visible.value = true
  loading.value = true
  try {
    const res = await fetch(href)
    if (!res.ok) throw new Error(String(res.status))
    const buf = await res.arrayBuffer()
    if (kind.value === 'text') {
      truncated.value = buf.byteLength > TEXT_LIMIT
      text.value = new TextDecoder().decode(buf.slice(0, TEXT_LIMIT))
    } else {
      const ext = att.filename.split('.').pop().toLowerCase()
      objectUrl.value = URL.createObjectURL(new Blob([buf], { type: MIME[ext] || 'application/octet-stream' }))
    }
  } catch (e) {
    failed.value = true
  } finally {
    loading.value = false
  }
}

function cleanup() {
  if (objectUrl.value) URL.revokeObjectURL(objectUrl.value)
  objectUrl.value = ''
  text.value = null
  failed.value = false
  truncated.value = false
}

defineExpose({ open })
</script>

<style scoped lang="scss">
.att-preview-body {
  min-height: 200px;
}
.att-preview-frame {
  width: 100%;
  height: min(75vh, 900px);
  border: 0;
  border-radius: var(--psg-radius-sm);
  background: var(--psg-surface-muted);
}
.att-preview-media {
  width: 100%;
  max-height: 75vh;
  border-radius: var(--psg-radius-sm);
}
.att-preview-audio {
  width: 100%;
}
.att-preview-text {
  max-height: 70vh;
  overflow: auto;
  margin: 0;
  padding: 12px;
  border-radius: var(--psg-radius-sm);
  background: var(--psg-surface-muted);
  color: var(--psg-text);
  font-size: 13px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
}
.att-preview-msg {
  margin: 12px 0 0;
  color: var(--psg-text-muted);
  font-size: 13px;
}
</style>
