<template>
  <div class="content-box" ref="contentBox">
    <div ref="container" class="content-html"></div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { useUiStore } from '@/store/ui.js'

const props = defineProps({
  html: {
    type: String,
    required: true
  }
})

const uiStore = useUiStore()

const container = ref(null)
const contentBox = ref(null)
let shadowRoot = null

// ── Color parsing, used only to decide which elements in the raw email
// HTML hardcode a "white page / black text" look that needs to be
// neutralized in dark mode. Anything that isn't near-white/near-black
// (brand colors, buttons, etc.) is left exactly as the email authored it.
const NAMED_COLORS = {
  white: '#ffffff', black: '#000000', whitesmoke: '#f5f5f5',
  gainsboro: '#dcdcdc', silver: '#c0c0c0', lightgray: '#d3d3d3',
  lightgrey: '#d3d3d3', gray: '#808080', grey: '#808080',
  darkgray: '#a9a9a9', darkgrey: '#a9a9a9', ivory: '#fffff0',
  snow: '#fffafa', aliceblue: '#f0f8ff', ghostwhite: '#f8f8ff',
  honeydew: '#f0fff0', azure: '#f0ffff', transparent: 'transparent',
}

function parseColor(str) {
  if (!str) return null
  str = str.trim().toLowerCase()
  if (str === 'transparent') return { r: 0, g: 0, b: 0, a: 0 }
  let m = str.match(/^#([0-9a-f]{3})$/)
  if (m) {
    const [r, g, b] = m[1].split('').map(c => parseInt(c + c, 16))
    return { r, g, b, a: 1 }
  }
  m = str.match(/^#([0-9a-f]{6})$/)
  if (m) {
    const n = m[1]
    return { r: parseInt(n.slice(0, 2), 16), g: parseInt(n.slice(2, 4), 16), b: parseInt(n.slice(4, 6), 16), a: 1 }
  }
  m = str.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/)
  if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] !== undefined ? +m[4] : 1 }
  if (NAMED_COLORS[str]) return str === 'transparent' ? { r: 0, g: 0, b: 0, a: 0 } : parseColor(NAMED_COLORS[str])
  return null
}

function luminance(c) {
  if (!c) return null
  const srgb = [c.r, c.g, c.b].map(v => {
    v /= 255
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2]
}

function firstColorToken(value) {
  if (!value) return null
  const m = value.trim().match(/^(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\)|[a-zA-Z]+)/)
  return m ? m[1] : null
}

function isLightColor(value) {
  const c = parseColor(firstColorToken(value))
  if (!c || c.a === 0) return false
  return luminance(c) > 0.6
}

function isDarkColor(value) {
  const c = parseColor(firstColorToken(value))
  if (!c || c.a === 0) return false
  return luminance(c) < 0.45
}

function extractLastDeclValue(styleText, propNames) {
  if (!styleText) return null
  let result = null
  styleText.split(';').forEach(decl => {
    const idx = decl.indexOf(':')
    if (idx === -1) return
    const prop = decl.slice(0, idx).trim().toLowerCase()
    if (propNames.includes(prop)) result = decl.slice(idx + 1).trim()
  })
  return result
}

function hasLightBackground(styleText) {
  return isLightColor(extractLastDeclValue(styleText, ['background', 'background-color']))
}

function hasDarkText(styleText) {
  return isDarkColor(extractLastDeclValue(styleText, ['color']))
}

// Walk the parsed email DOM and tag elements that hardcode a light
// background or dark text with marker classes. The dark-mode stylesheet
// below only touches elements carrying these classes, so authored brand
// colors, buttons, and images are left untouched.
function markDarkModeCandidates(root) {
  root.querySelectorAll('*').forEach(el => {
    const styleAttr = el.getAttribute('style')
    if (hasLightBackground(styleAttr) || isLightColor(el.getAttribute('bgcolor'))) {
      el.classList.add('psg-dm-bg')
    }
    if (hasDarkText(styleAttr)) {
      el.classList.add('psg-dm-text')
    }
  })
}

function updateContent() {
  if (!shadowRoot) return;

  // 1. 提取 <body> 的 style 属性（如果存在）
  const bodyStyleRegex = /<body[^>]*style="([^"]*)"[^>]*>/i;
  const bodyStyleMatch = props.html.match(bodyStyleRegex);
  const bodyStyle = bodyStyleMatch ? bodyStyleMatch[1] : '';

  // 2. 移除 <body> 标签（保留内容）
  const rawHtml = props.html.replace(/<\/?body[^>]*>/gi, '');

  // 3. Strip <script>/<noscript> and on* event handler attributes
  const tmp = document.createElement('div')
  tmp.innerHTML = rawHtml
  tmp.querySelectorAll('script, noscript').forEach(el => el.remove())
  tmp.querySelectorAll('*').forEach(el => {
    Array.from(el.attributes).forEach(attr => {
      if (/^on/i.test(attr.name)) el.removeAttribute(attr.name)
    })
  })

  // 3b. Tag elements (including ones the body style implies) whose
  // hardcoded colors need neutralizing in dark mode.
  markDarkModeCandidates(tmp)
  const cleanedHtml = tmp.innerHTML

  const wrapperClasses = ['shadow-content']
  if (hasLightBackground(bodyStyle)) wrapperClasses.push('psg-dm-bg')
  if (hasDarkText(bodyStyle)) wrapperClasses.push('psg-dm-text')

  // 4. 将 body 的 style 应用到 .shadow-content
  shadowRoot.innerHTML = `
    <style>
      :host {
        all: initial;
        width: 100%;
        height: 100%;
        font-family: 'IBM Plex Sans', 'Noto Sans SC', -apple-system, BlinkMacSystemFont,
                    'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
        font-size: 14px;
        line-height: 1.5;
        color: #13181D;
        word-break: break-word;
      }

      h1, h2, h3, h4 {
          font-size: 18px;
          font-weight: 700;
      }

      p {
        margin: 0;
      }

      a {
        text-decoration: none;
        color: var(--psg-primary, #1E5940);
      }

      .shadow-content {
        background: var(--psg-html-shadow-bg, transparent);
        width: fit-content;
        height: fit-content;
        min-width: 100%;
      }

      img:not(table img) {
        max-width: 100%;
        height: auto !important;
      }

      /* Dark mode: only elements tagged above (hardcoded light bg / dark
         text) get overridden — everything else in the email keeps its
         authored color. Toggled via .psg-dark from the app theme so an
         already-open email re-themes instantly, no re-render needed. */
      .shadow-content.psg-dark {
        background: var(--psg-canvas, #101311);
        color: #E6EAE7;
      }

      .shadow-content.psg-dark a {
        color: var(--psg-primary, #45B67D);
      }

      .shadow-content.psg-dark .psg-dm-bg {
        background-color: var(--psg-canvas, #101311) !important;
      }

      .shadow-content.psg-dark .psg-dm-text {
        color: #E6EAE7 !important;
      }

    </style>
    <div class="${wrapperClasses.join(' ')}" style="${bodyStyle}">
      ${cleanedHtml}
    </div>
  `;
  applyDarkMode()
}

function applyDarkMode() {
  const shadowContent = shadowRoot?.querySelector('.shadow-content')
  if (!shadowContent) return
  shadowContent.classList.toggle('psg-dark', !!uiStore.dark)
}

function autoScale() {
  if (!shadowRoot || !contentBox.value) return

  const parent = contentBox.value
  const shadowContent = shadowRoot.querySelector('.shadow-content')

  if (!shadowContent) return

  const parentWidth = parent.offsetWidth
  const childWidth = shadowContent.scrollWidth

  if (childWidth === 0) return

  const scale = parentWidth / childWidth

  const hostElement = shadowRoot.host
  hostElement.style.zoom = scale
}

onMounted(() => {
  shadowRoot = container.value.attachShadow({ mode: 'open' })
  updateContent()
  autoScale()
})

watch(() => props.html, () => {
  updateContent()
  autoScale()
})

// Live theme toggle: just flip the class, no re-parse of the email needed.
watch(() => uiStore.dark, () => {
  applyDarkMode()
})
</script>

<style scoped>
.content-box {
  width: 100%;
  height: 100%;
  overflow: hidden;
  font-family: 'IBM Plex Sans', 'Noto Sans SC', -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
}

.content-html {
  width: 100%;
  height: 100%;
}
</style>
