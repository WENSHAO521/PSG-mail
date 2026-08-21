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
  getContent
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
  lightContent: {
    type: Boolean,
    default: false
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
    skin: `${uiStore.dark && !props.lightContent ? 'oxide-dark' : 'oxide'}`,
    content_css: `${tinyBase}/css/index.css,${uiStore.dark && !props.lightContent ? 'dark' : 'default'}`,
    content_style: `
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Roboto:wght@400;700&family=Open+Sans:wght@400;600&family=Lato:wght@400;700&family=Poppins:wght@400;600&family=Nunito:wght@400;600&family=Montserrat:wght@400;600&family=Source+Sans+3:wght@400;600&family=Raleway:wght@400;600&family=Ubuntu:wght@400;500&family=Merriweather:wght@400;700&family=Playfair+Display:wght@400;600&family=Lora:wght@400;600&family=EB+Garamond:wght@400;500&family=Noto+Serif:wght@400;700&family=Oswald:wght@400;600&family=Roboto+Mono:wght@400;500&family=Source+Code+Pro:wght@400;600&family=JetBrains+Mono:wght@400;500&family=Noto+Sans+SC:wght@400;700&family=Noto+Serif+SC:wght@400;700&family=ZCOOL+XiaoWei&family=Ma+Shan+Zheng&display=swap');
      :root {
        --scrollbar-track-color: ${uiStore.dark && !props.lightContent ? '#141414' : '#FFFFFF'};
        --scrollbar-thumb-color: ${uiStore.dark && !props.lightContent ? '#8D9095' : '#A8ABB2'};
      }
      ${props.lightContent ? 'body { background: #ffffff !important; color: #1a1a1a !important; }' : ''}
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
    toolbar_mode: 'scrolling',
    font_size_formats: '10px 11px 12px 14px 16px 18px 20px 24px 28px 32px 36px 48px',
    emoticons_search: false,
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

:deep(.tox-toolbar__group) {
  padding-left: 0 !important;
  margin: 0 !important;
}

:deep(.tox-tbtn) {
  margin: 0 !important;
}

:deep(.tox .tox-edit-area::before) {
  display: none;
}

</style>
