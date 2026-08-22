<template>

  <!-- ═══════════════════════════ LIST MODE ═══════════════════════════ -->
  <div class="page-outer" v-if="!editorMode">
    <div class="space-y">

      <!-- Page header -->
      <div class="page-header">
        <div>
          <h1 class="page-title">{{ $t('templates') }}</h1>
          <p class="page-subtitle">{{ $t('templatesDesc') }}</p>
          <p class="page-stats" v-if="tplList.length">
            {{ tplList.length }}&thinsp;{{ $t('templateUnit') }}
          </p>
        </div>
        <el-button type="primary" class="create-btn" @click="openAdd">
          <Icon icon="psg:add-circle" width="16" height="16"/>
          {{ $t('addTemplate') }}
        </el-button>
      </div>

      <!-- Toolbar: search + filter tabs -->
      <div class="header-actions" v-if="tplList.length">
        <div class="search">
          <el-input v-model="searchQuery" class="search-input" :placeholder="$t('searchTemplatesPlaceholder')">
            <template #prefix><Icon icon="psg:search" width="14" height="14"/></template>
          </el-input>
        </div>
        <div class="filter-tabs" v-if="allCategories.length || tplFavs.size">
          <button
            class="filter-tab"
            :class="{ active: activeCategory === '__all__' }"
            @click="activeCategory = '__all__'"
          >
            {{ $t('all') }}
            <span class="filter-count">{{ tplList.length }}</span>
          </button>
          <button
            v-if="tplFavs.size"
            class="filter-tab"
            :class="{ active: activeCategory === '__fav__' }"
            @click="activeCategory = '__fav__'"
          >
            <Icon icon="psg:star" width="11" height="11"/>
            {{ $t('favorites') }}
            <span class="filter-count">{{ tplFavs.size }}</span>
          </button>
          <button
            v-for="cat in allCategories" :key="cat"
            class="filter-tab"
            :class="{ active: activeCategory === cat }"
            @click="activeCategory = cat"
          >
            {{ cat }}
            <span class="filter-count">{{ categoryCount[cat] || 0 }}</span>
          </button>
          <button
            v-if="categoryCount[''] > 0"
            class="filter-tab"
            :class="{ active: activeCategory === '__none__' }"
            @click="activeCategory = '__none__'"
          >
            {{ $t('uncategorized') }}
            <span class="filter-count">{{ categoryCount[''] }}</span>
          </button>
        </div>
      </div>

      <!-- Empty states -->
      <div v-if="!tplList.length" class="empty-state">
        <Icon icon="psg:template" width="30" height="30" class="empty-icon"/>
        <div class="empty-title">{{ $t('noTemplates') }}</div>
        <div class="empty-desc">{{ $t('noTemplatesDesc') }}</div>
        <el-button type="primary" class="empty-btn" @click="openAdd">
          <Icon icon="psg:add-circle" width="14" height="14"/>
          {{ $t('addTemplate') }}
        </el-button>
      </div>

      <div v-else-if="!filteredList.length" class="empty-state">
        <Icon icon="psg:file-search" width="30" height="30" class="empty-icon"/>
        <div class="empty-title">{{ $t('noMatchingTemplates') }}</div>
        <div class="empty-desc">{{ $t('noMatchingTemplatesDesc') }}</div>
      </div>

      <!-- Card grid -->
      <div v-else class="tpl-grid">
        <div class="tpl-card" v-for="tpl in filteredList" :key="tpl.templateId">
          <div class="tpl-card-head">
            <div class="tpl-name" :title="tpl.name">{{ tpl.name }}</div>
            <button
              class="fav-btn" :class="{ active: isFav(tpl.templateId) }"
              :title="isFav(tpl.templateId) ? $t('removeFavorite') : $t('addFavorite')"
              @click="toggleFav(tpl.templateId)"
            >
              <Icon icon="psg:star" width="15" height="15"/>
            </button>
          </div>

          <span class="tpl-cat" v-if="tplCats[tpl.templateId]">{{ tplCats[tpl.templateId] }}</span>

          <div class="tpl-subject" v-if="tpl.subject">
            <span class="tpl-field-lbl">{{ $t('templateSubject') }}</span>
            <span class="tpl-subject-text">{{ tpl.subject }}</span>
          </div>
          <div class="tpl-subject placeholder" v-else>
            <span class="tpl-subject-text">{{ $t('noSubject') }}</span>
          </div>

          <div class="tpl-preview" v-if="plainText(tpl.content)">{{ plainText(tpl.content) }}</div>

          <div class="tpl-footer">
            <button class="tpl-preview-btn" @click="openPreview(tpl)">
              <Icon icon="psg:eye" width="13" height="13"/>
              {{ $t('previewTemplate') }}
            </button>
            <el-dropdown trigger="click" @command="cmd => handleCommand(cmd, tpl)">
              <button class="more-btn" @click.stop>
                <Icon icon="psg:settings" width="16" height="16"/>
              </button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="edit">{{ $t('change') }}</el-dropdown-item>
                  <el-dropdown-item command="preview">{{ $t('previewTemplate') }}</el-dropdown-item>
                  <el-dropdown-item command="duplicate">{{ $t('duplicateTemplate') }}</el-dropdown-item>
                  <el-dropdown-item command="fav">
                    {{ isFav(tpl.templateId) ? $t('removeFavorite') : $t('addFavorite') }}
                  </el-dropdown-item>
                  <el-dropdown-item command="delete" divided class="danger-item">{{ $t('delete') }}</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </div>
      </div>

    </div>

    <!-- Preview dialog -->
    <el-dialog v-model="previewShow" :title="$t('previewTemplate')" class="tpl-preview-dialog">
      <div class="preview-body" v-if="previewTpl">
        <div class="preview-name">{{ previewTpl.name }}</div>

        <div class="preview-field" v-if="previewTpl.subject">
          <label class="preview-label">{{ $t('templateSubject') }}</label>
          <div class="preview-subject">{{ previewTpl.subject }}</div>
        </div>

        <div class="preview-divider"></div>

        <div class="preview-html">
          <shadowHtml :html="previewTpl.content || ''"/>
        </div>
      </div>
      <template #footer>
        <div class="preview-footer">
          <el-button @click="editFromPreview">{{ $t('change') }}</el-button>
          <el-button type="primary" @click="useTemplate(previewTpl)">{{ $t('useTemplate') }}</el-button>
        </div>
      </template>
    </el-dialog>
  </div>

  <!-- ═══════════════════════════ EDITOR MODE ═══════════════════════════ -->
  <div class="page-outer editor-mode" v-else>
    <div class="editor-nav">
      <button class="back-btn" @click="cancelEdit">
        <Icon icon="psg:chevron-left" width="14" height="14"/>
        {{ $t('templates') }}
      </button>
      <div class="editor-crumb">
        {{ tplForm.templateId ? $t('editTemplate') : $t('addTemplate') }}
      </div>
      <el-button type="primary" class="save-btn" :loading="tplLoading" @click="saveTpl">
        {{ $t('save') }}
      </el-button>
    </div>

    <div class="page-grid editor-grid">
      <div class="editor-fields">
        <div class="field-row">
          <div class="field-block field-grow">
            <label class="field-label">{{ $t('templateName') }}</label>
            <el-input v-model="tplForm.name" :placeholder="$t('templateName')" size="large"/>
          </div>
          <div class="field-block field-cat">
            <label class="field-label">{{ $t('category') }}</label>
            <el-select
              v-model="tplForm.category"
              :placeholder="$t('categoryPlaceholder')"
              filterable
              allow-create
              clearable
              size="large"
              class="cat-select"
            >
              <el-option v-for="cat in allCategories" :key="cat" :label="cat" :value="cat"/>
            </el-select>
          </div>
        </div>
        <div class="field-block">
          <label class="field-label">{{ $t('templateSubject') }}</label>
          <el-input v-model="tplForm.subject" :placeholder="$t('subjectInputDesc')" size="large"/>
        </div>
        <div class="field-block">
          <div class="field-head">
            <label class="field-label">{{ $t('message') }}</label>
            <el-dropdown trigger="click" @command="insertVariable">
              <button class="var-btn" @click.stop>
                <Icon icon="psg:tag" width="12" height="12"/>
                {{ $t('insertVariable') }}
              </button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item v-for="v in TEMPLATE_VARIABLES" :key="v" :command="v">
                    {{ variableLabel(v) }}
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
          <div class="editor-frame">
            <tinyEditor ref="tplEditorRef" :def-value="tplForm.content" editor-id="tpl-editor"
              toolbar="bold italic underline | forecolor backcolor | bullist numlist | link | code"
              height="100%" @change="(html) => tplForm.content = html"/>
          </div>
        </div>
      </div>
    </div>
  </div>

</template>

<script setup>
import { reactive, ref, computed, onMounted, defineOptions } from 'vue'
import { useI18n } from 'vue-i18n'
import { Icon } from '@iconify/vue'
import tinyEditor from '@/components/tiny-editor/index.vue'
import shadowHtml from '@/components/shadow-html/index.vue'
import { useUiStore } from '@/store/ui.js'
import { templateList, templateAdd, templateUpdate, templateDelete } from '@/request/template.js'

defineOptions({ name: 'templates' })

const { t } = useI18n()
const uiStore = useUiStore()
const tplList = ref([])
const tplLoading = ref(false)
const tplEditorRef = ref(null)
const editorMode = ref(false)
const searchQuery = ref('')
const tplForm = reactive({ templateId: null, name: '', subject: '', content: '', category: '' })

const TEMPLATE_VARIABLES = [
  'recipient_name', 'author_name', 'manuscript_title',
  'journal_name', 'submission_id', 'editor_name', 'date'
]

// ── Category system (persisted in localStorage — the template model has
// no server-side category field) ─────────────────────────────────────
const CATS_KEY = 'psg-tpl-cats'
const tplCats = ref(JSON.parse(localStorage.getItem(CATS_KEY) || '{}'))
const activeCategory = ref('__all__')

function saveCats() {
  localStorage.setItem(CATS_KEY, JSON.stringify(tplCats.value))
}

// ── Favorites (persisted in localStorage, same pattern as categories) ──
const FAVS_KEY = 'psg-tpl-favs'
const tplFavs = ref(new Set(JSON.parse(localStorage.getItem(FAVS_KEY) || '[]')))

function saveFavs() {
  localStorage.setItem(FAVS_KEY, JSON.stringify([...tplFavs.value]))
}
function isFav(id) { return tplFavs.value.has(id) }
function toggleFav(id) {
  if (tplFavs.value.has(id)) tplFavs.value.delete(id)
  else tplFavs.value.add(id)
  tplFavs.value = new Set(tplFavs.value)
  saveFavs()
}

const allCategories = computed(() =>
  [...new Set(Object.values(tplCats.value).filter(Boolean))].sort()
)

const categoryCount = computed(() => {
  const counts = { '': 0 }
  tplList.value.forEach(t => {
    const cat = tplCats.value[t.templateId] || ''
    counts[cat] = (counts[cat] || 0) + 1
  })
  return counts
})

function plainText(html) {
  if (!html) return ''
  const div = document.createElement('div')
  div.innerHTML = html
  return (div.textContent || div.innerText || '').replace(/\s+/g, ' ').trim()
}

const filteredList = computed(() => {
  let list = tplList.value
  if (activeCategory.value === '__fav__') list = list.filter(t => tplFavs.value.has(t.templateId))
  else if (activeCategory.value === '__none__') list = list.filter(t => !tplCats.value[t.templateId])
  else if (activeCategory.value !== '__all__') list = list.filter(t => tplCats.value[t.templateId] === activeCategory.value)

  const q = searchQuery.value.trim().toLowerCase()
  if (q) {
    list = list.filter(t =>
      (t.name || '').toLowerCase().includes(q) ||
      (t.subject || '').toLowerCase().includes(q) ||
      plainText(t.content).toLowerCase().includes(q)
    )
  }
  return list
})
// ────────────────────────────────────────────────────────────────

onMounted(() => {
  templateList().then(list => tplList.value = list).catch(() => {})
})

function openAdd() {
  Object.assign(tplForm, { templateId: null, name: '', subject: '', content: '', category: '' })
  editorMode.value = true
}
function openEdit(tpl) {
  Object.assign(tplForm, {
    templateId: tpl.templateId, name: tpl.name, subject: tpl.subject, content: tpl.content,
    category: tplCats.value[tpl.templateId] || ''
  })
  editorMode.value = true
}
function cancelEdit() { editorMode.value = false }

function variableLabel(v) {
  return `{{${v}}}`
}

function insertVariable(v) {
  tplEditorRef.value?.insertContent?.(variableLabel(v))
}

async function saveTpl() {
  if (!tplForm.name.trim()) {
    ElMessage({ message: t('emptyUserNameMsg'), type: 'error', plain: true })
    return
  }
  tplLoading.value = true
  try {
    const html = tplEditorRef.value?.getContent?.() ?? tplForm.content
    if (tplForm.templateId) {
      await templateUpdate(tplForm.templateId, tplForm.name, tplForm.subject, html)
      const idx = tplList.value.findIndex(t => t.templateId === tplForm.templateId)
      if (idx > -1) tplList.value[idx] = { ...tplList.value[idx], name: tplForm.name, subject: tplForm.subject, content: html }
      // Save category
      if (tplForm.category.trim()) tplCats.value[tplForm.templateId] = tplForm.category.trim()
      else delete tplCats.value[tplForm.templateId]
      saveCats()
    } else {
      const newTpl = await templateAdd(tplForm.name, tplForm.subject, html)
      tplList.value.unshift(newTpl)
      // Save category for new template
      if (tplForm.category.trim()) { tplCats.value[newTpl.templateId] = tplForm.category.trim(); saveCats() }
    }
    editorMode.value = false
    ElMessage({ message: t('templateSaved'), type: 'success', plain: true })
  } finally { tplLoading.value = false }
}

function deleteTpl(tpl) {
  ElMessageBox.confirm(t('delConfirm', { msg: tpl.name }), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(async () => {
    try {
      await templateDelete(tpl.templateId)
      tplList.value = tplList.value.filter(t => t.templateId !== tpl.templateId)
      delete tplCats.value[tpl.templateId]
      saveCats()
      tplFavs.value.delete(tpl.templateId)
      saveFavs()
      ElMessage({ message: t('templateDeleted'), type: 'success', plain: true })
    } catch {}
  })
}

async function duplicateTpl(tpl) {
  try {
    const copy = await templateAdd(tpl.name + t('duplicateSuffix'), tpl.subject, tpl.content)
    tplList.value.unshift(copy)
    const cat = tplCats.value[tpl.templateId]
    if (cat) { tplCats.value[copy.templateId] = cat; saveCats() }
    ElMessage({ message: t('templateDuplicated'), type: 'success', plain: true })
  } catch {}
}

function handleCommand(cmd, tpl) {
  if (cmd === 'edit') openEdit(tpl)
  else if (cmd === 'preview') openPreview(tpl)
  else if (cmd === 'duplicate') duplicateTpl(tpl)
  else if (cmd === 'fav') toggleFav(tpl.templateId)
  else if (cmd === 'delete') deleteTpl(tpl)
}

// ── Preview dialog ──
const previewShow = ref(false)
const previewTpl = ref(null)

function openPreview(tpl) {
  previewTpl.value = tpl
  previewShow.value = true
}
function editFromPreview() {
  previewShow.value = false
  if (previewTpl.value) openEdit(previewTpl.value)
}
function useTemplate(tpl) {
  if (!tpl) return
  previewShow.value = false
  uiStore.writerRef?.openWithTemplate?.(tpl)
}
</script>

<style lang="scss" scoped>
/* ── Outer shell ── */
.page-outer {
  max-width: 1240px;
  margin: 0 auto;
  padding: 28px 32px 56px;

  @media (max-width: 960px)  { padding: 20px 24px 40px; }
  @media (max-width: 640px)  { padding: 16px 16px 32px; }
}

.space-y {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.editor-mode { display: flex; flex-direction: column; gap: 0; }

.page-grid { display: grid; grid-template-columns: 1fr; gap: 20px; }
.editor-grid { margin-top: 0; }

/* ── Page header ── */
.page-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--psg-border);
  flex-wrap: wrap;
}

.page-title {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  color: var(--psg-text);
}

.page-subtitle {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--psg-text-secondary);
}

.page-stats {
  margin: 8px 0 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--psg-text-secondary);
  font-variant-numeric: tabular-nums;
}

.create-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

/* ── Toolbar ── */
.header-actions {
  padding: 8px 12px;
  min-height: 44px;
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  align-items: center;
  background: var(--psg-surface);
  border-radius: var(--psg-radius-md);
  border: 1px solid var(--psg-border);

  :deep(.el-input__wrapper) {
    height: 30px;
    box-shadow: none !important;
    border: 1px solid var(--psg-border);
    border-radius: var(--psg-radius-sm);
    transition: border-color 0.12s;
    &:hover { border-color: var(--psg-border-strong); }
  }
  :deep(.el-input__wrapper.is-focus) {
    border-color: var(--psg-primary) !important;
  }

  .search-input {
    width: min(260px, calc(100vw - 200px));
    flex-shrink: 0;
  }
}

.filter-tabs {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-wrap: wrap;
}

.filter-tab {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 10px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--psg-radius-sm);
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  color: var(--psg-text-secondary);
  font-family: inherit;
  transition: background 0.12s, border-color 0.12s, color 0.12s;
  white-space: nowrap;

  &:hover { background: var(--psg-surface-muted); border-color: var(--psg-border); }

  &.active {
    background: var(--psg-surface-muted);
    border-color: var(--psg-surface-active);
    color: var(--psg-primary);
  }
}

.filter-count {
  font-size: 10px;
  font-weight: 700;
  background: var(--psg-surface-muted);
  border: 1px solid var(--psg-border);
  padding: 0 4px;
  min-width: 16px;
  height: 16px;
  line-height: 14px;
  text-align: center;
  color: var(--psg-text-secondary);

  .filter-tab.active & {
    background: var(--psg-surface-active);
    border-color: var(--psg-surface-active);
    color: var(--psg-primary);
  }
}

/* Empty state */
.empty-state {
  display: flex; flex-direction: column;
  align-items: flex-start; gap: 6px;
  padding: 40px 24px;
  background: var(--psg-surface);
  border: 1px solid var(--psg-border);
  border-radius: var(--psg-radius-md);
  max-width: 480px;
  margin: 8px auto 0;
  text-align: left;
}
.empty-icon { color: var(--psg-text-secondary); opacity: 0.4; }
.empty-title { font-size: 14.5px; font-weight: 700; color: var(--psg-text); }
.empty-desc  { font-size: 12.5px; color: var(--psg-text-secondary); line-height: 1.5; }
.empty-btn { margin-top: 10px; }

/* ── Card grid ── */
.tpl-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
}

.tpl-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: var(--psg-surface);
  border: 1px solid var(--psg-border);
  border-radius: var(--psg-radius-md);
  padding: 16px;
  transition: border-color 0.16s ease;

  @media (hover: hover) {
    &:hover { border-color: var(--psg-border-strong); }
  }
}

.tpl-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.tpl-name {
  font-size: 14px; font-weight: 700;
  color: var(--psg-text);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  min-width: 0;
}

.fav-btn {
  display: flex; align-items: center; justify-content: center;
  width: 26px; height: 26px; flex-shrink: 0;
  border: none; background: transparent;
  border-radius: var(--psg-radius-sm); cursor: pointer;
  color: var(--psg-text-muted);
  transition: background 0.10s, color 0.10s;

  &:hover { background: var(--psg-surface-muted); color: var(--psg-text-secondary); }
  &.active { color: var(--psg-primary); }
  &.active :deep(svg) { fill: var(--psg-primary); }
}

.tpl-cat {
  align-self: flex-start;
  font-size: 10.5px; font-weight: 700;
  color: var(--psg-primary);
  background: var(--psg-surface-muted);
  border: 1px solid var(--psg-surface-active);
  padding: 1px 7px;
  white-space: nowrap;
}

.tpl-subject {
  display: flex;
  flex-direction: column;
  gap: 2px;
  &.placeholder .tpl-subject-text { font-style: italic; color: var(--psg-text-muted); }
}

.tpl-field-lbl {
  font-size: 9.5px; font-weight: 800;
  text-transform: uppercase; letter-spacing: 0.08em;
  color: var(--psg-text-muted);
}

.tpl-subject-text {
  font-size: 12.5px; font-weight: 600;
  color: var(--psg-text);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

.tpl-preview {
  font-size: 12px; line-height: 1.5;
  color: var(--psg-text-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.tpl-footer {
  display: flex; align-items: center; justify-content: space-between;
  margin-top: 4px;
  padding-top: 10px;
  border-top: 1px solid var(--psg-border);
}

.tpl-preview-btn {
  display: inline-flex; align-items: center; gap: 5px;
  background: transparent; border: none; cursor: pointer;
  font-size: 12px; font-weight: 700;
  color: var(--psg-text-secondary); padding: 4px 0;
  font-family: inherit;
  transition: color 0.12s;
  &:hover { color: var(--psg-primary); }
}

.more-btn {
  display: flex; align-items: center; justify-content: center;
  width: 28px; height: 28px;
  border: none; background: transparent;
  border-radius: var(--psg-radius-sm); cursor: pointer;
  color: var(--psg-text-secondary);
  transition: background 0.10s, color 0.10s;
  &:hover { background: var(--psg-surface-muted); color: var(--psg-text); }
}

:deep(.danger-item) { color: var(--psg-danger) !important; }

/* ── Preview dialog ── */
:deep(.tpl-preview-dialog.el-dialog) {
  width: 560px !important;
  @media (max-width: 620px) {
    width: calc(100% - 32px) !important;
    margin-right: 16px !important;
    margin-left: 16px !important;
  }
}

.preview-name { font-size: 16px; font-weight: 700; color: var(--psg-text); margin-bottom: 14px; }

.preview-field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; }

.preview-label {
  font-size: 10px; font-weight: 900;
  text-transform: uppercase; letter-spacing: 0.10em;
  color: var(--psg-text-secondary);
}

.preview-subject { font-size: 13.5px; font-weight: 600; color: var(--psg-text); }

.preview-divider { height: 1px; background: var(--psg-border); margin: 14px 0; }

.preview-html {
  height: 260px;
  overflow: auto;
  border: 1px solid var(--psg-border);
  border-radius: var(--psg-radius-sm);
  padding: 14px 16px;
  background: var(--psg-canvas);
}

.preview-footer { display: flex; justify-content: flex-end; gap: 8px; }

/* ── Editor mode ── */
.editor-nav {
  display: flex; align-items: center; gap: 16px;
  padding-bottom: 20px;
  border-bottom: 1px solid var(--psg-border);
  margin-bottom: 24px;
}

.back-btn {
  display: flex; align-items: center; gap: 5px;
  background: transparent; border: none; cursor: pointer;
  font-size: 12.5px; font-weight: 700;
  color: var(--psg-text-secondary); padding: 0;
  transition: color 0.12s; white-space: nowrap; font-family: inherit;
  &:hover { color: var(--psg-text); }
}

.editor-crumb {
  flex: 1; font-size: 14px; font-weight: 700; color: var(--psg-text);
}

.save-btn { border-radius: var(--psg-radius-sm) !important; font-weight: 700 !important; }

.editor-fields { display: flex; flex-direction: column; gap: 16px; max-width: 900px; }

/* Name + Category side by side */
.field-row {
  display: flex;
  gap: 12px;
  align-items: flex-end;

  @media (max-width: 560px) { flex-direction: column; }
}

.field-grow { flex: 1; min-width: 0; }

.field-cat { width: 200px; flex-shrink: 0; @media (max-width: 560px) { width: 100%; } }

.field-block { display: flex; flex-direction: column; gap: 7px; }

.field-head {
  display: flex; align-items: center; justify-content: space-between;
}

.field-label {
  font-size: 10px; font-weight: 900;
  text-transform: uppercase; letter-spacing: 0.10em;
  color: var(--psg-text-secondary);
}

.var-btn {
  display: flex; align-items: center; gap: 4px;
  background: transparent;
  border: 1px solid var(--psg-border);
  border-radius: var(--psg-radius-sm); cursor: pointer;
  font-size: 11.5px; font-weight: 700;
  color: var(--psg-text-secondary); padding: 4px 10px;
  transition: border-color 0.12s, color 0.12s; font-family: inherit;
  &:hover { border-color: var(--psg-border-strong); color: var(--psg-text); }
}

.cat-select {
  width: 100%;
  :deep(.el-select__wrapper) { border-radius: var(--psg-radius-sm) !important; }
}

.editor-frame {
  height: 320px;
  border: 1px solid var(--psg-border);
  border-radius: var(--psg-radius-sm); overflow: hidden;
}
</style>
