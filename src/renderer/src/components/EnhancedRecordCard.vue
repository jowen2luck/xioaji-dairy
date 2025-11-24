<template>
  <div 
    :class="['enhanced-record-card', { 'is-compact': compact }]"
    :style="cardStyle"
  >
    <!-- 如果没有 AI 元数据，显示待分析占位符 -->
    <div v-if="!record._ai_meta" class="placeholder-state">
      <n-space vertical align="center" :size="12">
        <n-icon size="32" :component="SparklesOutline" color="#d0d0d0" />
        <n-text depth="3">待 AI 分析</n-text>
        <n-button size="tiny" tertiary @click="$emit('request-analysis', record)">
          立即分析
        </n-button>
      </n-space>
    </div>

    <!-- 有 AI 元数据时的完整展示 -->
    <n-space v-else vertical :size="compact ? 8 : 12" class="card-content">
      
      <!-- 维度一：元数据分析 (Meta Analysis) -->
      <div class="meta-section">
        <n-space justify="space-between" align="center">
          <!-- 内容体裁标签 -->
          <n-tag 
            :type="getContentTypeColor(record._ai_meta.content_type)" 
            size="small"
            :bordered="false"
          >
            {{ getContentTypeLabel(record._ai_meta.content_type) }}
          </n-tag>
          
          <!-- 时间 -->
          <n-time 
            v-if="record.time" 
            :time="new Date(record.time)" 
            type="relative"
            class="card-time"
          />
        </n-space>
        
        <!-- 摘要（醒目） -->
        <div class="summary-text">{{ record._ai_meta.summary }}</div>
      </div>

      <!-- 维度二：场景行为 (Activity Context) -->
      <div v-if="!compact || showAllInCompact" class="activity-section">
        <n-space :size="6" wrap class="activity-tags">
          <!-- 核心动作 -->
          <n-tag v-if="record._ai_meta.main_action" type="default" size="small">
            <template #icon><n-icon :component="PlayCircleOutline" /></template>
            {{ record._ai_meta.main_action }}
          </n-tag>
          
          <!-- 涉及人物 -->
          <n-tag 
            v-for="person in (record._ai_meta.people_involved || []).slice(0, 3)" 
            :key="person"
            type="default" 
            size="small"
          >
            <template #icon><n-icon :component="PersonOutline" /></template>
            {{ person }}
          </n-tag>
          
          <!-- 实体 -->
          <n-tag 
            v-for="item in (record._ai_meta.items || []).slice(0, 3)" 
            :key="item"
            type="info" 
            size="small"
          >
            <template #icon><n-icon :component="CubeOutline" /></template>
            {{ item }}
          </n-tag>
        </n-space>
        
        <!-- 交互性质（如果存在） -->
        <n-text v-if="record._ai_meta.interaction" depth="3" class="interaction-text">
          💬 {{ record._ai_meta.interaction }}
        </n-text>
      </div>

      <!-- 维度三：情绪归因 (Emotional Profile) -->
      <div class="emotion-section">
        <n-space :size="8" wrap align="center">
          <!-- 情绪标签 -->
          <n-tag
            v-for="mood in record._ai_meta.mood_tags || []"
            :key="mood"
            :type="getMoodTagType(mood)"
            size="small"
            round
            @click="$emit('tag-click', 'mood', mood)"
            class="mood-tag"
          >
            {{ mood }}
          </n-tag>
          
          <!-- 能量值 -->
          <n-tag 
            v-if="typeof record._ai_meta.energy_level === 'number'" 
            :type="getEnergyType(record._ai_meta.energy_level)" 
            size="small" 
            round
            @click="$emit('tag-click', 'energy', record._ai_meta.energy_level)"
          >
            <template #icon><n-icon :component="FlashOutline" /></template>
            能量 {{ record._ai_meta.energy_level }}/10
          </n-tag>
        </n-space>
        
        <!-- 情绪归因 -->
        <n-text v-if="record._ai_meta.root_cause" depth="3" class="root-cause-text">
          💡 {{ record._ai_meta.root_cause }}
        </n-text>
      </div>

      <!-- 维度四：智慧资产 (Intellectual Assets) -->
      <div 
        v-if="showQuotes && record._ai_meta.key_quotes && record._ai_meta.key_quotes.length > 0" 
        class="wisdom-section"
      >
        <n-collapse>
          <n-collapse-item title="💬 智慧资产" name="quotes">
            <div class="quotes-container">
              <blockquote 
                v-for="(quote, index) in record._ai_meta.key_quotes" 
                :key="index"
                class="quote-block"
              >
                {{ quote }}
              </blockquote>
            </div>
          </n-collapse-item>
        </n-collapse>
      </div>

      <!-- 原始信息：持续时间 + 项目 -->
      <n-space :size="12" class="meta-info">
        <n-text depth="3" size="small">
          ⏱️ {{ record.chixushijian || '未知时长' }}
        </n-text>
        <n-text depth="3" size="small">
          📁 {{ record.shanggexiangmu || '未分类' }}
        </n-text>
      </n-space>
    </n-space>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { 
  SparklesOutline,
  PlayCircleOutline,
  PersonOutline,
  CubeOutline,
  FlashOutline
} from '@vicons/ionicons5'

// Props 定义
const props = defineProps({
  record: {
    type: Object,
    required: true
  },
  compact: {
    type: Boolean,
    default: false
  },
  showQuotes: {
    type: Boolean,
    default: true
  },
  showAllInCompact: {
    type: Boolean,
    default: false
  }
})

// Emits 定义
const emit = defineEmits(['tag-click', 'request-analysis'])

// 计算属性：卡片样式
const cardStyle = computed(() => ({
  minHeight: props.compact ? '120px' : '180px'
}))

// 内容体裁颜色映射
const getContentTypeColor = (type) => {
  const colorMap = {
    'DailyLog': 'default',
    'Reflection': 'success',
    'Letter': 'warning',
    'Idea': 'info'
  }
  return colorMap[type] || 'default'
}

// 内容体裁标签文本
const getContentTypeLabel = (type) => {
  const labelMap = {
    'DailyLog': '📄 日常',
    'Reflection': '💭 感悟',
    'Letter': '✉️ 书信',
    'Idea': '💡 灵感'
  }
  return labelMap[type] || type
}

// 情绪标签类型（根据情绪词判断正负面）
const getMoodTagType = (mood) => {
  const positiveKeywords = ['满足', '开心', '愉快', '兴奋', '自豪', '成就感', '心流', '专注', '充实', '放松', '确幸', '温暖', '坚定']
  const negativeKeywords = ['焦虑', '沮丧', '难过', '失望', '孤独', '烦躁', '愤怒', '疲惫', '无奈', '挫败', '不安', '压力']
  
  if (positiveKeywords.includes(mood)) return 'success'
  if (negativeKeywords.includes(mood)) return 'error'
  return 'warning'
}

// 能量值类型
const getEnergyType = (level) => {
  if (level >= 8) return 'success'
  if (level >= 5) return 'info'
  if (level >= 3) return 'warning'
  return 'error'
}
</script>

<style scoped>
/* ==================== 卡片容器 ==================== */
.enhanced-record-card {
  position: relative;
  background: var(--n-color);
  border: 1px solid var(--n-border-color);
  border-radius: 8px;
  padding: 16px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  cursor: default;
}

.enhanced-record-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  border-color: var(--n-border-color-hover);
  transform: translateY(-2px);
}

.enhanced-record-card.is-compact {
  padding: 12px;
}

/* ==================== 待分析占位符 ==================== */
.placeholder-state {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 150px;
  color: var(--n-text-color-disabled);
}

/* ==================== 维度一：元数据分析 ==================== */
.meta-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.card-time {
  font-size: 12px;
  color: var(--n-text-color-3);
}

.summary-text {
  font-size: 15px;
  font-weight: 600;
  line-height: 1.5;
  color: var(--n-text-color-1);
  background: linear-gradient(to right, rgba(24, 160, 88, 0.08), transparent);
  padding: 8px 12px;
  border-radius: 6px;
  border-left: 3px solid var(--n-color-target);
}

/* ==================== 维度二：场景行为 ==================== */
.activity-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.activity-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.interaction-text {
  font-size: 13px;
  font-style: italic;
  padding-left: 4px;
}

/* ==================== 维度三：情绪归因 ==================== */
.emotion-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mood-tag {
  cursor: pointer;
  transition: transform 0.2s;
}

.mood-tag:hover {
  transform: scale(1.05);
}

.root-cause-text {
  font-size: 13px;
  padding: 6px 10px;
  background: rgba(255, 193, 7, 0.1);
  border-radius: 4px;
  border-left: 2px solid #ffc107;
}

/* ==================== 维度四：智慧资产 ==================== */
.wisdom-section {
  margin-top: 4px;
}

.quotes-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.quote-block {
  margin: 0;
  padding: 8px 12px;
  background: linear-gradient(to right, rgba(255, 215, 0, 0.1), transparent);
  border-left: 3px solid gold;
  border-radius: 4px;
  font-size: 14px;
  font-style: italic;
  line-height: 1.6;
  color: var(--n-text-color-2);
}

/* ==================== 原始信息 ==================== */
.meta-info {
  padding-top: 8px;
  border-top: 1px dashed var(--n-divider-color);
}

/* ==================== 响应式调整 ==================== */
@media (max-width: 768px) {
  .summary-text {
    font-size: 14px;
  }
  
  .activity-tags,
  .emotion-section {
    font-size: 12px;
  }
}
</style>
