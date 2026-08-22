<template>
  <div class="editor-box" :class="showLoading ? 'editor-box-loading' : ''">
    <loading class="loading" v-if="showLoading"/>
    <textarea v-else style="outline: none" :id="editorId" ref="editorRef"></textarea>
  </div>
</template>

<script setup>
import {ref, onMounted, onBeforeUnmount, watch, nextTick, shallowRef, defineEmits, computed} from 'vue';
import loading from "@/components/loading/index.vue";
import {useI18n} from 'vue-i18n'
import {useUiStore} from '@/store/ui.js'
import {useSettingStore} from '@/store/setting.js'

defineExpose({
  clearEditor,
  focus,
  getContent,
  insertContent
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
  }
});


const {locale} = useI18n()
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

watch(() => [uiStore.dark, settingStore.lang], () => {
  destroyEditor();
  initEditor();
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

function initEditor() {
  window.tinymce.init({
    selector: `#${props.editorId}`,
    base_url: tinyBase,
    suffix: '.min',
    statusbar: false,
    height: props.height,
    auto_focus: true,
    //relative_urls: false,  //阻止 img标签域名和网站域名相同 自动把链接转换相对路径
    //remove_script_host: false, // 阻止删除 URL 中的域名
    forced_root_block: 'div',
    skin: `${uiStore.dark ? 'oxide-dark' : 'oxide'}`,
    content_css: `${tinyBase}/css/index.css,${uiStore.dark ? 'dark' : 'default'}`,
    content_style: `
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Roboto:wght@400;700&family=Open+Sans:wght@400;600&family=Lato:wght@400;700&family=Poppins:wght@400;600&family=Nunito:wght@400;600&family=Montserrat:wght@400;600&family=Source+Sans+3:wght@400;600&family=Raleway:wght@400;600&family=Ubuntu:wght@400;500&family=Merriweather:wght@400;700&family=Playfair+Display:wght@400;600&family=Lora:wght@400;600&family=EB+Garamond:wght@400;500&family=Noto+Serif:wght@400;700&family=Oswald:wght@400;600&family=Roboto+Mono:wght@400;500&family=Source+Code+Pro:wght@400;600&family=JetBrains+Mono:wght@400;500&family=Noto+Sans+SC:wght@400;700&family=Noto+Serif+SC:wght@400;700&family=ZCOOL+XiaoWei&family=Ma+Shan+Zheng&display=swap');
      :root {
        --scrollbar-track-color: ${uiStore.dark ? '#171B18' : '#FFFFFF'};
        --scrollbar-thumb-color: ${uiStore.dark ? '#2D332E' : '#A8ABB2'};
      }
      body { padding: 18px 24px !important; }
      ${uiStore.dark ? `
        body { background: #171B18 !important; color: #ECEFE9 !important; }
        a { color: #45B67D; }
        hr, blockquote { border-color: #2D332E !important; }
        code { background-color: #262C27; }
        figure figcaption { color: #A6AEA3; }
        .mce-content-body[data-mce-placeholder]:not(.mce-visualblocks)::before { color: #6F766D !important; }
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
    toolbar: props.toolbar ?? 'fontfamily fontsize | bold italic underline strikethrough | forecolor backcolor | alignleft aligncenter alignright alignjustify | outdent indent | bullist numlist | blockquote | link image emoticons | table code preview fullscreen',
    toolbar_mode: 'floating',
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
      ed.on('init', () => {
        ed.setContent(props.defValue);
        isInitialized.value = true;
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

:deep(.tox-tbtn.tox-tbtn--select.tox-tbtn--bespoke) {
  width: auto !important;
  min-width: 80px !important;
  max-width: 160px !important;
}

:deep(.tox.tox-tinymce.tox-fullscreen) {
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

:deep(.tox-tinymce) {
  border: none;
  border-radius: var(--psg-radius-sm);
}

/* Horizontal safe area for the toolbar row: oxide's default relies on the
   first/last group's own 12px/11px edge padding to create this, but tighter
   inter-group spacing (below) would otherwise strip it from every group
   including the outer two — leaving the first control (font preset) flush
   against the editor's left edge with no breathing room. Give the row itself
   the safe area, then let inner groups pack tightly against each other. */
:deep(.tox-editor-header) {
  padding-inline: 16px !important;

  @media (max-width: 767px) {
    padding-inline: 12px !important;
  }
}

:deep(.tox-toolbar__group) {
  padding: 0 6px !important;
  margin: 0 !important;
}

:deep(.tox-toolbar__group:first-child) {
  padding-left: 0 !important;
}

:deep(.tox-toolbar__group:last-child) {
  padding-right: 0 !important;
}

:deep(.tox-tbtn) {
  margin: 0 !important;
}

/* Preset (font family) and font-size selects were sized identically and a
   touch wide, crowding the first half of the toolbar. TinyMCE 6 stamps each
   toolbar control with data-mce-name matching its registered item name, so
   the two bespoke selects can be targeted and sized independently instead of
   sharing one generic width range. */
:deep(.tox-tbtn[data-mce-name="fontfamily"].tox-tbtn--select.tox-tbtn--bespoke) {
  min-width: 110px !important;
  max-width: 120px !important;
}

:deep(.tox-tbtn[data-mce-name="fontsize"].tox-tbtn--select.tox-tbtn--bespoke) {
  min-width: 86px !important;
  max-width: 96px !important;
}

:deep(.tox .tox-edit-area::before) {
  display: none;
}

/* Accent state, unscoped by theme: both oxide (light) and oxide-dark ship
   their own blue (#e6f0fd / #006ce7 / #599fef) for enabled/active/focused
   toolbar buttons and selected menu items — light mode never had a
   matching override, so clicking a toggle or opening the font/size select
   still flashed blue outside dark mode too. */
:deep(.tox-tbtn:active),
:deep(.tox-tbtn:focus),
:deep(.tox-tbtn--enabled),
:deep(.tox-tbtn--enabled:hover),
:deep(.tox-tbtn--enabled:focus),
:deep(.tox-tbtn--active),
:deep(.tox-tbtn--active:hover) {
  background: var(--psg-primary-muted) !important;
  color: var(--psg-primary) !important;
}

:deep(.tox-tbtn:active svg),
:deep(.tox-tbtn:focus svg),
:deep(.tox-tbtn--enabled svg),
:deep(.tox-tbtn--enabled:hover svg),
:deep(.tox-tbtn--enabled:focus svg),
:deep(.tox-tbtn--active svg),
:deep(.tox-tbtn--active:hover svg) {
  fill: var(--psg-primary) !important;
}

:deep(.tox-tbtn:focus::after),
:deep(.tox-tbtn--enabled:focus::after) {
  box-shadow: 0 0 0 2px var(--psg-primary) inset !important;
}

:deep(.tox-tbtn--bespoke:focus) {
  background: var(--psg-primary-muted) !important;
}

:deep(.tox-collection__item--enabled:not(.tox-collection__item--state-disabled)) {
  background-color: var(--psg-primary-muted) !important;
  color: var(--psg-primary) !important;
  opacity: 1 !important;
}

:deep(.tox-dialog__body-nav-item--active) {
  border-color: var(--psg-primary) !important;
  color: var(--psg-primary) !important;
}

:deep(.tox-insert-table-picker__selected) {
  background-color: var(--psg-primary) !important;
  border-color: var(--psg-primary) !important;
}

/* TinyMCE modal dialogs (Source Code, Insert Link/Image/Table, Preview,
   emoji search) render into a sink appended beside the editor root, but
   nothing here ever restyled them — every dialog kept oxide's stock blue
   primary button, blue focus ring, and blue-tinted backdrop, in both
   light and dark mode. This is the "源代码" dialog from the bug report. */
:deep(.tox-dialog-wrap__backdrop) {
  background-color: rgba(0, 0, 0, .58) !important;
}

:deep(.tox-dialog) {
  background-color: var(--psg-surface) !important;
  border-color: var(--psg-border) !important;
  color: var(--psg-text) !important;
}

:deep(.tox-dialog__header) {
  background-color: var(--psg-surface) !important;
  border-bottom-color: var(--psg-border) !important;
  color: var(--psg-text) !important;
}

:deep(.tox-dialog__title),
:deep(.tox-dialog__body-content),
:deep(.tox-label),
:deep(.tox-form__group) {
  color: var(--psg-text) !important;
}

:deep(.tox-dialog__footer) {
  background-color: var(--psg-surface) !important;
  border-top-color: var(--psg-border) !important;
}

:deep(.tox-dialog__body-nav-item) {
  color: var(--psg-text-secondary) !important;
}

:deep(.tox-textarea),
:deep(.tox-textfield),
:deep(.tox-listbox),
:deep(.tox-selectfield select) {
  background-color: var(--psg-canvas) !important;
  border-color: var(--psg-border) !important;
  color: var(--psg-text) !important;
}

/* The visible focus ring is drawn by the *-wrap element (:focus-within),
   not the inner control — oxide resets the control's own border to 0,
   so overriding only `.tox-textarea:focus` etc. is invisible in practice. */
:deep(.tox-textarea-wrap:focus-within),
:deep(.tox-custom-editor:focus-within),
:deep(.tox-focusable-wrapper:focus),
:deep(.tox-listboxfield .tox-listbox--select:focus),
:deep(.tox-textarea:focus),
:deep(.tox-textfield:focus),
:deep(.tox-toolbar-textfield:focus) {
  border-color: var(--psg-primary) !important;
  background-color: var(--psg-canvas) !important;
  box-shadow: 0 0 0 2px var(--psg-primary-muted) !important;
}

/* Save */
:deep(.tox-dialog__footer .tox-button) {
  background-color: var(--psg-primary) !important;
  border-color: var(--psg-primary) !important;
  color: var(--psg-on-primary) !important;
}

:deep(.tox-dialog__footer .tox-button:hover) {
  background-color: var(--psg-primary-hover) !important;
  border-color: var(--psg-primary-hover) !important;
}

:deep(.tox-dialog__footer .tox-button:active) {
  background-color: var(--psg-primary-active) !important;
  border-color: var(--psg-primary-active) !important;
}

/* Cancel — declared after the base .tox-button rule so it wins the
   specificity tie (both are a single class off .tox-dialog__footer). */
:deep(.tox-dialog__footer .tox-button--secondary) {
  background-color: transparent !important;
  border-color: var(--psg-border) !important;
  color: var(--psg-text) !important;
}

:deep(.tox-dialog__footer .tox-button--secondary:hover) {
  background-color: var(--psg-surface-active) !important;
  border-color: var(--psg-border) !important;
  color: var(--psg-text) !important;
}

/* Close (×) icon in the dialog header */
:deep(.tox-dialog__header .tox-button svg) {
  fill: var(--psg-text-secondary) !important;
}

:deep(.tox-dialog__header .tox-button:hover svg) {
  fill: var(--psg-text) !important;
}

/* Recolor TinyMCE's stock oxide-dark skin (near-black, generic greys)
   to match the app's actual dark palette instead of a mismatched dark. */
html.dark & {
  :deep(.tox-tinymce),
  :deep(.tox-toolbar-overlord),
  :deep(.tox-toolbar__primary) {
    border-color: var(--psg-border) !important;
    background-color: var(--psg-surface) !important;
    background-image: none !important;
  }

  :deep(.tox-tbtn) {
    color: var(--psg-text-secondary) !important;
  }

  :deep(.tox-tbtn svg) {
    fill: var(--psg-text-secondary) !important;
  }

  :deep(.tox-tbtn:hover) {
    background: var(--psg-surface-active) !important;
    color: var(--psg-text) !important;
  }

  :deep(.tox-tbtn:hover svg) {
    fill: var(--psg-text) !important;
  }

  /* Accent (active/enabled/focus/bespoke-focus) states are handled by the
     unscoped rules above — oxide-dark's own blue there is identical to
     oxide (light)'s, so one set of overrides covers both themes. */

  :deep(.tox-tbtn--disabled),
  :deep(.tox-tbtn--disabled:hover),
  :deep(.tox-tbtn:disabled),
  :deep(.tox-tbtn:disabled:hover) {
    background: transparent !important;
    color: var(--psg-text-muted) !important;
  }

  :deep(.tox-tbtn--disabled svg),
  :deep(.tox-tbtn:disabled svg) {
    fill: var(--psg-text-muted) !important;
  }

  :deep(.tox-toolbar__group) {
    border-color: var(--psg-border) !important;
  }

  :deep(.tox-statusbar),
  :deep(.tox-edit-area__iframe) {
    background-color: var(--psg-surface) !important;
  }

  /* Dropdown menus (font family/size, color, table grid, ...) — oxide-dark's
     stock list highlights (#006ce7 / #599fef / #2f4055) are the same
     off-brand blue as the toolbar states above. */
  :deep(.tox-menu) {
    background-color: var(--psg-surface) !important;
    border-color: var(--psg-border) !important;
    box-shadow: var(--psg-shadow-md) !important;
  }

  :deep(.tox-collection__item) {
    color: var(--psg-text) !important;
    background-color: transparent !important;
  }

  :deep(.tox-collection__item--active:not(.tox-collection__item--state-disabled)) {
    background-color: var(--psg-surface-active) !important;
    color: var(--psg-text) !important;
  }

  /* --enabled (selected) state is handled by the unscoped rule above. */

  :deep(.tox-collection__item-checkmark svg),
  :deep(.tox-collection__item-icon svg) {
    fill: currentColor !important;
  }

  :deep(.tox-collection__item-caption) {
    color: var(--psg-text-secondary) !important;
  }
}

</style>
