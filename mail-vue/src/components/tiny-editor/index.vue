<template>
  <div class="editor-box" :class="showLoading ? 'editor-box-loading' : ''"
       :style="{ '--editor-radius': props.radius }">
    <loading class="loading" v-if="showLoading"/>
    <!-- Hidden: TinyMCE replaces it, and between a theme-switch destroy and
         re-init it would otherwise flash as a bare native textarea. -->
    <textarea v-else style="outline: none; visibility: hidden" :id="editorId" ref="editorRef"></textarea>
  </div>
</template>

<script setup>
import { registerMistIcons } from './mist-icons.js'
import {ref, onMounted, onBeforeUnmount, watch, nextTick, shallowRef, defineEmits, computed} from 'vue';
import loading from "@/components/loading/index.vue";
import {useI18n} from 'vue-i18n'
import {useUiStore} from '@/store/ui.js'
import {useSettingStore} from '@/store/setting.js'

defineExpose({
  clearEditor,
  focus,
  getContent,
  insertContent,
  getSelectedContent,
  getSelectedText,
  replaceSelection,
  setSignature
})

const props = defineProps({
  defValue: {
    type: String,
    default: ''
  },
  editorId: {
    type: String,
    default: () => `editor-${Date.now()}`
  },
  toolbar: {
    type: String,
    default: null
  },
  height: {
    type: String,
    default: '100%'
  },
  placeholder: {
    type: String,
    default: ''
  },
  radius: {
    type: String,
    default: 'var(--psg-radius-sm)'
  }
});


const {locale, t} = useI18n()
const emit = defineEmits(['change','focus']);
const editor = shallowRef(null);
const isInitialized = ref(false);
const editorRef = ref(null);
const showLoading = ref(false);
const uiStore = useUiStore();
const settingStore = useSettingStore();

onMounted(() => {
  initTinyMCE();
});

onBeforeUnmount(() => {
  destroyEditor();
});

watch(() => props.defValue, (newValue) => {
  if (editor.value && editor.value.getContent() !== newValue) {
    editor.value.setContent(newValue);
  }
});

// Skin and UI language can only change by re-creating the editor. Carry the
// current content across — re-initialising from defValue would throw away
// whatever was typed since it was opened.
watch(() => [uiStore.dark, settingStore.lang], () => {
  const content = editor.value ? editor.value.getContent() : null;
  destroyEditor();
  initEditor(content);
});

const language = computed(() => {
  if (locale.value === 'zh') {
    return 'zh_CN'
  }

  return 'en'
})

function clearEditor() {
  if (editor.value) {
    editor.value.setContent('');
  }
}

const tinyBase = import.meta.env.BASE_URL + 'tinymce'

function initTinyMCE() {
  if (window.tinymce) {
    initEditor();
    return;
  }
  showLoading.value = true;
  const script = document.createElement('script');
  script.src = tinyBase + '/tinymce.min.js';
  script.onload = () => {
    showLoading.value = false;
    // Wait for Vue to render the textarea before TinyMCE tries to mount on it
    nextTick(() => initEditor());
  };
  script.onerror = () => { showLoading.value = false; };
  document.head.appendChild(script);
}

function initEditor(initialContent = null) {
  window.tinymce.init({
    selector: `#${props.editorId}`,
    base_url: tinyBase,
    suffix: '.min',
    statusbar: false,
    height: props.height,
    auto_focus: true,
    // Compose is a fixed-position floating window with `overflow: hidden`
    // (write/index.vue .write-box) so the editor can clip its own rounded
    // corners. Under the default 'combined' ui_mode, TinyMCE renders the
    // floating-toolbar overflow drawer, context toolbars and the
    // autocompleter as absolutely-positioned children *inside* that
    // clipped container — their anchor math still resolves, but the
    // ancestor's overflow:hidden (and, in the minimized/maximized states,
    // its changing size) either clips them or throws off the computed
    // position entirely. 'split' renders that floating UI into a single
    // sink appended to <body> and positions it from the anchor button's
    // live getBoundingClientRect() instead, so it always lands next to
    // the button that opened it regardless of any clipping ancestor.
    ui_mode: 'split',
    // (The sink's z-index isn't a JS init option in this TinyMCE build —
    // it comes from the .tox-tinymce-aux rule in the global <style> block
    // below, raised past Compose's own z-index: 2000.)
    //relative_urls: false,  //阻止 img标签域名和网站域名相同 自动把链接转换相对路径
    //remove_script_host: false, // 阻止删除 URL 中的域名
    forced_root_block: 'div',
    skin: `${uiStore.dark ? 'oxide-dark' : 'oxide'}`,
    content_css: `${tinyBase}/css/index.css,${uiStore.dark ? 'dark' : 'default'}`,
    content_style: `
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Roboto:wght@400;700&family=Open+Sans:wght@400;600&family=Lato:wght@400;700&family=Poppins:wght@400;600&family=Nunito:wght@400;600&family=Montserrat:wght@400;600&family=Source+Sans+3:wght@400;600&family=Raleway:wght@400;600&family=Ubuntu:wght@400;500&family=Merriweather:wght@400;700&family=Playfair+Display:wght@400;600&family=Lora:wght@400;600&family=EB+Garamond:wght@400;500&family=Noto+Serif:wght@400;700&family=Oswald:wght@400;600&family=Roboto+Mono:wght@400;500&family=Source+Code+Pro:wght@400;600&family=JetBrains+Mono:wght@400;500&family=Noto+Sans+SC:wght@400;700&family=Noto+Serif+SC:wght@400;700&family=ZCOOL+XiaoWei&family=Ma+Shan+Zheng&display=swap');
      :root {
        --scrollbar-track-color: ${uiStore.dark ? '#1C1C1F' : '#FFFFFF'};
        --scrollbar-thumb-color: ${uiStore.dark ? '#3A3A3F' : '#D1D1D6'};
      }
      /* Oxide pins the placeholder at left: 1px, ignoring the body padding,
         so the hint sat left of where typed text actually starts. Letting it
         take its static position lines the two up. */
      .mce-content-body[data-mce-placeholder]:not(.mce-visualblocks)::before { left: auto !important; right: auto !important; }
      body { padding: 12px 16px !important; font-size: 15px; line-height: 1.7; color: ${uiStore.dark ? '#F2F2F7' : '#1C1C1E'}; }
      a { color: ${uiStore.dark ? '#F4B6C6' : '#B04A6A'}; }
      blockquote, .mceNonEditable {
        color: ${uiStore.dark ? '#D1D1D6' : '#3C3C43'} !important;
        background: ${uiStore.dark ? '#2A2A2E' : '#F2F2F7'} !important;
        border-left: 0 !important;
        border-radius: 14px;
        padding: 10px 14px !important;
        margin: 12px 0 !important;
      }
      @media (max-width: 767px) {
        body { padding: 10px 12px !important; }
      }
      ${uiStore.dark ? `
        body { background: #1C1C1F !important; color: #F2F2F7 !important; }
        hr { border-color: #2E2E33 !important; }
        code { background-color: #2A2A2E; }
        figure figcaption { color: #9A9AA0; }
        .mce-content-body[data-mce-placeholder]:not(.mce-visualblocks)::before { color: #9A9AA0 !important; }
      ` : ''}
    `,
    font_family_formats: [
      'Default=-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
      'Inter=Inter,sans-serif',
      'Roboto=Roboto,sans-serif',
      'Open Sans=Open Sans,sans-serif',
      'Lato=Lato,sans-serif',
      'Poppins=Poppins,sans-serif',
      'Nunito=Nunito,sans-serif',
      'Montserrat=Montserrat,sans-serif',
      'Source Sans 3=Source Sans 3,sans-serif',
      'Raleway=Raleway,sans-serif',
      'Ubuntu=Ubuntu,sans-serif',
      'Merriweather=Merriweather,serif',
      'Playfair Display=Playfair Display,serif',
      'Lora=Lora,serif',
      'EB Garamond=EB Garamond,serif',
      'Noto Serif=Noto Serif,serif',
      'Oswald=Oswald,sans-serif',
      'Roboto Mono=Roboto Mono,monospace',
      'Source Code Pro=Source Code Pro,monospace',
      'JetBrains Mono=JetBrains Mono,monospace',
      'Noto Sans SC=Noto Sans SC,sans-serif',
      'Noto Serif SC=Noto Serif SC,serif',
      'ZCOOL XiaoWei=ZCOOL XiaoWei,serif',
      'Ma Shan Zheng=Ma Shan Zheng,cursive',
      'Arial=Arial,Helvetica,sans-serif',
      'Times New Roman=Times New Roman,Times,serif',
      'Georgia=Georgia,serif',
      'Verdana=Verdana,Geneva,sans-serif',
      'Courier New=Courier New,Courier,monospace',
    ].join('; '),
    plugins: 'link image advlist lists emoticons fullscreen table preview code',
    // Only the buttons someone reaches for on most emails stay on the main
    // row: fonts, the four basic styles, colors, alignment, lists, link and
    // image. Everything used rarely (quote, emoji, table, HTML source,
    // preview, fullscreen, clear formatting) lives behind "moreformat" —
    // a real named "更多格式" menu, not TinyMCE's anonymous "..." overflow
    // drawer — see the addMenuButton('moreformat', ...) call below.
    // 'alignformat' and 'listformat' are themselves single dropdown
    // buttons (registered below) that fold what used to be 4-6 separate
    // icon buttons into one. The toolbar uses compact group spacing so the
    // named '更多格式' control remains part of the primary row at the
    // standard compose width; it is still allowed to wrap on genuinely
    // narrow layouts rather than being hidden behind an anonymous drawer.
    toolbar: props.toolbar ?? 'fontfamily fontsize | bold italic underline strikethrough | forecolor backcolor | alignformat listformat | link | moreformat',
    toolbar_mode: 'wrap',
    font_size_formats: '10px 11px 12px 14px 16px 18px 20px 24px 28px 32px 36px 48px',
    emoticons_search: false,
    placeholder: props.placeholder || undefined,
    language: language.value,
    language_load: true,
    menubar: false,
    license_key: 'gpl',
    noneditable_class: 'mceNonEditable',
    setup: (ed) => {
      editor.value = ed;
      registerMistIcons(ed);

      // 'alignformat' — left/center/right/justify, folded into one
      // dropdown instead of four separate toggle icons.
      ed.ui.registry.addMenuButton('alignformat', {
        icon: 'align-left',
        tooltip: t('editorAlign'),
        fetch: (callback) => callback([
          { type: 'menuitem', icon: 'align-left', text: t('editorAlignLeft'), onAction: () => ed.execCommand('JustifyLeft') },
          { type: 'menuitem', icon: 'align-center', text: t('editorAlignCenter'), onAction: () => ed.execCommand('JustifyCenter') },
          { type: 'menuitem', icon: 'align-right', text: t('editorAlignRight'), onAction: () => ed.execCommand('JustifyRight') },
          { type: 'menuitem', icon: 'align-justify', text: t('editorAlignJustify'), onAction: () => ed.execCommand('JustifyFull') },
        ]),
      });

      // 'listformat' — bullet/numbered list + indent/outdent, folded into
      // one dropdown so the main row doesn't need four separate icons.
      ed.ui.registry.addMenuButton('listformat', {
        icon: 'unordered-list',
        tooltip: t('editorList'),
        fetch: (callback) => callback([
          { type: 'menuitem', icon: 'unordered-list', text: t('editorBulletList'), onAction: () => ed.execCommand('InsertUnorderedList') },
          { type: 'menuitem', icon: 'ordered-list', text: t('editorNumberedList'), onAction: () => ed.execCommand('InsertOrderedList') },
          { type: 'separator' },
          { type: 'menuitem', icon: 'outdent', text: t('editorDecreaseIndent'), onAction: () => ed.execCommand('Outdent') },
          { type: 'menuitem', icon: 'indent', text: t('editorIncreaseIndent'), onAction: () => ed.execCommand('Indent') },
        ]),
      });

      // 'moreformat' — the actual "更多格式" menu: a real icon+text list of
      // the low-frequency tools, anchored to this button through the same
      // TinyMCE dropdown machinery the font/size/color pickers already use
      // (not the native "..." overflow drawer, and not a hand-rolled Vue
      // popover), so click-outside/Escape/arrow-key nav/viewport flipping
      // and re-anchoring after fullscreen/resize all come for free.
      ed.ui.registry.addMenuButton('moreformat', {
        icon: 'more-drawer',
        tooltip: t('editorMoreFormatting'),
        fetch: (callback) => callback([
          { type: 'menuitem', icon: 'quote', text: t('editorQuote'), onAction: () => ed.execCommand('mceBlockQuote') },
          { type: 'menuitem', icon: 'emoji', text: t('editorEmoji'), onAction: () => ed.execCommand('mceEmoticons') },
          { type: 'menuitem', icon: 'table', text: t('editorInsertTable'), onAction: () => ed.execCommand('mceInsertTableDialog') },
          { type: 'menuitem', icon: 'image', text: t('editorInsertImage'), onAction: () => ed.execCommand('mceImage') },
          { type: 'separator' },
          { type: 'menuitem', icon: 'sourcecode', text: t('editorHtmlSource'), onAction: () => ed.execCommand('mceCodeEditor') },
          { type: 'menuitem', icon: 'preview', text: t('editorPreview'), onAction: () => ed.execCommand('mcePreview') },
          { type: 'menuitem', icon: 'fullscreen', text: t('editorFullscreen'), onAction: () => ed.execCommand('mceFullScreen') },
          { type: 'separator' },
          { type: 'menuitem', icon: 'remove-formatting', text: t('editorClearFormat'), onAction: () => ed.execCommand('RemoveFormat') },
        ]),
      });

      ed.on('init', () => {
        ed.setContent(initialContent ?? props.defValue);
        isInitialized.value = true;
        // TinyMCE's zh_CN pack labels the empty font-family select as
        // “预设”, which is misleading in a mail editor. Keep the native
        // select behavior and only replace its initial label with the
        // language-aware product term.
        const updateFontButtonLabel = () => {
          const fontButton = document.querySelector('[data-mce-name="fontfamily"]')
          const fontLabel = fontButton?.querySelector('.tox-tbtn__select-label')
          if (fontLabel) fontLabel.textContent = t('editorFontFamily')
          if (fontButton) fontButton.setAttribute('aria-label', t('editorFontFamily'))
        }
        requestAnimationFrame(updateFontButtonLabel)
        setTimeout(updateFontButtonLabel, 120)
      });
      ed.on('input change', () => {
        const content = ed.getContent();
        const text = ed.getContent({format: 'text'});
        emit('change', content, text);
      });
      ed.on('focus', () => {
        emit('focus', focus);
      })
    },
    autofocus: true,
    branding: false,
    file_picker_types: 'image',
    image_dimensions: false,
    image_description: false,
    link_title: false,
    dialog_type: 'none',
    file_picker_callback: (callback, value, meta) => {
      const input = document.createElement('input');
      input.setAttribute('type', 'file');
      input.setAttribute('accept', 'image/*');

      input.addEventListener('change', async (e) => {
        let file = e.target.files[0];
        const reader = new FileReader();
        reader.onload = () => {
          const id = 'blobid' + (new Date()).getTime();
          const blobCache = tinymce.activeEditor.editorUpload.blobCache;
          const base64 = reader.result.split(',')[1];
          const blobInfo = blobCache.create(id, file, base64);
          blobCache.add(blobInfo);

          callback(blobInfo.blobUri(), {title: file.name});
        }
        reader.readAsDataURL(file);
      });

      input.click();
    }
  });
}

function focus() {
  nextTick(() => {
    editor.value.focus()
  })
}

function getContent() {
  return editor.value.getContent()
}

function insertContent(html) {
  if (editor.value) editor.value.insertContent(html)
}

// Swaps the compose signature block (div.psg-signature) for `html`, removes
// it when `html` is empty, or inserts a new one at the caret when there is
// none yet. One undo step.
function setSignature(html) {
  const ed = editor.value
  if (!ed) return
  const existing = ed.getBody().querySelector('.psg-signature')
  ed.undoManager.transact(() => {
    if (existing && html) {
      existing.innerHTML = html
    } else if (existing) {
      ed.dom.remove(existing)
    } else if (html) {
      ed.insertContent(`<div class="psg-signature">${html}</div>`)
    }
  })
  emit('change', ed.getContent(), ed.getContent({ format: 'text' }))
}

function getSelectedContent() {
  return editor.value?.selection?.getContent({ format: 'html' }) || ''
}

function getSelectedText() {
  return editor.value?.selection?.getContent({ format: 'text' }) || ''
}

function replaceSelection(html) {
  if (!editor.value) return
  editor.value.undoManager.transact(() => editor.value.selection.setContent(html || ''))
  editor.value.fire('change')
}


function destroyEditor() {
  if (editor.value) {
    editor.value.destroy();
    editor.value = null;
  }
}
</script>

<style lang="scss" scoped>
.editor-box {
  height: 100%;
  width: 100%;
}

.loading {
  margin: auto;
}

.editor-box-loading {
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>

<!-- Unscoped: ui_mode: 'split' (see initEditor() above) renders TinyMCE's
     toolbar overflow drawer, dropdown menus (font/size/color/align/list/
     more-format) and dialogs into a single sink appended to <body>, outside
     this component's own DOM subtree — Vue's scoped `data-v-xxx` attribute
     only lands on elements this component actually renders, so a scoped
     `:deep()` selector can no longer reach into the sink. These rules apply
     globally instead; `.tox-*` classes are TinyMCE-only and don't collide
     with anything else in the app, and this component is the sole mount
     point for TinyMCE (Compose, Templates, Signature, Tools all share it),
     so there's nothing to isolate them from. -->
<style lang="scss">
.tox-tbtn.tox-tbtn--select.tox-tbtn--bespoke {
  width: auto !important;
  min-width: 80px !important;
  max-width: 160px !important;
}

.tox.tox-tinymce.tox-fullscreen {
  padding-right: 15px;
  padding-left: 15px;
  padding-bottom: 15px;
  background: var(--el-bg-color);
  @media (max-width: 767px) {
    padding-right: 10px;
    padding-left: 10px;
    padding-bottom: 10px;
  }
}

.tox-tinymce {
  border: none;
  border-radius: var(--editor-radius, var(--psg-radius-sm)) !important;
}

/* ui_mode: 'split' appends its floating-UI sink (toolbar overflow drawer,
   dropdown menus incl. moreformat/listformat/align, dialogs) to <body> as
   .tox-tinymce-aux. Oxide ships that at z-index: 1300, which sits *behind*
   Compose's own floating window (.send in write/index.vue, z-index: 2000)
   — without this override the "更多格式" menu would open invisibly, hidden
   under the Compose panel. */
.tox-tinymce-aux {
  z-index: 2100 !important;
}

/* Long font/emoji/table menus must scroll inside the popover instead of
   growing to the bottom of the viewport. Short menus remain content-sized. */
.tox-menu {
  max-height: min(300px, calc(100vh - 24px)) !important;
  overflow-y: auto !important;
  border-radius: var(--psg-radius-xs) !important;
}

.tox-dialog {
  border-radius: var(--psg-radius-xs) !important;
  overflow: hidden;
}

/* Horizontal safe area for the toolbar row: oxide's default relies on the
   first/last group's own 12px/11px edge padding to create this, but tighter
   inter-group spacing (below) would otherwise strip it from every group
   including the outer two — leaving the first control (font preset) flush
   against the editor's left edge with no breathing room. Give the row itself
   the safe area, then let inner groups pack tightly against each other. */
.tox-editor-header {
  padding-inline: 16px !important;

  @media (max-width: 767px) {
    padding-inline: 12px !important;
  }
}

.tox-toolbar__group {
  padding: 0 3px !important;
  margin: 0 !important;
}

.tox-toolbar__group:first-child {
  padding-left: 0 !important;
}

.tox-toolbar__group:last-child {
  padding-right: 0 !important;
}

.tox-tbtn {
  margin: 0 !important;
  border-radius: var(--editor-radius, var(--psg-radius-sm)) !important;
}

/* Preset (font family) and font-size selects were sized identically and a
   touch wide, crowding the first half of the toolbar. TinyMCE 6 stamps each
   toolbar control with data-mce-name matching its registered item name, so
   the two bespoke selects can be targeted and sized independently instead of
   sharing one generic width range. */
.tox-tbtn[data-mce-name="fontfamily"].tox-tbtn--select.tox-tbtn--bespoke {
  min-width: 88px !important;
  max-width: 100px !important;
}

.tox-tbtn[data-mce-name="fontsize"].tox-tbtn--select.tox-tbtn--bespoke {
  min-width: 86px !important;
  max-width: 96px !important;
}

/* Keep the named overflow affordance in the primary toolbar row. It is an
   icon-only control by design, so the native 48px button is wider than the
   visual affordance needs and is what previously pushed it onto a second
   line in the compose window. */
.tox-tbtn[data-mce-name="moreformat"] {
  width: 40px !important;
  min-width: 40px !important;
  padding-inline: 2px !important;
}

.tox .tox-edit-area::before {
  display: none;
}

/* Accent state, unscoped by theme: both oxide (light) and oxide-dark ship
   their own blue (#e6f0fd / #006ce7 / #599fef) for enabled/active/focused
   toolbar buttons and selected menu items — light mode never had a
   matching override, so clicking a toggle or opening the font/size select
   still flashed blue outside dark mode too. */
.tox-tbtn:active,
.tox-tbtn:focus,
.tox-tbtn--enabled,
.tox-tbtn--enabled:hover,
.tox-tbtn--enabled:focus,
.tox-tbtn--active,
.tox-tbtn--active:hover {
  background: var(--psg-primary-muted) !important;
  color: var(--psg-primary) !important;
}

.tox-tbtn:active svg,
.tox-tbtn:focus svg,
.tox-tbtn--enabled svg,
.tox-tbtn--enabled:hover svg,
.tox-tbtn--enabled:focus svg,
.tox-tbtn--active svg,
.tox-tbtn--active:hover svg {
  fill: var(--psg-primary) !important;
}

.tox-tbtn:focus::after,
.tox-tbtn--enabled:focus::after {
  box-shadow: 0 0 0 2px var(--psg-primary) inset !important;
}

.tox-tbtn--bespoke:focus {
  background: var(--psg-primary-muted) !important;
}

.tox-collection__item--enabled:not(.tox-collection__item--state-disabled) {
  background-color: var(--psg-primary-muted) !important;
  color: var(--psg-primary) !important;
  opacity: 1 !important;
}

.tox-dialog__body-nav-item--active {
  border-color: var(--psg-primary) !important;
  color: var(--psg-primary) !important;
}

.tox-insert-table-picker__selected {
  background-color: var(--psg-primary) !important;
  border-color: var(--psg-primary) !important;
}

/* TinyMCE modal dialogs (Source Code, Insert Link/Image/Table, Preview,
   emoji search) render into a sink appended to <body>, but nothing here
   ever restyled them — every dialog kept oxide's stock blue primary
   button, blue focus ring, and blue-tinted backdrop, in both light and
   dark mode. This is the "源代码" dialog from the bug report. */
.tox-dialog-wrap__backdrop {
  background-color: rgba(0, 0, 0, .58) !important;
}

.tox-dialog {
  background-color: var(--psg-surface) !important;
  border-color: var(--psg-border) !important;
  color: var(--psg-text) !important;
}

.tox-dialog__header {
  background-color: var(--psg-surface) !important;
  border-bottom-color: var(--psg-border) !important;
  color: var(--psg-text) !important;
}

.tox-dialog__title,
.tox-dialog__body-content,
.tox-label,
.tox-form__group {
  color: var(--psg-text) !important;
}

.tox-dialog__footer {
  background-color: var(--psg-surface) !important;
  border-top-color: var(--psg-border) !important;
}

.tox-dialog__body-nav-item {
  color: var(--psg-text-secondary) !important;
}

.tox-textarea,
.tox-textfield,
.tox-listbox,
.tox-selectfield select {
  background-color: var(--psg-canvas) !important;
  border-color: var(--psg-border) !important;
  color: var(--psg-text) !important;
}

/* The visible focus ring is drawn by the *-wrap element (:focus-within),
   not the inner control — oxide resets the control's own border to 0,
   so overriding only `.tox-textarea:focus` etc. is invisible in practice. */
.tox-textarea-wrap:focus-within,
.tox-custom-editor:focus-within,
.tox-focusable-wrapper:focus,
.tox-listboxfield .tox-listbox--select:focus,
.tox-textarea:focus,
.tox-textfield:focus,
.tox-toolbar-textfield:focus {
  border-color: var(--psg-primary) !important;
  background-color: var(--psg-canvas) !important;
  box-shadow: 0 0 0 2px var(--psg-primary-muted) !important;
}

/* Save */
.tox-dialog__footer .tox-button {
  background-color: var(--psg-primary) !important;
  border-color: var(--psg-primary) !important;
  color: var(--psg-on-primary) !important;
}

.tox-dialog__footer .tox-button:hover {
  background-color: var(--psg-primary-hover) !important;
  border-color: var(--psg-primary-hover) !important;
}

.tox-dialog__footer .tox-button:active {
  background-color: var(--psg-primary-active) !important;
  border-color: var(--psg-primary-active) !important;
}

/* Cancel — declared after the base .tox-button rule so it wins the
   specificity tie (both are a single class off .tox-dialog__footer). */
.tox-dialog__footer .tox-button--secondary {
  background-color: transparent !important;
  border-color: var(--psg-border) !important;
  color: var(--psg-text) !important;
}

.tox-dialog__footer .tox-button--secondary:hover {
  background-color: var(--psg-surface-active) !important;
  border-color: var(--psg-border) !important;
  color: var(--psg-text) !important;
}

/* Close (×) icon in the dialog header */
.tox-dialog__header .tox-button svg {
  fill: var(--psg-text-secondary) !important;
}

.tox-dialog__header .tox-button:hover svg {
  fill: var(--psg-text) !important;
}

/* Recolor TinyMCE's stock oxide-dark skin (near-black, generic greys)
   to match the app's actual dark palette instead of a mismatched dark.
   (Was `html.dark &` — the bare `&` was a scoped-SFC idiom that let this
   block apply this component's own scope attribute as a combinator
   alongside the html.dark selector; now that this block is global rather
   than scoped there's no scope attribute to combine with, so it's just a
   plain nested `html.dark { ... }`.) */
html.dark {
  .tox-tinymce,
  .tox-toolbar-overlord,
  .tox-toolbar__primary {
    border-color: var(--psg-border) !important;
    background-color: var(--psg-surface) !important;
    background-image: none !important;
  }

  .tox-tbtn {
    color: var(--psg-text-secondary) !important;
    background-color: transparent !important;
  }

  .tox-tbtn svg {
    fill: var(--psg-text-secondary) !important;
  }

  .tox-tbtn:hover {
    background: var(--psg-surface-active) !important;
    color: var(--psg-text) !important;
  }

  .tox-tbtn:hover svg {
    fill: var(--psg-text) !important;
  }

  /* Accent (active/enabled/focus/bespoke-focus) states are handled by the
     unscoped rules above — oxide-dark's own blue there is identical to
     oxide (light)'s, so one set of overrides covers both themes. */

  .tox-tbtn--disabled,
  .tox-tbtn--disabled:hover,
  .tox-tbtn:disabled,
  .tox-tbtn:disabled:hover {
    background: transparent !important;
    color: var(--psg-text-muted) !important;
  }

  .tox-tbtn--disabled svg,
  .tox-tbtn:disabled svg {
    fill: var(--psg-text-muted) !important;
  }

  .tox-toolbar__group {
    border-color: var(--psg-border) !important;
  }

  .tox-statusbar,
  .tox-edit-area__iframe {
    background-color: var(--psg-surface) !important;
  }

  /* Dropdown menus (font family/size, color, table grid, ...) — oxide-dark's
     stock list highlights (#006ce7 / #599fef / #2f4055) are the same
     off-brand blue as the toolbar states above. */
  .tox-menu {
    background-color: var(--psg-surface) !important;
    border-color: var(--psg-border) !important;
    box-shadow: var(--psg-shadow-md) !important;
  }

  .tox-collection__item {
    color: var(--psg-text) !important;
    background-color: transparent !important;
  }

  .tox-collection__item--active:not(.tox-collection__item--state-disabled) {
    background-color: var(--psg-surface-active) !important;
    color: var(--psg-text) !important;
  }

  /* --enabled (selected) state is handled by the unscoped rule above. */

  .tox-collection__item-checkmark svg,
  .tox-collection__item-icon svg {
    fill: currentColor !important;
  }

  .tox-collection__item-caption {
    color: var(--psg-text-secondary) !important;
  }
}



/* ══════════════════════════════════════════════════════════
   Mist toolbar — one soft grey bar with rounded 34px buttons, the
   Mist stroke icons (mist-icons.js), quiet chevrons, and the accent
   only for toggles that are on.
   ══════════════════════════════════════════════════════════ */
.tox .tox-editor-header {
  background: transparent !important;
  border: 0 !important;
  box-shadow: none !important;
  padding: 6px 12px !important;
}

.tox .tox-toolbar,
.tox .tox-toolbar__primary,
.tox .tox-toolbar-overlord {
  background: var(--psg-surface-muted) !important;
  border-radius: var(--psg-radius-md) !important;
}

.tox .tox-toolbar__primary { padding: 4px 6px !important; }

.tox .tox-toolbar__group {
  gap: 2px;
  padding: 0 4px !important;
  border: 0 !important;
}

.tox .tox-toolbar__group + .tox-toolbar__group {
  border-left: 1px solid var(--psg-border) !important;
}

.tox .tox-tbtn {
  height: 34px !important;
  min-width: 34px;
  border-radius: var(--psg-radius-sm) !important;
  color: var(--psg-text) !important;
  background: transparent !important;
}

.tox .tox-tbtn:hover {
  background: var(--psg-surface) !important;
}

.tox .tox-tbtn--enabled,
.tox .tox-tbtn--enabled:hover {
  background: var(--psg-surface) !important;
  color: var(--psg-primary) !important;
  box-shadow: var(--psg-shadow-xs);
}

.tox .tox-tbtn svg { fill: currentColor !important; }

/* Font + size selects read as small white pills. */
.tox .tox-tbtn--select.tox-tbtn--bespoke {
  background: var(--psg-surface) !important;
  padding-inline: 10px 6px !important;
  font-family: var(--psg-font-sans) !important;
  font-size: 13px !important;
  font-weight: 500 !important;
}

.tox .tox-tbtn__select-chevron svg,
.tox .tox-split-button__chevron svg {
  color: var(--psg-text-muted);
}

.tox .tox-split-button {
  border-radius: var(--psg-radius-sm) !important;
  border: 0 !important;
}

.tox .tox-split-button:hover {
  background: var(--psg-surface) !important;
  box-shadow: none !important;
}

.tox .tox-split-button__chevron { width: 18px !important; }

/* Menus opened from the toolbar. */
.tox .tox-menu {
  border: 0 !important;
  border-radius: var(--psg-radius-md) !important;
  box-shadow: var(--psg-shadow-md) !important;
  padding: 6px !important;
  background: var(--psg-surface) !important;
}

.tox .tox-collection__item {
  border-radius: var(--psg-radius-sm) !important;
  color: var(--psg-text) !important;
}

.tox .tox-collection__item-icon svg { fill: currentColor !important; }

/* Mist: the editor sits flat inside the compose card — no outer frame. */
.tox.tox-tinymce {
  border: 0 !important;
  border-radius: 0 !important;
  background: transparent !important;
}

.tox .tox-edit-area__iframe { background: var(--psg-surface) !important; }

.tox .tox-menu.tox-collection--list { min-width: 200px !important; }

.tox .tox-collection--list .tox-collection__item--active,
.tox .tox-collection--list .tox-collection__item--active:not(.tox-collection__item--state-disabled) {
  background: var(--psg-surface-muted) !important;
  color: var(--psg-text) !important;
}

.tox .tox-collection__item-label { white-space: nowrap; }
</style>
