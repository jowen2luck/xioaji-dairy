<template>
  <n-card 
    :hoverable="hoverable" 
    :class="{ 'record-card': true, 'clickable': clickable }"
    @click="handleClick"
  >
    <n-space vertical :size="12">
      <n-space justify="space-between" align="center">
        <n-tag type="info" size="small">
          {{ record.shanggexiangmu || '未分类' }}
        </n-tag>
        <n-time 
          v-if="record.time" 
          :time="new Date(record.time)" 
          format="yyyy-MM-dd HH:mm"
          type="datetime"
        />
      </n-space>

      <n-text depth="3" :style="{ fontSize: '13px' }">
        持续时间: {{ record.chixushijian || '-' }}
      </n-text>

      <n-divider style="margin: 8px 0" />

      <div class="record-content" v-html="formatThoughts(record.ganshou)"></div>

      <!-- 基础元数据展示 -->
      <n-space v-if="record._meta_weekday || record._meta_time_range" :size="8">
        <n-tag v-if="record._meta_weekday" size="small" :bordered="false">
          {{ record._meta_weekday }}
        </n-tag>
        <n-tag v-if="record._meta_time_range" size="small" :bordered="false">
          {{ record._meta_time_range }}
        </n-tag>
        <n-tag v-if="record._meta_duration_min" size="small" :bordered="false">
          {{ record._meta_duration_min }} 分钟
        </n-tag>
      </n-space>

      <!-- 提示 AI 增强可用 -->
      <n-alert v-if="showAiMeta && !record._ai_meta" type="info" :bordered="false" size="small">
        点击"一键整理"启用 AI 深度分析
      </n-alert>
    </n-space>
  </n-card>
</template>

<script setup>
import { NCard, NSpace, NTag, NTime, NText, NDivider, NAlert } from 'naive-ui'

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

const emit = defineEmits(['click', 'tag-click'])

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
  transition: all 0.3s ease;
}

.record-card.clickable {
  cursor: pointer;
}

.record-card.clickable:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.record-content {
  line-height: 1.6;
  color: var(--n-text-color);
  font-size: 14px;
  max-height: 200px;
  overflow: hidden;
  position: relative;
}

.record-content::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 40px;
  background: linear-gradient(to bottom, transparent, var(--n-color));
  pointer-events: none;
}
</style>
