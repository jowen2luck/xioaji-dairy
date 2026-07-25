<template>
  <div class="markdown-body" v-html="renderedHtml"></div>
</template>

<script setup>
import { computed } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

// 配置 marked (保持简单，专注于文本解析)
marked.setOptions({
  breaks: true, // 开启换行符转<br>，这对AI回答很重要
  gfm: true,
})

const props = defineProps({
  content: {
    type: String,
    required: true,
    default: ''
  }
})

const renderedHtml = computed(() => {
  if (!props.content) return ''
  try {
    const raw = marked.parse(props.content)
    return DOMPurify.sanitize(raw, {
      ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|file):|data:image\/(?:png|jpe?g|gif|webp|svg\+xml);base64,|\/|\.\/|\.\.\/|#)/i,
    })
  } catch (error) {
    return `<p>解析出错</p>`
  }
})
</script>

<style scoped>
/* ============================================
   核心阅读体验变量 (推荐放在全局 CSS 中，这里演示用)
   ============================================ */
.markdown-body {
  /* 字体与排版 */
  --md-font-size: 16px;       /* 正文从 14px 提升到 16px，提升易读性 */
  --md-line-height: 1.8;      /* 1.8 倍行高，让文字更透气 */
  
  /* 颜色 (适配深色模式，你可以根据你的项目变量替换) */
  --md-text-primary: var(--color-text, #1f2937);
  --md-text-secondary: var(--color-text-secondary, #4b5563);
  --md-accent: var(--color-button-primary, #3b82f6);
  --md-bg-block: var(--color-background-mute, #f3f4f6);
  --md-border: var(--color-border, #e5e7eb);
  --md-code-bg: var(--color-background-mute, #f3f4f6);
  --md-code-text: var(--color-text, #1f2937);
}

/* 容器基础样式 */
.markdown-body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  font-size: var(--md-font-size);
  line-height: var(--md-line-height);
  color: var(--md-text-primary);
  text-align: left;
  word-wrap: break-word;
}

/* ============================================
   1. 解决“拥挤”感：段落与间距
   ============================================ */
/* 每一个块级元素都有充足的底部间距 */
.markdown-body :deep(p),
.markdown-body :deep(ul),
.markdown-body :deep(ol),
.markdown-body :deep(blockquote),
.markdown-body :deep(pre),
.markdown-body :deep(table) {
  margin-bottom: 1.5em; /* 约 24px 的间距 */
}

/* 最后一个元素去除间距 */
.markdown-body :deep(*:last-child) {
  margin-bottom: 0;
}

/* ============================================
   2. 增强标题层级 (让结构更清晰)
   ============================================ */
.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3),
.markdown-body :deep(h4) {
  margin-top: 2em; /* 标题上方留出大片空白，区分章节 */
  margin-bottom: 0.8em;
  font-weight: 600;
  line-height: 1.3;
  color: var(--md-text-primary);
}

.markdown-body :deep(h1) { font-size: 1.75em; border-bottom: 1px solid var(--md-border); padding-bottom: 0.3em; }
.markdown-body :deep(h2) { font-size: 1.5em; }
.markdown-body :deep(h3) { font-size: 1.25em; color: var(--md-text-primary); }

/* 紧接在标题后的段落稍微拉近一点，增强关联感 */
.markdown-body :deep(h1) + p,
.markdown-body :deep(h2) + p,
.markdown-body :deep(h3) + p {
  margin-top: -0.4em;
}

/* ============================================
   3. 列表优化 (针对你截图中的大量列表)
   ============================================ */
.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  padding-left: 1.5em; /* 足够的左侧缩进 */
}

/* 列表项之间增加间距，这是解决拥挤感的关键！ */
.markdown-body :deep(li) {
  margin-bottom: 0.5em; /* 列表项之间有 8px 左右空隙 */
  position: relative;
}

/* 列表内的段落，消除多余边距 */
.markdown-body :deep(li > p) {
  margin-bottom: 0.5em;
}

/* 嵌套列表的处理 */
.markdown-body :deep(ul ul),
.markdown-body :deep(ul ol),
.markdown-body :deep(ol ul),
.markdown-body :deep(ol ol) {
  margin-top: 0.5em;
  margin-bottom: 0;
}

/* 自定义列表标记颜色 (可选，增加精致感) */
.markdown-body :deep(ul li::marker) {
  color: var(--md-text-secondary);
}

/* ============================================
   4. 重点信息强调
   ============================================ */
.markdown-body :deep(strong) {
  font-weight: 700;
  color: var(--md-text-primary);
}

.markdown-body :deep(a) {
  color: var(--md-accent);
  text-decoration: none;
  border-bottom: 1px solid transparent;
  transition: border-bottom 0.2s;
}
.markdown-body :deep(a:hover) {
  border-bottom-color: var(--md-accent);
}

/* ============================================
   5. 引用块 (AI 常用的总结样式)
   ============================================ */
.markdown-body :deep(blockquote) {
  padding: 16px 20px;
  background: var(--md-bg-block); /* 轻微的背景色 */
  border-left: 4px solid var(--md-accent);
  border-radius: 4px; /* 增加圆角 */
  color: var(--md-text-secondary); /* 引用文字稍微淡一点 */
  font-style: normal; /* 取消斜体，现在的趋势是正体更易读 */
}

/* 引用块内部的段落去除 margin，防止撑大 */
.markdown-body :deep(blockquote p) {
  margin-bottom: 0.5em;
}
.markdown-body :deep(blockquote p:last-child) {
  margin-bottom: 0;
}

/* ============================================
   6. 简单的代码行内样式
   ============================================ */
.markdown-body :deep(code) {
  font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
  font-size: 0.9em;
  padding: 0.2em 0.4em;
  border-radius: 4px;
  background: var(--md-code-bg);
  color: var(--md-code-text);
}
</style>
