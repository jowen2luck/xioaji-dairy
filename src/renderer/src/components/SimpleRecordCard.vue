<template>
  <div 
    class="record-card" 
    :class="{ 'is-compact': compact }"
    :style="cardStyle"
  >
    <!-- 顶部 Header: 时间与类型 -->
    <div class="card-header">
      <div class="header-left">
        <n-tag 
          type="info"
          size="small" 
          round
          :bordered="false"
          class="type-tag"
        >
          {{ record.shanggexiangmu || '未分类' }}
        </n-tag>
        <span class="separator">|</span>
        <span class="time-text">
          {{ formatTime(record.time) }}
        </span>
      </div>
    </div>

    <!-- 核心内容区: 正文 -->
    <div class="card-body">
      <MarkdownRenderer v-if="record.ganshou" :content="record.ganshou" class="content-block" />
    </div>

    <!-- 底部 Footer: 技术元数据 -->
    <div class="card-footer">
      <div class="footer-info">
        <n-icon :component="TimeOutline" depth="3" />
        <span>{{ record.chixushijian || '未知时长' }}</span>
      </div>
    </div>

  </div>
</template>

<script setup>
import { computed } from 'vue'
import { formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import MarkdownRenderer from './MarkdownRenderer.vue'
import { TimeOutline } from '@vicons/ionicons5'

const props = defineProps({
  record: { type: Object, required: true },
  compact: { type: Boolean, default: false }
})

const cardStyle = computed(() => ({
  // 动态样式可选
}))

// 格式化时间
const formatTime = (timeStr) => {
  if (!timeStr) return ''
  try {
    const date = new Date(timeStr)
    return formatDistanceToNow(date, { addSuffix: true, locale: zhCN })
  } catch (e) { return timeStr }
}
</script>

<style scoped>
/* 定义变量，优先使用主题提供的 CSS 变量 */
.record-card {
  --card-bg: var(--color-card-bg, #ffffff);
  --card-border: var(--color-border, #eef2f6);
  --text-main: var(--color-text, #334155);
  --text-sec: var(--color-text-secondary, #64748b);
  --text-light: var(--color-text-light, rgba(0, 0, 0, 0.45)); /* 从主题变量获取 */
  --accent-color: #6366f1;
  
  position: relative;
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: 16px;
  padding: 0;
  margin-bottom: 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.record-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
  border-color: rgba(99, 102, 241, 0.2);
}

[data-theme="dark"] .record-card:hover {
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
  border-color: rgba(129, 140, 248, 0.3);
}

.card-container {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.is-compact .card-container {
  padding: 14px;
  gap: 10px;
}

/* ================= 头部设计 ================= */
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px dashed var(--card-border);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.separator {
  color: var(--card-border);
  font-size: 12px;
}

.time-text {
  font-size: 13px;
  color: var(--text-light);
  font-weight: 500;
}

/* ================= 内容区 ================= */
.card-body {
  padding: 0 20px;
  display: flex;
  flex-direction: column;
  gap: 0;
  flex: 1;
  min-height: 60px;
}

.content-block {
  font-size: 14px;
  line-height: 1.8;
  color: var(--text-main);
  padding: 12px;
  background: transparent;
  border-radius: 6px;
  word-break: break-word;
  white-space: pre-wrap;
  /* 自子稠计样式 */
}

/* ================= 底部 Footer ================= */
.card-footer {
  display: flex;
  gap: 16px;
  padding: 12px 20px;
  border-top: 1px dashed var(--card-border);
}

.footer-info {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--text-light);
}
</style>
