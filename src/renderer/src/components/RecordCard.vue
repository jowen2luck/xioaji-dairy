<template>
  <div 
    :class="['record-card', { 'clickable': clickable, 'is-hoverable': hoverable }]"
    @click="handleClick"
  >
    <div 
      class="card-accent-bar" 
      :style="{ backgroundColor: getProjectStyle(record.shanggexiangmu).color }"
    ></div>
    <div class="card-inner-body">
      <!-- 顶部信息栏 -->
      <div class="card-top-bar">
        <div 
          class="project-badge"
          :style="{ 
            backgroundColor: getProjectStyle(record.shanggexiangmu).bg,
            color: getProjectStyle(record.shanggexiangmu).color 
          }"
        >
          <span 
            class="project-dot" 
            :style="{ backgroundColor: getProjectStyle(record.shanggexiangmu).color }"
          ></span>
          <span>{{ record.shanggexiangmu || '生活手账' }}</span>
        </div>

        <div class="card-top-actions">
          <div class="time-text" v-if="record.time">
            <span class="calendar-icon">📅</span>
            <n-time 
              :time="new Date(record.time)" 
              format="yyyy-MM-dd HH:mm"
              type="datetime"
            />
          </div>
          <n-button 
            quaternary 
            circle 
            size="tiny" 
            title="复制原文" 
            class="copy-action-btn"
            @click.stop="handleCopyOriginal"
          >
            <template #icon>
              <n-icon size="14"><CopyOutline /></n-icon>
            </template>
          </n-button>
          <n-button 
            quaternary 
            circle 
            size="tiny" 
            title="编辑日记" 
            class="edit-action-btn"
            @click.stop="$emit('edit', record)"
          >
            <template #icon>
              <n-icon size="14"><CreateOutline /></n-icon>
            </template>
          </n-button>
        </div>
      </div>

      <!-- 持续时间 -->
      <div v-if="record.chixushijian && record.chixushijian !== '未知时长'" class="duration-badge">
        <span>⏱️ 持续 {{ record.chixushijian }}</span>
      </div>

      <div class="record-content-wrapper">
        <div class="record-content" v-html="formatThoughts(record.ganshou)"></div>
      </div>

      <!-- 基础元数据展示 -->
      <div class="meta-tags-container" v-if="record._meta_weekday || record._meta_time_range || record._meta_duration_min">
        <span v-if="record._meta_weekday" class="custom-meta-tag">{{ record._meta_weekday }}</span>
        <span v-if="record._meta_time_range" class="custom-meta-tag">{{ record._meta_time_range }}</span>
        <span v-if="record._meta_duration_min" class="custom-meta-tag">{{ record._meta_duration_min }} 分钟</span>
      </div>

      <!-- 提示 AI 增强可用 -->
      <div v-if="showAiMeta && !record._ai_meta" class="ai-prompt-box">
        <span class="sparkle-emoji">✨</span>
        <span>点击顶部“一键整理”可启用小鸡 AI 深度分析</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { NTime, NButton, NIcon, useMessage } from 'naive-ui'
import { CreateOutline, CopyOutline } from '@vicons/ionicons5'
import { copyTextToClipboard, extractPlainText } from '../utils/clipboard.js'

const props = defineProps({
  record: {
    type: Object,
    required: true
  },
  hoverable: {
    type: Boolean,
    default: true
  },
  clickable: {
    type: Boolean,
    default: false
  },
  showAiMeta: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['click', 'tag-click', 'edit'])
const message = useMessage()

const handleCopyOriginal = async () => {
  const rawContent = props.record.ganshou || props.record.content || ''
  const plainText = extractPlainText(rawContent)
  if (!plainText) {
    message?.warning('日记内容为空，无可复制内容')
    return
  }
  const success = await copyTextToClipboard(plainText)
  if (success) {
    message?.success('已复制日记原文')
  } else {
    message?.error('复制失败，请重试')
  }
}

const PROJECT_PALETTE = [
  { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.12)' }, // 暖橙 / Amber
  { color: '#10b981', bg: 'rgba(16, 185, 129, 0.12)' }, // 翠绿 / Emerald
  { color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.12)' }, // 蔚蓝 / Blue
  { color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.12)' }, // 紫罗兰 / Purple
  { color: '#ec4899', bg: 'rgba(236, 72, 153, 0.12)' }, // 浅粉 / Pink
  { color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.12)' }, // 青色 / Cyan
]

const getProjectStyle = (projectName) => {
  if (!projectName) return PROJECT_PALETTE[0]
  let hash = 0
  for (let i = 0; i < projectName.length; i++) {
    hash = (hash << 5) - hash + projectName.charCodeAt(i)
    hash |= 0
  }
  const idx = Math.abs(hash) % PROJECT_PALETTE.length
  return PROJECT_PALETTE[idx]
}

const formatThoughts = (thoughts) => {
  if (!thoughts) return ''
  return String(thoughts).replace(/\n/g, '<br>')
}

const handleClick = () => {
  if (props.clickable) {
    emit('click', props.record)
  }
}
</script>

<style scoped>
.record-card {
  position: relative;
  display: flex;
  background: var(--color-card-bg, #ffffff);
  border: 1px solid var(--color-border, rgba(220, 226, 235, 0.65));
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.03);
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.record-card.clickable {
  cursor: pointer;
}

.record-card.is-hoverable:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.07);
  border-color: rgba(245, 166, 35, 0.4);
}

.card-accent-bar {
  width: 4px;
  flex-shrink: 0;
  transition: width 0.2s ease;
}

.record-card:hover .card-accent-bar {
  width: 6px;
}

.card-inner-body {
  flex: 1;
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}

.card-top-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.project-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  border-radius: 12px;
  font-size: 12.5px;
  font-weight: 600;
  letter-spacing: 0.2px;
}

.project-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.card-top-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.time-text {
  font-size: 12px;
  color: var(--color-text-secondary, #9ca3af);
  display: flex;
  align-items: center;
  gap: 4px;
}

.calendar-icon {
  font-size: 12px;
}

.copy-action-btn,
.edit-action-btn {
  opacity: 0.6;
  transition: opacity 0.2s ease, transform 0.15s ease;
}

.copy-action-btn:hover,
.edit-action-btn:hover {
  opacity: 1;
  transform: scale(1.1);
}

.duration-badge {
  font-size: 11.5px;
  color: var(--color-text-secondary, #6b7280);
}

.record-content-wrapper {
  position: relative;
}

.record-content {
  line-height: 1.65;
  color: var(--color-text, #1f2937);
  font-size: 13.5px;
  max-height: 180px;
  overflow: hidden;
  word-break: break-word;
}

.record-content-wrapper::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 28px;
  background: linear-gradient(to bottom, transparent, var(--color-card-bg, #ffffff));
  pointer-events: none;
}

.meta-tags-container {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 2px;
}

.custom-meta-tag {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 6px;
  background: var(--color-background-soft, rgba(125, 125, 125, 0.08));
  color: var(--color-text-secondary, #6b7280);
}

.ai-prompt-box {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  color: #b45309;
  background: rgba(245, 166, 35, 0.1);
  padding: 6px 12px;
  border-radius: 8px;
  border: 1px dashed rgba(245, 166, 35, 0.35);
}

.sparkle-emoji {
  font-size: 12px;
}
</style>
