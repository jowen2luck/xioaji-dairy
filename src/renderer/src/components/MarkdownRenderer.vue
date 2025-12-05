<template>
  <div class="markdown-content" v-html="renderedHtml"></div>
</template>

<script setup>
import { computed } from 'vue'
import { marked } from 'marked'
import hljs from 'highlight.js'
import DOMPurify from 'dompurify'

// 配置 marked 选项
marked.setOptions({
  breaks: true,
  gfm: true,
  pedantic: false,
  mangle: false,
})

// 设置代码高亮
marked.setOptions({
  highlight: (code, lang) => {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(code, { language: lang }).value
      } catch (e) {
        return code
      }
    }
    return code
  }
})

const props = defineProps({
  content: {
    type: String,
    required: true
  }
})

// 解析并渲染 Markdown
const renderedHtml = computed(() => {
  if (!props.content) return ''
  try {
    // 使用 marked 解析 Markdown
    let html = marked.parse(props.content)
    // 使用 DOMPurify 清理 HTML 防止 XSS
    html = DOMPurify.sanitize(html)
    return html
  } catch (error) {
    console.error('Markdown 解析错误:', error)
    // 如果解析失败，返回文本内容
    return `<p>${DOMPurify.sanitize(props.content)}</p>`
  }
})
</script>

<style scoped>
/* Markdown 内容样式 */
.markdown-content {
  color: var(--text-main, #334155);
  font-size: 14px;
  line-height: 1.8;
  word-break: break-word;
}

/* 段落 */
.markdown-content :deep(p) {
  margin: 0 0 8px 0;
  color: inherit;
}

.markdown-content :deep(p:last-child) {
  margin-bottom: 0;
}

/* 标题 */
.markdown-content :deep(h1),
.markdown-content :deep(h2),
.markdown-content :deep(h3),
.markdown-content :deep(h4),
.markdown-content :deep(h5),
.markdown-content :deep(h6) {
  margin: 12px 0 8px 0;
  font-weight: 600;
  color: var(--text-main, #334155);
  line-height: 1.4;
}

.markdown-content :deep(h1) {
  font-size: 18px;
}

.markdown-content :deep(h2) {
  font-size: 16px;
}

.markdown-content :deep(h3) {
  font-size: 15px;
}

.markdown-content :deep(h4),
.markdown-content :deep(h5),
.markdown-content :deep(h6) {
  font-size: 14px;
}

/* 列表 */
.markdown-content :deep(ul),
.markdown-content :deep(ol) {
  margin: 8px 0;
  padding-left: 24px;
}

.markdown-content :deep(li) {
  margin: 4px 0;
  color: inherit;
}

.markdown-content :deep(ul li::marker) {
  color: var(--accent-color, #6366f1);
}

/* 代码块 */
.markdown-content :deep(pre) {
  background: rgba(99, 102, 241, 0.08);
  border: 1px solid rgba(99, 102, 241, 0.2);
  border-radius: 6px;
  padding: 12px;
  margin: 8px 0;
  overflow-x: auto;
  font-family: 'Fira Code', 'Monaco', 'Consolas', monospace;
  font-size: 12px;
  line-height: 1.6;
}

[data-theme="dark"] .markdown-content :deep(pre) {
  background: #1e293b;
  border-color: #475569;
}

.markdown-content :deep(code) {
  font-family: 'Fira Code', 'Monaco', 'Consolas', monospace;
  font-size: 12px;
}

/* 行内代码 */
.markdown-content :deep(p code),
.markdown-content :deep(li code) {
  background: rgba(99, 102, 241, 0.1);
  border-radius: 3px;
  padding: 2px 6px;
  color: #6366f1;
}

[data-theme="dark"] .markdown-content :deep(p code),
[data-theme="dark"] .markdown-content :deep(li code) {
  background: rgba(99, 102, 241, 0.2);
  color: #a5b4fc;
}

/* 引用块 */
.markdown-content :deep(blockquote) {
  border-left: 4px solid var(--accent-color, #6366f1);
  background: rgba(99, 102, 241, 0.06);
  padding: 8px 12px;
  margin: 8px 0;
  border-radius: 4px;
  color: var(--text-sec, #64748b);
  font-style: italic;
}

[data-theme="dark"] .markdown-content :deep(blockquote) {
  background: rgba(99, 102, 241, 0.12);
  border-left-color: #818cf8;
}

.markdown-content :deep(blockquote p) {
  margin: 0;
}

/* 分割线 */
.markdown-content :deep(hr) {
  border: none;
  border-top: 1px dashed var(--text-light, #94a3b8);
  margin: 12px 0;
}

/* 表格 */
.markdown-content :deep(table) {
  border-collapse: collapse;
  width: 100%;
  margin: 8px 0;
  font-size: 13px;
}

.markdown-content :deep(th),
.markdown-content :deep(td) {
  border: 1px solid rgba(99, 102, 241, 0.2);
  padding: 8px 12px;
  text-align: left;
}

.markdown-content :deep(th) {
  background: rgba(99, 102, 241, 0.1);
  font-weight: 600;
  color: var(--text-main, #334155);
}

.markdown-content :deep(tr:hover) {
  background: rgba(99, 102, 241, 0.05);
}

[data-theme="dark"] .markdown-content :deep(th),
[data-theme="dark"] .markdown-content :deep(td) {
  border-color: #475569;
}

[data-theme="dark"] .markdown-content :deep(th) {
  background: rgba(99, 102, 241, 0.2);
}

[data-theme="dark"] .markdown-content :deep(tr:hover) {
  background: rgba(99, 102, 241, 0.1);
}

/* 链接 */
.markdown-content :deep(a) {
  color: #6366f1;
  text-decoration: none;
  border-bottom: 1px solid transparent;
  transition: all 0.2s;
}

.markdown-content :deep(a:hover) {
  border-bottom-color: #6366f1;
  text-decoration: underline;
}

[data-theme="dark"] .markdown-content :deep(a) {
  color: #a5b4fc;
}

[data-theme="dark"] .markdown-content :deep(a:hover) {
  border-bottom-color: #a5b4fc;
}

/* 强调 */
.markdown-content :deep(strong) {
  font-weight: 600;
  color: var(--text-main, #334155);
}

.markdown-content :deep(em) {
  font-style: italic;
  color: var(--text-sec, #64748b);
}

/* 代码高亮主题 */
.markdown-content :deep(pre code) {
  color: var(--text-main, #334155);
}

/* 针对深色主题的调整 */
[data-theme="dark"] .markdown-content :deep(pre code) {
  color: #e2e8f0;
}
</style>
