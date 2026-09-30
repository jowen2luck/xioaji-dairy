<template>
  <n-drawer
    v-model:show="visible"
    :width="620"
    placement="right"
    :trap-focus="false"
    :block-scroll="false"
    class="journal-editor-drawer"
  >
    <n-drawer-content :title="isEditMode ? '编辑日记' : '记一笔日记'" closable>
      <div class="editor-drawer-container">
        <!-- 顶部次要元信息栏：项目、时长、时间紧凑横向排布 -->
        <div class="metadata-strip">
          <div class="meta-row">
            <!-- 所属项目 -->
            <div class="meta-item project-item">
              <span class="meta-label">所属分类</span>
              <n-auto-complete
                v-model:value="form.shanggexiangmu"
                :options="projectOptions"
                placeholder="日常、工作、科研..."
                size="small"
                clearable
                class="meta-input"
              />
            </div>

            <!-- 持续时长 -->
            <div class="meta-item duration-item">
              <span class="meta-label">持续时长</span>
              <n-input
                v-model:value="form.chixushijian"
                placeholder="如 30m, 1h"
                size="small"
                clearable
                class="meta-input duration-input"
              />
            </div>

            <!-- 记录时间 -->
            <div class="meta-item time-item">
              <span class="meta-label">记录时间</span>
              <n-date-picker
                v-model:value="form.timestamp"
                type="datetime"
                size="small"
                clearable
                class="meta-input time-picker"
                placeholder="选择时间"
              />
            </div>
          </div>

          <!-- 快速时长推荐标签 -->
          <div class="quick-duration-tags">
            <span class="quick-label">快捷时长:</span>
            <n-tag
              v-for="dur in quickDurations"
              :key="dur"
              size="tiny"
              round
              :checkable="true"
              :checked="form.chixushijian === dur"
              class="quick-tag"
              @click="setDuration(dur)"
            >
              {{ dur }}
            </n-tag>
          </div>
        </div>

        <!-- 主体：大幅富文本编辑核心区 -->
        <div class="editor-main-area">
          <!-- 工具栏 -->
          <div class="rich-toolbar">
            <div class="toolbar-group">
              <n-tooltip trigger="hover">
                <template #trigger>
                  <button
                    type="button"
                    class="tool-btn font-bold"
                    @mousedown.prevent="execCmd('bold')"
                  >
                    B
                  </button>
                </template>
                加粗 (Ctrl+B)
              </n-tooltip>

              <n-tooltip trigger="hover">
                <template #trigger>
                  <button
                    type="button"
                    class="tool-btn font-italic"
                    @mousedown.prevent="execCmd('italic')"
                  >
                    I
                  </button>
                </template>
                斜体 (Ctrl+I)
              </n-tooltip>

              <n-tooltip trigger="hover">
                <template #trigger>
                  <button
                    type="button"
                    class="tool-btn font-underline"
                    @mousedown.prevent="execCmd('underline')"
                  >
                    U
                  </button>
                </template>
                下划线 (Ctrl+U)
              </n-tooltip>

              <n-tooltip trigger="hover">
                <template #trigger>
                  <button
                    type="button"
                    class="tool-btn font-strike"
                    @mousedown.prevent="execCmd('strikeThrough')"
                  >
                    S
                  </button>
                </template>
                删除线
              </n-tooltip>
            </div>

            <div class="toolbar-divider" />

            <div class="toolbar-group">
              <n-tooltip trigger="hover">
                <template #trigger>
                  <button
                    type="button"
                    class="tool-btn"
                    @mousedown.prevent="execFormatBlock('h3')"
                  >
                    H3
                  </button>
                </template>
                小标题
              </n-tooltip>

              <n-tooltip trigger="hover">
                <template #trigger>
                  <button
                    type="button"
                    class="tool-btn"
                    @mousedown.prevent="execFormatBlock('p')"
                  >
                    正文
                  </button>
                </template>
                段落正文
              </n-tooltip>

              <n-tooltip trigger="hover">
                <template #trigger>
                  <button
                    type="button"
                    class="tool-btn"
                    @mousedown.prevent="execFormatBlock('blockquote')"
                  >
                    ❝
                  </button>
                </template>
                引用块
              </n-tooltip>
            </div>

            <div class="toolbar-divider" />

            <div class="toolbar-group">
              <n-tooltip trigger="hover">
                <template #trigger>
                  <button
                    type="button"
                    class="tool-btn"
                    @mousedown.prevent="execCmd('insertUnorderedList')"
                  >
                    • 列表
                  </button>
                </template>
                无序列表
              </n-tooltip>

              <n-tooltip trigger="hover">
                <template #trigger>
                  <button
                    type="button"
                    class="tool-btn"
                    @mousedown.prevent="execCmd('insertOrderedList')"
                  >
                    1. 列表
                  </button>
                </template>
                有序列表
              </n-tooltip>
            </div>

            <div class="toolbar-divider" />

            <div class="toolbar-group">
              <n-tooltip trigger="hover">
                <template #trigger>
                  <button
                    type="button"
                    class="tool-btn"
                    @mousedown.prevent="openLinkDialog"
                  >
                    🔗 链接
                  </button>
                </template>
                插入超链接
              </n-tooltip>

              <n-tooltip trigger="hover">
                <template #trigger>
                  <button
                    type="button"
                    class="tool-btn"
                    @mousedown.prevent="execCmd('removeFormat')"
                  >
                    🧹
                  </button>
                </template>
                清除格式
              </n-tooltip>

              <n-tooltip trigger="hover">
                <template #trigger>
                  <button
                    type="button"
                    class="tool-btn"
                    @mousedown.prevent="execCmd('undo')"
                  >
                    ↩
                  </button>
                </template>
                撤销
              </n-tooltip>

              <n-tooltip trigger="hover">
                <template #trigger>
                  <button
                    type="button"
                    class="tool-btn"
                    @mousedown.prevent="execCmd('redo')"
                  >
                    ↪
                  </button>
                </template>
                重做
              </n-tooltip>
            </div>

            <div class="toolbar-spacer" />

            <!-- 右侧：模式切换与字数统计 -->
            <div class="toolbar-group right-group">
              <span class="word-counter">字数: {{ wordCount }}</span>
              <n-tooltip trigger="hover">
                <template #trigger>
                  <button
                    type="button"
                    class="tool-btn code-mode-btn"
                    :class="{ active: isSourceMode }"
                    @click="toggleSourceMode"
                  >
                    &lt;/&gt;
                  </button>
                </template>
                {{ isSourceMode ? '返回可视化排版' : '查看/编辑 HTML 源码' }}
              </n-tooltip>
            </div>
          </div>

          <!-- 富文本内容可视编辑区 -->
          <div
            v-show="!isSourceMode"
            ref="editorRef"
            class="rich-editor-content"
            contenteditable="true"
            spellcheck="false"
            data-placeholder="记录下刚才发生的事件、思维灵感或身心感受..."
            @input="handleEditorInput"
            @blur="handleEditorInput"
          />

          <!-- HTML 源码编辑模式 -->
          <textarea
            v-show="isSourceMode"
            v-model="rawHtmlContent"
            class="source-editor-textarea"
            placeholder="<p>输入 HTML 格式内容...</p>"
            spellcheck="false"
            @input="handleSourceInput"
          />
        </div>
      </div>

      <!-- 插入超链接弹窗 -->
      <n-modal
        v-model:show="showLinkModal"
        preset="dialog"
        title="插入超链接"
        positive-text="确认插入"
        negative-text="取消"
        @positive-click="handleConfirmLink"
      >
        <div style="margin-top: 12px">
          <n-form label-placement="top" size="small">
            <n-form-item label="链接地址 (URL)">
              <n-input
                v-model:value="linkForm.url"
                placeholder="https://... 或内部路径"
                clearable
              />
            </n-form-item>
            <n-form-item label="链接文本 (可选)">
              <n-input
                v-model:value="linkForm.text"
                placeholder="如选中文本则默认采用选中文本"
                clearable
              />
            </n-form-item>
          </n-form>
        </div>
      </n-modal>

      <template #footer>
        <div class="drawer-footer">
          <div class="footer-left-info">
            <span class="format-indicator">
              {{ isSourceMode ? 'HTML 源码模式' : '富文本模式 (标准 HTML 存储)' }}
            </span>
          </div>
          <div class="footer-buttons">
            <n-button @click="visible = false">取消</n-button>
            <n-button type="primary" :loading="saving" @click="handleSave">
              {{ isEditMode ? '保存修改' : '确认入库' }}
            </n-button>
          </div>
        </div>
      </template>
    </n-drawer-content>
  </n-drawer>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import {
  NDrawer,
  NDrawerContent,
  NButton,
  NInput,
  NAutoComplete,
  NDatePicker,
  NTag,
  NTooltip,
  NModal,
  NForm,
  NFormItem,
  useMessage
} from 'naive-ui'
import dayjs from 'dayjs'
import DOMPurify from 'dompurify'

const props = defineProps({
  show: {
    type: Boolean,
    default: false
  },
  record: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['update:show', 'saved'])

const message = useMessage()
const saving = ref(false)
const editorRef = ref(null)
const isSourceMode = ref(false)
const rawHtmlContent = ref('')

const visible = computed({
  get: () => props.show,
  set: (val) => emit('update:show', val)
})

const isEditMode = computed(() => !!(props.record && props.record._id))

const form = ref({
  _id: '',
  timestamp: Date.now(),
  shanggexiangmu: '日常',
  chixushijian: '30m',
  ganshou: ''
})

// 默认常用分类选项
const defaultProjects = ['科研', '工作', '个人生活', '阅读思考', '健康运动', '复盘随笔']
const projectOptions = computed(() => {
  return defaultProjects.map((p) => ({ label: p, value: p }))
})

// 快捷时长
const quickDurations = ['15m', '30m', '45m', '1h', '2h']
const setDuration = (dur) => {
  form.value.chixushijian = dur
}

// 插入超链接弹窗状态
const showLinkModal = ref(false)
const linkForm = ref({ url: '', text: '' })
const savedSelectionRange = ref(null)

/**
 * 将纯文本或 HTML 规范转换为符合历史数据规范的标准 HTML
 */
const normalizeToHtml = (content) => {
  if (!content || !content.trim()) {
    return '<p><br></p>'
  }
  const str = content.trim()
  // 检测是否已经包含标准块级 HTML 标签
  if (/<(p|div|h[1-6]|ul|ol|blockquote|table)[\s>]/i.test(str)) {
    return str
  }
  // 纯文本按行拆分为标准段落
  return str
    .split(/\r?\n/)
    .map((line) => {
      const cleanLine = line.trim()
      return `<p>${cleanLine ? escapeHtml(cleanLine) : '<br>'}</p>`
    })
    .join('')
}

const escapeHtml = (text) => {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * 计算纯文字字数（剔除 HTML 标签与多余空格）
 */
const wordCount = computed(() => {
  const text = (rawHtmlContent.value || form.value.ganshou || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim()
  return text.length
})

// 同步富文本与表单状态
const syncContentToEditor = (html) => {
  const cleanHtml = normalizeToHtml(html)
  rawHtmlContent.value = cleanHtml
  form.value.ganshou = cleanHtml
  if (editorRef.value) {
    editorRef.value.innerHTML = cleanHtml
  }
}

// 监听 record 传入回显
watch(
  () => props.record,
  (newRec) => {
    if (newRec && typeof newRec === 'object') {
      const parsedTime = newRec.time ? new Date(newRec.time).getTime() : Date.now()
      form.value = {
        _id: newRec._id || '',
        timestamp: isNaN(parsedTime) ? Date.now() : parsedTime,
        shanggexiangmu: newRec.shanggexiangmu || '日常',
        chixushijian: newRec.chixushijian || '30m',
        ganshou: newRec.ganshou || newRec.content || ''
      }
    } else {
      // 新建模式
      form.value = {
        _id: '',
        timestamp: Date.now(),
        shanggexiangmu: '日常',
        chixushijian: '30m',
        ganshou: ''
      }
    }
    isSourceMode.value = false
    nextTick(() => {
      syncContentToEditor(form.value.ganshou)
    })
  },
  { immediate: true }
)

// 抽屉展开时自动聚焦与初始化
watch(
  () => props.show,
  (showing) => {
    if (showing) {
      nextTick(() => {
        syncContentToEditor(form.value.ganshou)
        if (editorRef.value && !isSourceMode.value) {
          editorRef.value.focus()
        }
      })
    }
  }
)

// 富文本输入监听
const handleEditorInput = () => {
  if (!editorRef.value) return
  let html = editorRef.value.innerHTML
  // 如果内容完全为空，重置为包含空行段落
  if (!html || html === '<br>' || html === '<div><br></div>') {
    html = '<p><br></p>'
  }
  rawHtmlContent.value = html
  form.value.ganshou = html
}

// 源码编辑模式输入监听
const handleSourceInput = () => {
  form.value.ganshou = rawHtmlContent.value
  if (editorRef.value) {
    editorRef.value.innerHTML = rawHtmlContent.value
  }
}

// 切换源码模式
const toggleSourceMode = () => {
  if (isSourceMode.value) {
    // 源码 -> 富文本
    syncContentToEditor(rawHtmlContent.value)
    isSourceMode.value = false
    nextTick(() => {
      editorRef.value?.focus()
    })
  } else {
    // 富文本 -> 源码
    handleEditorInput()
    isSourceMode.value = true
  }
}

// 执行富文本原生命令
const execCmd = (command, value = null) => {
  if (isSourceMode.value) return
  editorRef.value?.focus()
  document.execCommand(command, false, value)
  handleEditorInput()
}

// 执行段落块格式化 (h3, p, blockquote)
const execFormatBlock = (tag) => {
  if (isSourceMode.value) return
  editorRef.value?.focus()
  document.execCommand('formatBlock', false, tag)
  handleEditorInput()
}

// 超链接处理
const openLinkDialog = () => {
  if (isSourceMode.value) return
  const selection = window.getSelection()
  if (selection && selection.rangeCount > 0) {
    savedSelectionRange.value = selection.getRangeAt(0)
    linkForm.value.text = selection.toString().trim()
  } else {
    savedSelectionRange.value = null
    linkForm.value.text = ''
  }
  linkForm.value.url = ''
  showLinkModal.value = true
}

const handleConfirmLink = () => {
  if (!linkForm.value.url || !linkForm.value.url.trim()) {
    message.warning('请输入有效的链接地址')
    return false
  }

  editorRef.value?.focus()
  if (savedSelectionRange.value) {
    const selection = window.getSelection()
    selection.removeAllRanges()
    selection.addRange(savedSelectionRange.value)
  }

  const url = linkForm.value.url.trim()
  const text = linkForm.value.text.trim() || url

  if (document.getSelection()?.toString().trim()) {
    document.execCommand('createLink', false, url)
  } else {
    const linkHtml = `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color: #6186d5">${escapeHtml(text)}</a>`
    document.execCommand('insertHTML', false, linkHtml)
  }

  handleEditorInput()
  showLinkModal.value = false
  return true
}

// 保存逻辑
const handleSave = async () => {
  // 提取纯文本检测是否真正有输入
  const currentHtml = isSourceMode.value
    ? rawHtmlContent.value
    : editorRef.value?.innerHTML || form.value.ganshou

  const plainText = currentHtml.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim()
  if (!plainText) {
    message.warning('请输入日记内容或感受')
    editorRef.value?.focus()
    return
  }

  saving.value = true
  try {
    // 净化 HTML 防止恶意脚本注入，但保留历史富文本所需标签
    const sanitizedHtml = DOMPurify.sanitize(currentHtml, {
      ALLOWED_TAGS: [
        'p',
        'div',
        'span',
        'br',
        'strong',
        'b',
        'em',
        'i',
        'u',
        's',
        'strike',
        'h1',
        'h2',
        'h3',
        'h4',
        'blockquote',
        'ul',
        'ol',
        'li',
        'a'
      ],
      ALLOWED_ATTR: ['href', 'target', 'rel', 'style', 'class']
    })

    const formattedTime = dayjs(form.value.timestamp).format('YYYY-MM-DD HH:mm:ss')
    const recordPayload = {
      _id: form.value._id || `rec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      time: formattedTime,
      shanggexiangmu: (form.value.shanggexiangmu || '日常').trim(),
      chixushijian: (form.value.chixushijian || '未知时长').trim(),
      ganshou: sanitizedHtml
    }

    if (isEditMode.value) {
      // 更新已有日记
      if (window.assistant?.updateRecord) {
        const res = await window.assistant.updateRecord(recordPayload._id, {
          time: recordPayload.time,
          shanggexiangmu: recordPayload.shanggexiangmu,
          chixushijian: recordPayload.chixushijian,
          ganshou: recordPayload.ganshou
        })
        if (res && res.error) {
          throw new Error(res.error)
        }
      } else if (window.api?.saveData) {
        await window.api.saveData([recordPayload])
      } else if (window.electron?.ipcRenderer) {
        await window.electron.ipcRenderer.invoke('save-data', [recordPayload])
      }
      message.success('日记已更新')
    } else {
      // 写入新日记
      if (window.api?.saveData) {
        const res = await window.api.saveData([recordPayload])
        if (res && res.error) {
          throw new Error(res.error)
        }
      } else if (window.electron?.ipcRenderer) {
        const res = await window.electron.ipcRenderer.invoke('save-data', [recordPayload])
        if (res && res.error) {
          throw new Error(res.error)
        }
      }
      message.success('已成功记下一笔')
    }

    // 广播全局更新事件，通知看板与复盘实时更新
    window.dispatchEvent(
      new CustomEvent('journal-data-updated', {
        detail: { record: recordPayload }
      })
    )

    emit('saved', recordPayload)
    visible.value = false
  } catch (err) {
    console.error('[JournalEditorDrawer] Save error:', err)
    message.error(`保存失败: ${err.message || '未知错误'}`)
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.editor-drawer-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 12px;
}

/* 顶部次要元信息栏：紧凑优雅，不抢视觉 */
.metadata-strip {
  background: var(--n-color-embedded, rgba(140, 140, 160, 0.06));
  border: 1px solid var(--n-border-color, rgba(140, 140, 160, 0.18));
  border-radius: 8px;
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.meta-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.meta-label {
  font-size: 12px;
  color: var(--n-text-color-3, #8c8c99);
  white-space: nowrap;
  font-weight: 500;
}

.project-item {
  flex: 1.2;
  min-width: 140px;
}

.duration-item {
  flex: 0.9;
  min-width: 110px;
}

.time-item {
  flex: 1.4;
  min-width: 170px;
}

.meta-input {
  width: 100%;
}

.quick-duration-tags {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  margin-top: 2px;
}

.quick-label {
  font-size: 11px;
  color: var(--n-text-color-3, #999);
}

.quick-tag {
  cursor: pointer;
  user-select: none;
  font-size: 11px;
  padding: 0 6px;
}

/* 主体富文本编辑核心区：大幅放大 */
.editor-main-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--n-border-color, rgba(140, 140, 160, 0.22));
  border-radius: 8px;
  overflow: hidden;
  min-height: 480px;
  background: var(--n-color, #fff);
}

/* 富文本工具栏 */
.rich-toolbar {
  display: flex;
  align-items: center;
  padding: 6px 10px;
  background: var(--n-color-embedded, rgba(140, 140, 160, 0.05));
  border-bottom: 1px solid var(--n-border-color, rgba(140, 140, 160, 0.16));
  gap: 4px;
  user-select: none;
  flex-wrap: wrap;
}

.toolbar-group {
  display: flex;
  align-items: center;
  gap: 2px;
}

.toolbar-divider {
  width: 1px;
  height: 16px;
  background: var(--n-border-color, rgba(140, 140, 160, 0.25));
  margin: 0 4px;
}

.toolbar-spacer {
  flex: 1;
}

.tool-btn {
  background: transparent;
  border: 1px solid transparent;
  border-radius: 4px;
  padding: 3px 6px;
  font-size: 12px;
  color: var(--n-text-color, #333);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 26px;
  height: 26px;
  transition: all 0.15s ease;
  font-family: inherit;
}

.tool-btn:hover {
  background: var(--n-hover-color, rgba(140, 140, 160, 0.15));
  border-color: var(--n-border-color, rgba(140, 140, 160, 0.25));
}

.tool-btn:active {
  background: var(--n-pressed-color, rgba(140, 140, 160, 0.25));
}

.tool-btn.active {
  background: var(--n-primary-color-hover, #63e2b7);
  color: #fff;
}

.font-bold {
  font-weight: bold;
}

.font-italic {
  font-style: italic;
}

.font-underline {
  text-decoration: underline;
}

.font-strike {
  text-decoration: line-through;
}

.right-group {
  margin-left: auto;
  gap: 8px;
}

.word-counter {
  font-size: 11px;
  color: var(--n-text-color-3, #888);
}

.code-mode-btn {
  font-family: monospace;
  font-size: 11px;
  font-weight: 600;
}

/* 富文本可编辑内容区域 */
.rich-editor-content {
  flex: 1;
  padding: 16px;
  overflow-y: auto;
  font-size: 15px;
  line-height: 1.75;
  color: var(--n-text-color, #2c3e50);
  outline: none;
  min-height: 380px;
}

.rich-editor-content:empty::before {
  content: attr(data-placeholder);
  color: var(--n-text-color-3, #aaa);
  pointer-events: none;
  display: block;
}

/* 正文与排版标签内部样式，与已有日记渲染保持 100% 协调 */
.rich-editor-content :deep(p) {
  margin: 0 0 0.6em 0;
}

.rich-editor-content :deep(h3) {
  font-size: 1.15em;
  font-weight: 600;
  margin: 0.8em 0 0.4em 0;
  color: var(--n-text-color, #111);
}

.rich-editor-content :deep(blockquote) {
  margin: 0.6em 0;
  padding: 6px 12px;
  border-left: 3px solid var(--n-primary-color, #18a058);
  background: var(--n-color-embedded, rgba(140, 140, 160, 0.05));
  color: var(--n-text-color-2, #555);
  border-radius: 0 4px 4px 0;
}

.rich-editor-content :deep(ul),
.rich-editor-content :deep(ol) {
  margin: 0.4em 0 0.6em 1.2em;
  padding: 0;
}

.rich-editor-content :deep(li) {
  margin-bottom: 0.25em;
}

.rich-editor-content :deep(a) {
  color: #6186d5;
  text-decoration: underline;
}

/* 源码编辑 Textarea */
.source-editor-textarea {
  flex: 1;
  padding: 14px;
  font-family: 'Fira Code', Consolas, Monaco, monospace;
  font-size: 13px;
  line-height: 1.6;
  border: none;
  outline: none;
  resize: none;
  background: transparent;
  color: var(--n-text-color, #333);
}

/* 底部状态与操作栏 */
.drawer-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.format-indicator {
  font-size: 12px;
  color: var(--n-text-color-3, #999);
}

.footer-buttons {
  display: flex;
  align-items: center;
  gap: 10px;
}
</style>
